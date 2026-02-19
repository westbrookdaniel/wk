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

function createRepoWithWorktree(name: string): {
	tempRoot: string;
	repoRoot: string;
	depot: string;
	wkDir: string;
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

	const wkDir = worktreePath(depot, repoRoot, name);
	mkdirSync(path.dirname(wkDir), { recursive: true });
	runGit(repoRoot, ["worktree", "add", "-b", name, wkDir, "main"]);

	return { tempRoot, repoRoot, depot, wkDir };
}

describe("wk apply --switch", () => {
	test("warns and exits early when repo is dirty", () => {
		const name = "feat-switch";
		const { tempRoot, repoRoot, depot } = createRepoWithWorktree(name);

		const originalError = console.error;
		const errors: string[] = [];
		console.error = (...args: unknown[]) => {
			errors.push(args.map((arg) => String(arg)).join(" "));
		};

		try {
			writeFileSync(path.join(repoRoot, "dirty.txt"), "dirty");

			const parsed = parseCliArgs([
				"apply",
				name,
				"--repo",
				repoRoot,
				"--depot",
				depot,
				"--switch",
			]);

			let thrown: Error | null = null;
			try {
				runCommand("apply", parsed);
			} catch (error) {
				thrown = error as Error;
			}

			expect(thrown?.message).toBe("Aborting apply --switch with dirty repo.");
			expect(errors.join("\n")).toContain(
				"Warning: repo has uncommitted changes. Clean your branch before using --switch.",
			);
			expect(runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe(
				"main",
			);
		} finally {
			console.error = originalError;
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	test("switches branches when repo is clean", () => {
		const name = "feat-switch-clean";
		const { tempRoot, repoRoot, depot } = createRepoWithWorktree(name);

		try {
			const parsed = parseCliArgs([
				"apply",
				name,
				"--repo",
				repoRoot,
				"--depot",
				depot,
				"--switch",
			]);

			runCommand("apply", parsed);
			expect(runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe(
				name,
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	const dirtyModes: Array<{ label: string; args: string[] }> = [
		{ label: "merge", args: [] },
		{ label: "rebase", args: ["--rebase"] },
	];

	for (const mode of dirtyModes) {
		test(`rejects dirty repo for ${mode.label} mode`, () => {
			const name = `feat-${mode.label}-dirty`;
			const { tempRoot, repoRoot, depot } = createRepoWithWorktree(name);

			try {
				writeFileSync(path.join(repoRoot, "dirty.txt"), "dirty");

				const parsed = parseCliArgs([
					"apply",
					name,
					"--repo",
					repoRoot,
					"--depot",
					depot,
					...mode.args,
				]);

				let thrown: Error | null = null;
				try {
					runCommand("apply", parsed);
				} catch (error) {
					thrown = error as Error;
				}

				expect(thrown?.message).toBe(
					"Main repo has uncommitted changes. Commit/stash them before apply (or use a clean state).",
				);
			} finally {
				rmSync(tempRoot, { recursive: true, force: true });
			}
		});
	}

	test("allows patch apply with dirty repo", () => {
		const name = "feat-patch-dirty";
		const { tempRoot, repoRoot, depot, wkDir } = createRepoWithWorktree(name);

		try {
			writeFileSync(path.join(repoRoot, "dirty.txt"), "dirty");
			writeFileSync(path.join(wkDir, "README.md"), "base\npatch\n");

			const parsed = parseCliArgs([
				"apply",
				name,
				"--repo",
				repoRoot,
				"--depot",
				depot,
				"--patch",
			]);

			runCommand("apply", parsed);

			const staged = runGit(repoRoot, ["diff", "--cached", "--name-only"]);
			expect(staged.split("\n").includes("README.md")).toBe(true);
			const updated = runGit(repoRoot, ["show", "HEAD:README.md"]);
			expect(updated).toBe("base");
			const workingTree = runGit(repoRoot, ["show", ":README.md"]);
			expect(workingTree).toBe("base\npatch");
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
