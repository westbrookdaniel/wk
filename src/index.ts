import { flagBool, parseCliArgs } from "./cli/args.ts";
import { help, runCommand } from "./commands.ts";
import { die, errorMessage } from "./core/errors.ts";

const args = parseCliArgs(process.argv.slice(2));
const command = args._[0];

if (
	!command ||
	command === "help" ||
	command === "-h" ||
	command === "--help" ||
	flagBool(args, "help")
) {
	help();
	process.exit(0);
}

try {
	runCommand(command, args);
} catch (error) {
	die(errorMessage(error));
}
