import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
	type CommandRunner,
	type LocalTestCommand,
	runLocalTests,
} from "./test-local";

const TEST_DATABASE_URL =
	"postgresql://postgres:postgres@127.0.0.1:55432/crm_test?schema=public";

afterEach(() => {
	spyOn(console, "error").mockRestore();
});

describe("local test orchestration", () => {
	it("prepares Postgres and runs every test with explicit database URLs", () => {
		const calls: { command: LocalTestCommand; env: NodeJS.ProcessEnv }[] = [];
		const run: CommandRunner = (command, env) => {
			calls.push({ command, env });
			return { status: 0 };
		};

		expect(runLocalTests(run)).toBe(0);
		expect(calls.map(({ command }) => command)).toEqual([
			[
				"docker",
				"compose",
				"-f",
				"docker-compose.test.yml",
				"up",
				"-d",
				"--wait",
				"--wait-timeout",
				"60",
			],
			["bun", "run", "db:test"],
			["bunx", "turbo", "run", "test", "--concurrency=1", "--force"],
		]);

		for (const { env } of calls) {
			expect(env.DATABASE_URL).toBe(TEST_DATABASE_URL);
			expect(env.TEST_DATABASE_URL).toBe(TEST_DATABASE_URL);
		}
	});

	it("returns the first failing command status and stops", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		let calls = 0;
		const run: CommandRunner = () => {
			calls += 1;
			return { status: calls === 2 ? 7 : 0 };
		};

		expect(runLocalTests(run)).toBe(7);
		expect(calls).toBe(2);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("bun run db:test"),
		);
	});

	it("reports a spawn error and returns one", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		const run: CommandRunner = () => ({
			status: null,
			error: new Error("command missing"),
		});

		expect(runLocalTests(run)).toBe(1);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("command missing"),
		);
		expect(error).toHaveBeenCalledWith(expect.stringContaining("down -v"));
	});
});
