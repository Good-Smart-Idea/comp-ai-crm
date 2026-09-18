# @gsi/clients

Shared, typed wrappers around third-party APIs used across GSI apps, so
every consumer gets the same auth handling, timeout behaviour, typed error
contract, and Usage & Cost metering (via `@crm/telemetry` counters) instead
of re-implementing a fetch wrapper per app.

## Bright Data

`src/bright-data` wraps Bright Data's Request API
(`https://api.brightdata.com/request`) — the same endpoint already used in
production by `apps/agent/agent/lib/company-research.ts`.

```ts
import { BrightDataClient } from "@gsi/clients/bright-data";

const client = new BrightDataClient(); // reads BRIGHTDATA_API_TOKEN / BRIGHTDATA_UNLOCKER_ZONE from env
const result = await client.fetchText({ url: "https://example.com" });

if (result.outcome === "ok") {
	// result.data: string, result.status: number
} else {
	// result.error: BrightDataError with a typed `code`
	// ("not_configured" | "unauthorized" | "rate_limited" | "timeout" | "network_error" | "bad_response")
}
```

Every call increments `bright_data_requests_total` plus either
`bright_data_requests_ok` or `bright_data_requests_failed` through
`@crm/telemetry`'s `bumpCounter`, which the existing rollup service
(`apps/api/src/telemetry/rollup.service.ts`) already drains into Usage &
Cost reporting — no new plumbing required.

Failure paths never hang: every request carries an `AbortSignal.timeout`
(default 20s) and bad credentials / timeouts / network errors all resolve
to a typed `BrightDataResult["error"]` instead of throwing.

### Testing

- `bun run test` — unit tests, fully mocked `fetch`, no network.
- `bun run test:contract` — a real call against live Bright Data. Requires
  `BRIGHTDATA_API_TOKEN` and `BRIGHTDATA_UNLOCKER_ZONE` (or
  `BRIGHTDATA_USER`, asserted as a required companion credential for this
  workspace's Bright Data account) to be set; skips itself with a clear
  message otherwise. No mocks — this hits the real Bright Data endpoint.
