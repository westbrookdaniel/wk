import * as path from "node:path";
import { die } from "./errors.ts";

export function run(
	command: string[],
	options?: { cwd?: string; quiet?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
	const processResult = Bun.spawnSync(command, {
		cwd: options?.cwd,
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = (
		processResult.stdout
			? Buffer.from(processResult.stdout).toString("utf8")
			: ""
	).trimEnd();
	const stderr = (
		processResult.stderr
			? Buffer.from(processResult.stderr).toString("utf8")
			: ""
	).trimEnd();

	if (processResult.exitCode !== 0) {
		if (!options?.quiet) {
			if (stdout) console.error(stdout);
			if (stderr) console.error(stderr);
		}
		throw new Error(
			`Command failed (${processResult.exitCode}): ${command.join(" ")}`,
		);
	}

	return { stdout, stderr, exitCode: processResult.exitCode };
}

export function git(cwd: string, args: string[], quiet?: boolean) {
	return run(["git", ...args], { cwd, quiet });
}

export function resolveRepoRoot(repoArg?: string): string {
	const cwd = repoArg ? path.resolve(repoArg) : process.cwd();
	try {
		const root = git(cwd, ["rev-parse", "--show-toplevel"], true).stdout.trim();
		if (!root) die("Could not determine repo root.");
		return root;
	} catch {
		die("Not inside a git repository (or --repo is not a git repo).");
	}
}
