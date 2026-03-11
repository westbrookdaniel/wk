import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
	// Build one consolidated patch from baseRef to current working tree state.
	// This avoids malformed concatenated patches and includes both committed and
	// local staged/unstaged tracked-file changes.
	return git(worktreeDir, ["diff", "--no-color", `${baseRef}`], true).stdout;
}

function hasStagedChanges(repoPath: string): boolean {
	return git(repoPath, ["diff", "--cached", "--name-only"], true).stdout.trim().length > 0;
}

function hasUnstagedChanges(repoPath: string): boolean {
	return git(repoPath, ["diff", "--name-only"], true).stdout.trim().length > 0;
}

function hasUntrackedChanges(repoPath: string): boolean {
	return (
		git(repoPath, ["ls-files", "--others", "--exclude-standard"], true).stdout
			.trim().length > 0
	);
}

function listUntrackedPaths(repoPath: string): string[] {
	const output = git(
		repoPath,
		["ls-files", "--others", "--exclude-standard"],
		true,
	).stdout;

	if (!output.trim()) return [];
	return output.split(/\r?\n/).filter(Boolean);
}

function listPureUnstagedPaths(repoPath: string): string[] {
	const output = git(repoPath, ["status", "--porcelain"], true).stdout;

	if (!output.trim()) return [];

	return output
		.split(/\r?\n/)
		.filter(Boolean)
		.filter((line) => line[0] === " " && line[1] !== " " && line[1] !== "?")
		.map((line) => line.slice(3));
}

function stashMessage(kind: string): string {
	return `wk-transfer-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findStashRef(repoPath: string, message: string): string | null {
	const entries = git(repoPath, ["stash", "list", "--format=%gd%x09%gs"], true).stdout;

	for (const entry of entries.split(/\r?\n/)) {
		const [ref, subject] = entry.split("\t");
		if (ref && subject && subject.endsWith(`: ${message}`)) return ref;
	}

	return null;
}

function stashChanges(repoPath: string, args: string[], message: string): void {
	git(repoPath, [...args, "--message", message]);

	const ref = findStashRef(repoPath, message);
	if (!ref) {
		throw new Error(`Failed to locate stash created for ${message}.`);
	}
}

function dropStash(repoPath: string, message: string): void {
	const dropRef = findStashRef(repoPath, message);
	if (dropRef) {
		git(repoPath, ["stash", "drop", dropRef], true);
	}
}

function applyPatch(repoPath: string, patchText: string, useIndex: boolean): void {
	if (!patchText.trim()) return;

	const tempDir = mkdtempSync(path.join(os.tmpdir(), "wk-transfer-patch-"));
	const patchPath = path.join(tempDir, useIndex ? "staged.patch" : "unstaged.patch");
	const normalizedPatch = patchText.endsWith("\n") ? patchText : `${patchText}\n`;

	try {
		writeFileSync(patchPath, normalizedPatch);
		git(repoPath, ["apply", ...(useIndex ? ["--index"] : []), patchPath]);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function snapshotUntrackedFiles(repoPath: string, relativePaths: string[]): string | null {
	if (relativePaths.length === 0) return null;

	const snapshotDir = mkdtempSync(path.join(os.tmpdir(), "wk-transfer-files-"));

	for (const relativePath of relativePaths) {
		const sourcePath = path.join(repoPath, relativePath);
		const destinationPath = path.join(snapshotDir, relativePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true });
		cpSync(sourcePath, destinationPath, { recursive: true });
	}

	return snapshotDir;
}

function restoreUntrackedFiles(
	targetDir: string,
	snapshotDir: string | null,
	relativePaths: string[],
): void {
	if (!snapshotDir) return;

	for (const relativePath of relativePaths) {
		const sourcePath = path.join(snapshotDir, relativePath);
		const destinationPath = path.join(targetDir, relativePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true });
		cpSync(sourcePath, destinationPath, { recursive: true });
	}
}

function unstagePaths(repoPath: string, relativePaths: string[]): void {
	if (relativePaths.length === 0) return;
	git(repoPath, ["reset", "HEAD", "--", ...relativePaths]);
}

export function transferUncommittedChanges(
	sourceDir: string,
	targetDir: string,
): boolean {
	if (!isDirty(sourceDir)) return false;

	const stagedPatch = hasStagedChanges(sourceDir)
		? git(sourceDir, ["diff", "--cached", "--binary", "--full-index"], true)
				.stdout
		: "";
	const pureUnstagedPaths = listPureUnstagedPaths(sourceDir);
	const unstagedPatch = hasUnstagedChanges(sourceDir)
		? git(sourceDir, ["diff", "--binary", "--full-index"], true).stdout
		: "";
	const untrackedPaths = listUntrackedPaths(sourceDir);
	const untrackedSnapshotDir = snapshotUntrackedFiles(sourceDir, untrackedPaths);
	const transferMessage = stashMessage("all");

	stashChanges(sourceDir, ["stash", "push", "--include-untracked"], transferMessage);

	try {
		applyPatch(targetDir, stagedPatch, true);
		applyPatch(targetDir, unstagedPatch, false);
		unstagePaths(targetDir, pureUnstagedPaths);
		restoreUntrackedFiles(targetDir, untrackedSnapshotDir, untrackedPaths);
		dropStash(sourceDir, transferMessage);

		return true;
	} catch (error) {
		throw new Error(
			"Created worktree, but failed to transfer uncommitted changes. Any remaining wk-transfer stashes were left in place for recovery.",
			{ cause: error },
		);
	} finally {
		if (untrackedSnapshotDir) {
			rmSync(untrackedSnapshotDir, { recursive: true, force: true });
		}
	}
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
