import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

const compose = ["compose", "-f", "docker-compose.test.yml"];
const databaseUrl =
	"postgresql://postgres:postgres@127.0.0.1:55432/crm_test?schema=public";
const runIf = process.env.RUN_LOCAL_DB_INTEGRATION === "1" ? it : it.skip;

function run(command: string, args: string[]): void {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		env: {
			...process.env,
			DATABASE_URL: databaseUrl,
			TEST_DATABASE_URL: databaseUrl,
		},
	});
	expect(result.error).toBeUndefined();
	expect(result.status).toBe(0);
}

describe("local database lifecycle", () => {
	runIf(
		"supports cold, warm, and rebuilt databases",
		() => {
			run("docker", [...compose, "down", "-v"]);
			run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
			run("bun", ["run", "db:test"]);
			run("bun", ["run", "db:test"]);
			run("docker", [...compose, "down", "-v"]);
			run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
			run("bun", ["run", "db:test"]);
		},
		180_000,
	);
});
