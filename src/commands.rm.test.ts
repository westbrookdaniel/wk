import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function createRepoWithWorktrees(names: string[]): {
	tempRoot: string;
	repoRoot: string;
	depot: string;
} {
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

	for (const name of names) {
		const wkDir = worktreePath(depot, repoRoot, name);
		mkdirSync(path.dirname(wkDir), { recursive: true });
		runGit(repoRoot, ["worktree", "add", "-b", name, wkDir, "main"]);
	}

	return { tempRoot, repoRoot, depot };
}

describe("wk rm --all", () => {
	test("removes all worktrees for the repo", () => {
		const worktreeNames = ["feat-one", "feat-two"];
		const { tempRoot, repoRoot, depot } = createRepoWithWorktrees(worktreeNames);

		try {
			const parsed = parseCliArgs([
				"rm",
				"--all",
				"--repo",
				repoRoot,
				"--depot",
				depot,
			]);

			runCommand("rm", parsed);

			const output = runGit(repoRoot, ["worktree", "list", "--porcelain"]);
			const worktreeLines = output
				.split(/\r?\n/)
				.filter((line) => line.startsWith("worktree "));
			expect(worktreeLines).toHaveLength(1);
			expect(worktreeLines[0]?.includes(repoRoot)).toBe(true);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	test("respects --repo when removing worktrees", () => {
		const repoOneWorktrees = ["feat-one"];
		const repoTwoWorktrees = ["feat-two"];
		const repoOne = createRepoWithWorktrees(repoOneWorktrees);
		const repoTwo = createRepoWithWorktrees(repoTwoWorktrees);

		try {
			const parsed = parseCliArgs([
				"rm",
				"--all",
				"--repo",
				repoOne.repoRoot,
				"--depot",
				repoOne.depot,
			]);

			runCommand("rm", parsed);

			const repoOneOutput = runGit(repoOne.repoRoot, [
				"worktree",
				"list",
				"--porcelain",
			]);
			const repoOneLines = repoOneOutput
				.split(/\r?\n/)
				.filter((line) => line.startsWith("worktree "));
			expect(repoOneLines).toHaveLength(1);
			expect(repoOneLines[0]?.includes(repoOne.repoRoot)).toBe(true);

			const repoTwoOutput = runGit(repoTwo.repoRoot, [
				"worktree",
				"list",
				"--porcelain",
			]);
			const repoTwoLines = repoTwoOutput
				.split(/\r?\n/)
				.filter((line) => line.startsWith("worktree "));
			expect(repoTwoLines.length).toBeGreaterThan(1);
		} finally {
			rmSync(repoOne.tempRoot, { recursive: true, force: true });
			rmSync(repoTwo.tempRoot, { recursive: true, force: true });
		}
	});
});
