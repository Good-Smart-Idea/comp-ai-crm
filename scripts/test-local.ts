import { spawnSync } from "node:child_process";

const COMPOSE_FILE = "docker-compose.test.yml";
const TEST_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:55432/crm_test?schema=public";
const WAIT_TIMEOUT_SECONDS = "60";

export type LocalTestCommand = readonly [string, ...string[]];

type CommandResult = {
	status: number | null;
	error?: Error;
};

export type CommandRunner = (
	command: LocalTestCommand,
	env: NodeJS.ProcessEnv,
) => CommandResult;

const commands = [
	[
		"docker",
		"compose",
		"-f",
		COMPOSE_FILE,
		"up",
		"-d",
		"--wait",
		"--wait-timeout",
		WAIT_TIMEOUT_SECONDS,
	],
	["bun", "run", "db:test"],
	["bunx", "turbo", "run", "test", "--concurrency=1", "--force"],
] as const satisfies readonly LocalTestCommand[];

export function runLocalTests(run: CommandRunner = runCommand): number {
	const env = {
		...process.env,
		DATABASE_URL: TEST_DATABASE_URL,
		TEST_DATABASE_URL,
	};

	for (const command of commands) {
		const result = run(command, env);

		if (result.error || result.status !== 0) {
			reportFailure(command, result.error);
			return result.status ?? 1;
		}
	}

	return 0;
}

function runCommand(
	[executable, ...args]: LocalTestCommand,
	env: NodeJS.ProcessEnv,
): CommandResult {
	const result = spawnSync(executable, args, { stdio: "inherit", env });
	return { status: result.status, error: result.error };
}

function reportFailure(command: LocalTestCommand, error?: Error): void {
	console.error(
		[
			"",
			`  Local test command failed: ${command.join(" ")}`,
			...(error ? ["", `  ${error.message}`] : []),
			"",
			`  Inspect Postgres: docker compose -f ${COMPOSE_FILE} logs postgres`,
			`  Reset Postgres: docker compose -f ${COMPOSE_FILE} down -v`,
			"",
		].join("\n"),
	);
}

if (import.meta.main) process.exit(runLocalTests());
