export type FlagValue = string | boolean;

export type ParsedArgs = {
	_: string[];
	flags: Record<string, FlagValue>;
};
