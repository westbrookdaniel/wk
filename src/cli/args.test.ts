import { describe, expect, test } from "bun:test";
import { flagBool, flagStr, parseCliArgs } from "./args.ts";

describe("parseCliArgs", () => {
	test("parses positionals and mixed flag styles", () => {
		const parsed = parseCliArgs([
			"new",
			"feat-login",
			"main",
			"--repo",
			"/tmp/repo",
			"--depot=/tmp/depot",
			"--no-branch",
			"-h",
		]);

		expect(parsed._).toEqual(["new", "feat-login", "main"]);
		expect(flagStr(parsed, "repo")).toBe("/tmp/repo");
		expect(flagStr(parsed, "depot")).toBe("/tmp/depot");
		expect(flagBool(parsed, "no-branch")).toBe(true);
		expect(flagBool(parsed, "help")).toBe(true);
	});

	test("treats args after -- as positionals", () => {
		const parsed = parseCliArgs([
			"apply",
			"feat-login",
			"--",
			"--target",
			"main",
		]);

		expect(parsed._).toEqual(["apply", "feat-login", "--target", "main"]);
		expect(flagStr(parsed, "target")).toBeUndefined();
	});

	test("coerces boolean string values", () => {
		const parsed = parseCliArgs(["list", "--all=false", "--help=true"]);

		expect(flagBool(parsed, "all", true)).toBe(false);
		expect(flagBool(parsed, "help", false)).toBe(true);
	});
});
