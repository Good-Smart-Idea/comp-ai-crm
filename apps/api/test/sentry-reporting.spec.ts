import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type ArgumentsHost, BadRequestException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { OnErrorOptions } from "nestjs-trpc";

const captureException = mock(() => undefined);
const apiError = mock(() => undefined);

mock.module("@sentry/bun", () => ({ captureException }));
mock.module("@crm/telemetry", () => ({ apiError }));

const { AllExceptionsFilter } = await import(
	"../src/logging/all-exceptions.filter"
);
const { TrpcErrorHandler } = await import("../src/trpc/trpc-error.handler");

function httpHost(): ArgumentsHost {
	const response = {
		headersSent: false,
		status: mock(() => response),
		json: mock(() => response),
	};
	return {
		getType: () => "http",
		switchToHttp: () => ({
			getRequest: () => ({
				method: "GET",
				originalUrl: "/boom",
				route: { path: "/boom" },
			}),
			getResponse: () => response,
		}),
	} as unknown as ArgumentsHost;
}

function trpcOptions(error: TRPCError): OnErrorOptions {
	return {
		error,
		type: "query",
		path: "contacts.list",
	} as OnErrorOptions;
}

beforeEach(() => {
	captureException.mockClear();
});

describe("Sentry exception delivery", () => {
	it("captures HTTP server errors and ignores client errors", () => {
		const filter = new AllExceptionsFilter();
		const cause = new Error("database failed");
		filter.catch(cause, httpHost());
		expect(captureException).toHaveBeenCalledWith(cause);

		captureException.mockClear();
		filter.catch(new BadRequestException("bad request"), httpHost());
		expect(captureException).not.toHaveBeenCalled();
	});

	it("captures tRPC internal causes and ignores client errors", () => {
		const handler = new TrpcErrorHandler();
		const cause = new Error("database failed");
		handler.onError(
			trpcOptions(new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause })),
		);
		expect(captureException).toHaveBeenCalledWith(cause);

		captureException.mockClear();
		handler.onError(trpcOptions(new TRPCError({ code: "BAD_REQUEST" })));
		expect(captureException).not.toHaveBeenCalled();
	});
});
