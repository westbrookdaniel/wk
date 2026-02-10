import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { git } from "./git.ts";

export function defaultDepot(): string {
	return path.join(os.homedir(), ".worktrees");
}

export function repoIdFromRoot(repoRoot: string): string {
	const hash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 10);
	const base = path.basename(repoRoot).replace(/[^a-zA-Z0-9._-]/g, "_");
	return `${base}-${hash}`;
}

export function worktreePath(
	depot: string,
	repoRoot: string,
	name: string,
): string {
	return path.join(depot, repoIdFromRoot(repoRoot), name);
}

export function ensureDir(dirPath: string): void {
	mkdirSync(dirPath, { recursive: true });
}

export function isDirty(repoPath: string): boolean {
	const status = git(repoPath, ["status", "--porcelain"], true).stdout;
	return status.trim().length > 0;
}

export function currentBranch(repoRoot: string): string | null {
	try {
		const branch = git(
			repoRoot,
			["rev-parse", "--abbrev-ref", "HEAD"],
			true,
		).stdout.trim();
		return branch === "HEAD" ? null : branch;
	} catch {
		return null;
	}
}

export function buildPatch(worktreeDir: string, baseRef: string): string {
	const committed = git(worktreeDir, ["diff", `${baseRef}..HEAD`], true).stdout;
	const staged = git(worktreeDir, ["diff", "--cached"], true).stdout;
	const unstaged = git(worktreeDir, ["diff"], true).stdout;

	return [committed, staged, unstaged].filter(Boolean).join("\n");
}

export function resolveApplyMode(flags: {
	merge: boolean;
	rebase: boolean;
	patch: boolean;
}): "merge" | "rebase" | "patch" {
	if (flags.patch) return "patch";
	if (flags.rebase) return "rebase";
	if (flags.merge) return "merge";
	return "merge";
}
