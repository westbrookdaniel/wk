import { parseArgs as nodeParseArgs } from "node:util";
import type { ParsedArgs } from "../types.ts";

const shortToLong: Record<string, string> = {
	h: "help",
};

const optionSpec = {
	all: { type: "boolean" },
	branch: { type: "string" },
	"delete-branch": { type: "boolean" },
	depot: { type: "string" },
	force: { type: "boolean" },
	help: { type: "boolean", short: "h" },
	"keep-branch": { type: "boolean" },
	merge: { type: "boolean" },
	message: { type: "string" },
	"no-branch": { type: "boolean" },
	"no-ff": { type: "boolean" },
	patch: { type: "boolean" },
	rebase: { type: "boolean" },
	repo: { type: "string" },
	target: { type: "string" },
} as const;

export function parseCliArgs(argv: string[]): ParsedArgs {
	const parsed = nodeParseArgs({
		args: argv,
		allowPositionals: true,
		options: optionSpec,
		strict: false,
		tokens: true,
	});

	const flags: ParsedArgs["flags"] = {};

	for (const token of parsed.tokens ?? []) {
		if (token.kind !== "option") continue;

		const key = token.rawName.startsWith("--")
			? token.name
			: (shortToLong[token.name] ?? token.name);

		flags[key] = token.value ?? true;
	}

	return {
		_: parsed.positionals,
		flags,
	};
}

export function flagStr(
	args: ParsedArgs,
	key: string,
	fallback?: string,
): string | undefined {
	const value = args.flags[key];
	if (typeof value === "string") return value;
	return fallback;
}

export function flagBool(
	args: ParsedArgs,
	key: string,
	fallback = false,
): boolean {
	const value = args.flags[key];
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value === "true";
	return fallback;
}
