import { existsSync, rmSync } from "node:fs";
import * as path from "node:path";
import { flagBool, flagStr } from "./cli/args.ts";
import { git, resolveRepoRoot } from "./core/git.ts";
import {
	buildPatch,
	currentBranch,
	defaultDepot,
	ensureDir,
	isDirty,
	resolveApplyMode,
	worktreePath,
} from "./core/worktree.ts";
import type { ParsedArgs } from "./types.ts";

export function help(): void {
	console.log(`wk - manage git worktrees in a global depot

USAGE:
  wk <command> [options]

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
  wk apply <name> merges branch <name> into --target (default: main).

APPLY MODES:
  --merge    (default)   Merge worktree branch into target
  --rebase               Rebase worktree branch onto target then fast-forward target
  --patch                Apply diff as patch (includes uncommitted changes), optionally commit

EXAMPLES:
  wk new feat-login main
  cd "$(wk path feat-login)"
  wk apply feat-login
  wk rm feat-login
`);
}

export function runCommand(command: string, args: ParsedArgs): void {
	switch (command) {
		case "new":
		case "add":
			cmdNew(args);
			return;
		case "list":
			cmdList(args);
			return;
		case "path":
			cmdPath(args);
			return;
		case "rm":
		case "remove":
			cmdRm(args);
			return;
		case "apply":
			cmdApply(args);
			return;
		case "prune":
			cmdPrune(args);
			return;
		default:
			help();
			throw new Error(`Unknown command: ${command}`);
	}
}

function cmdNew(args: ParsedArgs): void {
	const name = args._[1];
	const base = args._[2] ?? "main";
	if (!name) throw new Error("Usage: wk new <name> [base]");

	const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
	const depot = path.resolve(flagStr(args, "depot") ?? defaultDepot());

	const wkDir = worktreePath(depot, repoRoot, name);
	ensureDir(path.dirname(wkDir));

	const branch = flagStr(args, "branch", name) ?? name;
	const noBranch = flagBool(args, "no-branch", false);

	if (existsSync(wkDir)) {
		throw new Error(
			`Worktree already exists at: ${wkDir}\nTip: remove it first: wk rm ${name}`,
		);
	}

	if (noBranch) {
		git(repoRoot, ["worktree", "add", wkDir, base]);
	} else {
		const branchExists = (() => {
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

		if (branchExists) {
			git(repoRoot, ["worktree", "add", wkDir, branch]);
		} else {
			git(repoRoot, ["worktree", "add", "-b", branch, wkDir, base]);
		}
	}

	console.log(`Created worktree: ${name}
Path: ${wkDir}
Repo: ${repoRoot}
Branch: ${noBranch ? `(ref: ${base})` : branch}

Next:
  cd "${wkDir}"
  wk apply ${name}`);
}

function cmdList(args: ParsedArgs): void {
	const repoArg = flagStr(args, "repo");
	const repoRoot = repoArg ? resolveRepoRoot(repoArg) : resolveRepoRoot();
	const all = flagBool(args, "all", false);

	if (all) {
		const root = resolveRepoRoot(flagStr(args, "repo"));
		const output = git(root, ["worktree", "list"]).stdout;
		console.log(output);
		return;
	}

	const output = git(repoRoot, ["worktree", "list"]).stdout;
	console.log(output);
}

function cmdPath(args: ParsedArgs): void {
	const name = args._[1];
	if (!name) throw new Error("Usage: wk path <name>");

	const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
	const depot = path.resolve(flagStr(args, "depot") ?? defaultDepot());
	console.log(worktreePath(depot, repoRoot, name));
}

function cmdRm(args: ParsedArgs): void {
	const name = args._[1];
	if (!name)
		throw new Error(
			"Usage: wk rm <name> [--force] [--delete-branch|--keep-branch]",
		);

	const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
	const depot = path.resolve(flagStr(args, "depot") ?? defaultDepot());
	const wkDir = worktreePath(depot, repoRoot, name);

	const force = flagBool(args, "force", false);
	const deleteBranch = flagBool(args, "delete-branch", false);
	const keepBranch = flagBool(args, "keep-branch", false);

	if (!existsSync(wkDir)) {
		throw new Error(`No worktree directory found: ${wkDir}`);
	}

	const removeArgs = ["worktree", "remove", wkDir];
	if (force) removeArgs.push("--force");
	git(repoRoot, removeArgs);

	try {
		if (existsSync(wkDir)) rmSync(wkDir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}

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

function cmdPrune(args: ParsedArgs): void {
	const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
	git(repoRoot, ["worktree", "prune"]);
	console.log("Pruned stale worktree metadata.");
}

function cmdApply(args: ParsedArgs): void {
	const name = args._[1];
	if (!name) {
		throw new Error(
			"Usage: wk apply <name> [--target <branch>] [--merge|--rebase|--patch]",
		);
	}

	const repoRoot = resolveRepoRoot(flagStr(args, "repo"));
	const depot = path.resolve(flagStr(args, "depot") ?? defaultDepot());
	const wkDir = worktreePath(depot, repoRoot, name);
	if (!existsSync(wkDir)) throw new Error(`Worktree not found: ${wkDir}`);

	const target = flagStr(args, "target", "main") ?? "main";
	const merge = flagBool(args, "merge", false);
	const rebase = flagBool(args, "rebase", false);
	const patch = flagBool(args, "patch", false);
	const noFF = flagBool(args, "no-ff", false);
	const message = flagStr(args, "message");

	const mode = resolveApplyMode({ merge, rebase, patch });

	if (mode !== "patch" && isDirty(repoRoot)) {
		throw new Error(
			"Main repo has uncommitted changes. Commit/stash them before apply (or use a clean state).",
		);
	}

	const baseRef = (() => {
		try {
			const mergeBase = git(
				repoRoot,
				["merge-base", target, name],
				true,
			).stdout.trim();
			return mergeBase || target;
		} catch {
			return target;
		}
	})();

	if (mode !== "patch" && isDirty(wkDir)) {
		console.error(
			`Warning: worktree has uncommitted changes; ${mode} will NOT include them.\n` +
				`Tip: commit them, or use: wk apply ${name} --patch\n`,
		);
	}

	const priorBranch = currentBranch(repoRoot);

	try {
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
			git(wkDir, ["checkout", name]);
			git(wkDir, ["rebase", target]);

			git(repoRoot, ["checkout", target]);
			git(repoRoot, ["merge", "--ff-only", name]);
			console.log(`Applied (rebase+ff): ${name} -> ${target}`);
			return;
		}

		const patchText = buildPatch(wkDir, baseRef);
		if (!patchText.trim()) {
			console.log("No changes to apply (patch is empty).");
			return;
		}

		const applyResult = Bun.spawnSync(["git", "apply", "--index"], {
			cwd: repoRoot,
			stdin: new TextEncoder().encode(patchText),
			stdout: "pipe",
			stderr: "pipe",
		});

		if (applyResult.exitCode !== 0) {
			const stderr = applyResult.stderr
				? Buffer.from(applyResult.stderr).toString("utf8")
				: "";
			throw new Error(`git apply failed.\n${stderr.trim()}`);
		}

		if (message) {
			git(repoRoot, ["commit", "-m", message]);
			console.log(`Applied (patch) and committed to ${target}: ${message}`);
		} else {
			console.log(
				`Applied (patch) to ${target}. Changes are staged (git apply --index).`,
			);
			console.log(`Tip: commit with: git commit -m "..."`);
		}
	} finally {
		if (priorBranch && priorBranch !== target) {
			try {
				git(repoRoot, ["checkout", priorBranch], true);
			} catch {
				// best-effort branch restore
			}
		}
	}
}
