export function die(message: string, code = 1): never {
	console.error(message);
	process.exit(code);
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
