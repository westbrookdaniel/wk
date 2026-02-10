import * as path from "node:path";
import * as os from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";

// -----------------------------
// tiny arg parser
// -----------------------------
type Args = {
  _: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) {
      out._.push(a);
      continue;
    }

    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }

    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        const k = a.slice(2, eq);
        const v = a.slice(eq + 1);
        out.flags[k] = v;
      } else {
        const k = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          out.flags[k] = next;
          i++;
        } else {
          out.flags[k] = true;
        }
      }
      continue;
    }

    // short flags: -v or -abc (booleans)
    const shorts = a.slice(1).split("");
    for (const s of shorts) out.flags[s] = true;
  }

  return out;
}

function flagStr(args: Args, key: string, fallback?: string) {
  const v = args.flags[key];
  if (typeof v === "string") return v;
  return fallback;
}

function flagBool(args: Args, key: string, fallback = false) {
  const v = args.flags[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return fallback;
}

// -----------------------------
// helpers
// -----------------------------
function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function run(cmd: string[], opts?: { cwd?: string; quiet?: boolean }) {
  const p = Bun.spawnSync(cmd, {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = (
    p.stdout ? Buffer.from(p.stdout).toString("utf8") : ""
  ).trimEnd();
  const stderr = (
    p.stderr ? Buffer.from(p.stderr).toString("utf8") : ""
  ).trimEnd();

  if (p.exitCode !== 0) {
    if (!opts?.quiet) {
      if (stdout) console.error(stdout);
      if (stderr) console.error(stderr);
    }
    throw new Error(`Command failed (${p.exitCode}): ${cmd.join(" ")}`);
  }

  return { stdout, stderr, exitCode: p.exitCode };
}

function git(cwd: string, args: string[], quiet?: boolean) {
  return run(["git", ...args], { cwd, quiet });
}

function resolveRepoRoot(repoArg?: string): string {
  const cwd = repoArg ? path.resolve(repoArg) : process.cwd();
  try {
    const r = git(cwd, ["rev-parse", "--show-toplevel"], true).stdout.trim();
    if (!r) die("Could not determine repo root.");
    return r;
  } catch {
    die("Not inside a git repository (or --repo is not a git repo).");
  }
}

function defaultDepot(): string {
  return path.join(os.homedir(), ".worktrees");
}

function repoIdFromRoot(repoRoot: string): string {
  // stable + collision-resistant
  const h = createHash("sha1").update(repoRoot).digest("hex").slice(0, 10);
  const base = path.basename(repoRoot).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${base}-${h}`;
}

function worktreePath(depot: string, repoRoot: string, name: string): string {
  return path.join(depot, repoIdFromRoot(repoRoot), name);
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function isDirty(repoPath: string): boolean {
  const s = git(repoPath, ["status", "--porcelain"], true).stdout;
  return s.trim().length > 0;
}

function currentBranch(repoRoot: string): string | null {
  try {
    const b = git(
      repoRoot,
      ["rev-parse", "--abbrev-ref", "HEAD"],
      true,
    ).stdout.trim();
    return b === "HEAD" ? null : b;
  } catch {
    return null;
  }
}

// For apply/patch mode: build a patch that includes:
// - all committed diffs between base..HEAD
// - plus uncommitted changes (tracked) and staged changes
function buildPatch(worktreeDir: string, baseRef: string): string {
  // committed changes
  const committed = git(worktreeDir, ["diff", `${baseRef}..HEAD`], true).stdout;

  // staged + unstaged (tracked)
  const staged = git(worktreeDir, ["diff", "--cached"], true).stdout;
  const unstaged = git(worktreeDir, ["diff"], true).stdout;

  const patch = [committed, staged, unstaged].filter(Boolean).join("\n");
  return patch;
}

function help() {
  console.log(`wt - manage git worktrees in a global depot

USAGE:
  wt <command> [options]

DESCRIPTION:
  Stores worktrees outside your repo so .gitignore isn't affected.
  Default depot:
    ~/.worktrees/<repo-id>/<name>

COMMANDS:
  new <name> [base]      Create worktree <name> from base ref (default: main)
  list                   List worktrees for this repo (or --all)
  path <name>            Print the filesystem path to a worktree
  rm <name>              Remove a worktree (optionally delete its branch)
  apply <name>           Apply worktree changes back to main repo
  prune                  Clean up stale worktree metadata

GLOBAL OPTIONS:
  --repo <path>          Operate on a specific repo (default: cwd)
  --depot <path>         Override depot path (default: ~/.worktrees)
  -h, --help             Show help

APPLY (default):
  wt apply <name> merges branch <name> into --target (default: main).

APPLY MODES:
  --merge    (default)   Merge worktree branch into target
  --rebase               Rebase worktree branch onto target then fast-forward target
  --patch                Apply diff as patch (includes uncommitted changes), optionally commit

EXAMPLES:
  wt new feat-login main
  cd "$(wt path feat-login)"
  wt apply feat-login
  wt rm feat-login
`);
}

// -----------------------------
// command implementations
// -----------------------------
function cmdNew(args: Args) {
  const name = args._[1];
  const base = args._[2] ?? "main";
  if (!name) die("Usage: wt new <name> [base]");

  const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
  const depot = path.resolve(flagStr(args, "depot", defaultDepot())!);

  const wtDir = worktreePath(depot, repoRoot, name);
  ensureDir(path.dirname(wtDir));

  const branch = flagStr(args, "branch", name);
  const noBranch = flagBool(args, "no-branch", false);

  if (existsSync(wtDir)) {
    die(
      `Worktree already exists at: ${wtDir}\nTip: remove it first: wt rm ${name}`,
    );
  }

  // If no-branch: attach to base ref directly (detached or existing branch/ref)
  // Else: create branch if it doesn't exist, otherwise checkout existing branch into worktree
  try {
    if (noBranch) {
      git(repoRoot, ["worktree", "add", wtDir, base]);
    } else {
      // branch exists?
      const exists = (() => {
        try {
          git(
            repoRoot,
            ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
            true,
          );
          return true;
        } catch {
          return false;
        }
      })();

      if (exists) {
        git(repoRoot, ["worktree", "add", wtDir, branch]);
      } else {
        git(repoRoot, ["worktree", "add", "-b", branch, wtDir, base]);
      }
    }
  } catch (e: any) {
    die(String(e?.message ?? e));
  }

  console.log(`Created worktree: ${name}
Path: ${wtDir}
Repo: ${repoRoot}
Branch: ${noBranch ? `(ref: ${base})` : branch}

Next:
  cd "${wtDir}"
  wt apply ${name}`);
}

function cmdList(args: Args) {
  const repoArg = flagStr(args, "repo");
  const repoRoot = repoArg
    ? resolveRepoRoot(repoArg)
    : resolveRepoRoot(undefined);
  const all = flagBool(args, "all", false);

  if (all) {
    // list in repo is still the source of truth for registered worktrees
    // but we can attempt to run from current repo if user is in one
    const root = resolveRepoRoot(flagStr(args, "repo"));
    const out = git(root, ["worktree", "list"]).stdout;
    console.log(out);
    return;
  }

  const out = git(repoRoot, ["worktree", "list"]).stdout;
  console.log(out);
}

function cmdPath(args: Args) {
  const name = args._[1];
  if (!name) die("Usage: wt path <name>");

  const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
  const depot = path.resolve(flagStr(args, "depot", defaultDepot())!);
  console.log(worktreePath(depot, repoRoot, name));
}

function cmdRm(args: Args) {
  const name = args._[1];
  if (!name)
    die("Usage: wt rm <name> [--force] [--delete-branch|--keep-branch]");

  const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
  const depot = path.resolve(flagStr(args, "depot", defaultDepot())!);
  const wtDir = worktreePath(depot, repoRoot, name);

  const force = flagBool(args, "force", false);
  const deleteBranch = flagBool(args, "delete-branch", false);
  const keepBranch = flagBool(args, "keep-branch", false);

  if (!existsSync(wtDir)) {
    // still try to unregister by path if git thinks it exists elsewhere?
    die(`No worktree directory found: ${wtDir}`);
  }

  try {
    const removeArgs = ["worktree", "remove", wtDir];
    if (force) removeArgs.push("--force");
    git(repoRoot, removeArgs);
  } catch (e: any) {
    die(String(e?.message ?? e));
  }

  // If directory remains for any reason, remove it (best-effort)
  try {
    if (existsSync(wtDir)) rmSync(wtDir, { recursive: true, force: true });
  } catch {}

  // Default behavior: keep branch unless explicitly asked to delete (or keep-branch overrides)
  if (deleteBranch && !keepBranch) {
    try {
      git(repoRoot, ["branch", "-D", name]);
      console.log(`Removed worktree and deleted branch: ${name}`);
      return;
    } catch {
      console.log(
        `Removed worktree. Could not delete branch "${name}" (it may not exist or is checked out elsewhere).`,
      );
      return;
    }
  }

  console.log(`Removed worktree: ${name}`);
}

function cmdPrune(args: Args) {
  const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
  try {
    git(repoRoot, ["worktree", "prune"]);
    console.log("Pruned stale worktree metadata.");
  } catch (e: any) {
    die(String(e?.message ?? e));
  }
}

function cmdApply(args: Args) {
  const name = args._[1];
  if (!name)
    die(
      "Usage: wt apply <name> [--target <branch>] [--merge|--rebase|--patch]",
    );

  const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
  const depot = path.resolve(flagStr(args, "depot", defaultDepot())!);
  const wtDir = worktreePath(depot, repoRoot, name);
  if (!existsSync(wtDir)) die(`Worktree not found: ${wtDir}`);

  const target = flagStr(args, "target", "main")!;
  const merge = flagBool(args, "merge", false);
  const rebase = flagBool(args, "rebase", false);
  const patch = flagBool(args, "patch", false);
  const noFF = flagBool(args, "no-ff", false);
  const message = flagStr(args, "message");

  const mode = patch ? "patch" : rebase ? "rebase" : merge ? "merge" : "merge";

  // Ensure main repo clean enough (especially for merge/rebase).
  if (mode !== "patch" && isDirty(repoRoot)) {
    die(
      "Main repo has uncommitted changes. Commit/stash them before apply (or use a clean state).",
    );
  }

  // Determine a base ref for patch mode
  const baseRef = (() => {
    try {
      // base of the worktree branch relative to target: merge-base target..name
      // if branch doesn't exist, fallback to target
      const mb = git(
        repoRoot,
        ["merge-base", target, name],
        true,
      ).stdout.trim();
      return mb || target;
    } catch {
      return target;
    }
  })();

  // Warn for merge/rebase if worktree dirty
  if (mode !== "patch" && isDirty(wtDir)) {
    console.error(
      `Warning: worktree has uncommitted changes; ${mode} will NOT include them.\n` +
        `Tip: commit them, or use: wt apply ${name} --patch\n`,
    );
  }

  // Save current branch to restore (best-effort)
  const prior = currentBranch(repoRoot);

  try {
    // Always fetch target branch locally if it exists; we won't do network fetch.
    // Ensure we are on target.
    git(repoRoot, ["checkout", target]);

    if (mode === "merge") {
      const mergeArgs = ["merge"];
      if (noFF) mergeArgs.push("--no-ff");
      mergeArgs.push(name);
      git(repoRoot, mergeArgs);
      console.log(`Applied (merge): ${name} -> ${target}`);
      return;
    }

    if (mode === "rebase") {
      // Rebase the worktree branch onto target, then FF target to it.
      // We do rebase from inside the worktree, so it rewrites that branch.
      git(wtDir, ["checkout", name]);
      git(wtDir, ["rebase", target]);

      // Now fast-forward target to the rebased branch
      git(repoRoot, ["checkout", target]);
      git(repoRoot, ["merge", "--ff-only", name]);
      console.log(`Applied (rebase+ff): ${name} -> ${target}`);
      return;
    }

    // patch mode
    const patchText = buildPatch(wtDir, baseRef);
    if (!patchText.trim()) {
      console.log("No changes to apply (patch is empty).");
      return;
    }

    // Apply patch in main repo
    const applyProc = Bun.spawnSync(["git", "apply", "--index"], {
      cwd: repoRoot,
      stdin: new TextEncoder().encode(patchText),
      stdout: "pipe",
      stderr: "pipe",
    });

    if (applyProc.exitCode !== 0) {
      const stderr = applyProc.stderr
        ? Buffer.from(applyProc.stderr).toString("utf8")
        : "";
      die(`git apply failed.\n${stderr.trim()}`);
    }

    // Optionally commit
    if (message) {
      git(repoRoot, ["commit", "-m", message]);
      console.log(`Applied (patch) and committed to ${target}: ${message}`);
    } else {
      console.log(
        `Applied (patch) to ${target}. Changes are staged (git apply --index).`,
      );
      console.log(`Tip: commit with: git commit -m "..."`);
    }
  } catch (e: any) {
    die(String(e?.message ?? e));
  } finally {
    // Restore prior branch if it was set and different from target (best-effort)
    if (prior && prior !== target) {
      try {
        git(repoRoot, ["checkout", prior], true);
      } catch {}
    }
  }
}

// -----------------------------
// entry
// -----------------------------
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (
  !cmd ||
  cmd === "help" ||
  cmd === "-h" ||
  cmd === "--help" ||
  flagBool(args, "help")
) {
  help();
  process.exit(0);
}

try {
  switch (cmd) {
    case "new":
    case "add":
      cmdNew(args);
      break;
    case "list":
      cmdList(args);
      break;
    case "path":
      cmdPath(args);
      break;
    case "rm":
    case "remove":
      cmdRm(args);
      break;
    case "apply":
      cmdApply(args);
      break;
    case "prune":
      cmdPrune(args);
      break;
    default:
      help();
      die(`Unknown command: ${cmd}`);
  }
} catch (e: any) {
  die(String(e?.message ?? e));
}
