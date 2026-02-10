import { describe, expect, test } from "bun:test";
import { repoIdFromRoot, resolveApplyMode, worktreePath } from "./worktree.ts";

describe("repoIdFromRoot", () => {
	test("is deterministic and sanitizes basename", () => {
		const root = "/Users/me/dev/repo with spaces";
		const first = repoIdFromRoot(root);
		const second = repoIdFromRoot(root);

		expect(first).toBe(second);
		expect(first.startsWith("repo_with_spaces-")).toBe(true);
		expect(first.length).toBe("repo_with_spaces-".length + 10);
	});
});

describe("worktreePath", () => {
	test("nests worktrees under repo id and name", () => {
		const result = worktreePath("/tmp/depot", "/tmp/source-repo", "feat-login");

		expect(result.endsWith("/feat-login")).toBe(true);
		expect(result.startsWith("/tmp/depot/")).toBe(true);
	});
});

describe("resolveApplyMode", () => {
	test("prefers patch over other flags", () => {
		const mode = resolveApplyMode({ merge: true, rebase: true, patch: true });
		expect(mode).toBe("patch");
	});

	test("prefers rebase when patch is not set", () => {
		const mode = resolveApplyMode({ merge: true, rebase: true, patch: false });
		expect(mode).toBe("rebase");
	});

	test("defaults to merge", () => {
		const mode = resolveApplyMode({
			merge: false,
			rebase: false,
			patch: false,
		});
		expect(mode).toBe("merge");
	});
});
