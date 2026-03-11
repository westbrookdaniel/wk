import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCliArgs } from "./cli/args.ts";
import { runCommand } from "./commands.ts";
import { worktreePath } from "./core/worktree.ts";

function runGit(cwd: string, args: string[]): string {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = result.stdout
		? Buffer.from(result.stdout).toString("utf8")
		: "";
	const stderr = result.stderr
		? Buffer.from(result.stderr).toString("utf8")
		: "";

	if (result.exitCode !== 0) {
		const message = stderr.trim() || stdout.trim();
		throw new Error(message || `git ${args.join(" ")} failed`);
	}

	return stdout.trim();
}

function createRepo(): { tempRoot: string; repoRoot: string; depot: string } {
	const tempRoot = mkdtempSync(path.join(os.tmpdir(), "wk-test-"));
	let repoRoot = path.join(tempRoot, "repo");
	const depot = path.join(tempRoot, "depot");

	mkdirSync(repoRoot, { recursive: true });
	mkdirSync(depot, { recursive: true });

	runGit(repoRoot, ["init", "-b", "main"]);
	repoRoot = runGit(repoRoot, ["rev-parse", "--show-toplevel"]);

	runGit(repoRoot, ["config", "user.email", "test@example.com"]);
	runGit(repoRoot, ["config", "user.name", "Test User"]);
	writeFileSync(path.join(repoRoot, "README.md"), "base\n");
	runGit(repoRoot, ["add", "."]);
	runGit(repoRoot, ["commit", "-m", "init"]);

	return { tempRoot, repoRoot, depot };
}

describe("wk new", () => {
	test("moves uncommitted changes into the new worktree", () => {
		const name = "feat-transfer";
		const { tempRoot, repoRoot, depot } = createRepo();
		const wkDir = worktreePath(depot, repoRoot, name);

		try {
			writeFileSync(path.join(repoRoot, "README.md"), "base\nupdated\n");
			writeFileSync(path.join(repoRoot, "staged.txt"), "staged\n");
			writeFileSync(path.join(repoRoot, "notes.txt"), "untracked\n");
			runGit(repoRoot, ["add", "staged.txt"]);

			const parsed = parseCliArgs([
				"new",
				name,
				"main",
				"--repo",
				repoRoot,
				"--depot",
				depot,
			]);

			runCommand("new", parsed);

			expect(runGit(repoRoot, ["status", "--short"])).toBe("");
			const worktreeStatus = runGit(wkDir, ["status", "--short"]);
			expect(worktreeStatus).toContain("A  staged.txt");
			expect(worktreeStatus).toContain("?? notes.txt");
			expect(runGit(wkDir, ["diff", "--name-only"])).toBe("README.md");
			expect(runGit(wkDir, ["diff", "--cached", "--name-only"])).toBe(
				"staged.txt",
			);
			expect(runGit(wkDir, ["show", ":staged.txt"])).toBe("staged");
			expect(runGit(wkDir, ["show", "HEAD:README.md"])).toBe("base");
			expect(runGit(wkDir, ["show", ":README.md"])).toBe("base");
			expect(runGit(wkDir, ["diff", "--", "README.md"])).toContain("+updated");
			expect(readFileSync(path.join(wkDir, "notes.txt"), "utf8")).toBe(
				"untracked\n",
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
