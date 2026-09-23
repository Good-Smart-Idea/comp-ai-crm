# Ada incident 2026-09-17: builder chat ("Agent Chat") produced "Response stopped" on every message

> Verified live on `gsi-fsn1-ada` against the deployed app (`compcrm.carvisgsi.xyz`, compose
> project `compcrm` under `/opt/gsi/apps/compcrm`, image `gsi/compcrm:v1.15.3-local` built
> from `56fd6489` "make Context enrichment optional and deploy on Ada (CTRL-50)").

## Symptom

Sending "Hello" in the agent-builder chat ended with:

> Response stopped — The builder could not finish this request. Try again.

Alex reproduced this in the deployed app. API logs additionally spammed
`PrismaClientKnownRequestError: column appSetting.contextDevApiKey does not exist` on
every `settings.researchKey` query (INTERNAL_SERVER_ERROR, tRPC).

## Root causes (all confirmed independently, all fixed)

1. **No agent runtime was deployed at all.** The live stack was created from the old
   single-app compose (api/app/postgres + sso-gate overlay). There was **no `agent`
   service**, and neither `api` nor `app` had `AGENT_URL` in their environment, so the
   Next `/eve/v1/[...path]` proxy defaulted to `http://127.0.0.1:2000` inside the app
   container — nothing listens there. The builder turn stream opened and immediately
   died → the UI renders the generic "Response stopped" failure.
   (`apps/app/app/eve/v1/[...path]/route.ts`, `apps/app/lib/agent-bridge.ts`.)

2. **DB migration drift.** `_prisma_migrations` has a `finished` row for
   `20260803220000_context_dev_api_key` (started_at == finished_at within 1 ms —
   the record was inserted without the `ALTER TABLE` ever applying, likely a
   `migrate resolve` during an earlier repair). The column was missing while the
   running Prisma client schema expected it → every `appSetting.findUnique()` that
   selected `contextDevApiKey` 500'd (`settings.researchKey`).

3. **LLM credentials were on disk but never loaded.** `/opt/gsi/apps/compcrm/.env`
   already contained `GSI_MODEL_GATEWAY_BASE_URL=https://openrouter.ai/api/v1` and a
   valid `GSI_MODEL_GATEWAY_API_KEY` (appended Sep 15), but the containers had been
   created on Sep 13/14 and were never recreated, so `process.env` in the running
   containers had none of it. The agent falls back to
   `http://127.0.0.1:1/v1` + `apiKey="disabled"` when the gateway env is missing
   (`apps/agent/agent/lib/model-gateway.ts`) — every model call would fail.
   No key was fabricated; the key already present on the host (same one wired into
   langflow) validates against `openrouter.ai/api/v1/models` (HTTP 200).

## Fix (deployed 2026-09-17)

- **DB:** `ALTER TABLE "appSetting" ADD COLUMN IF NOT EXISTS "contextDevApiKey" TEXT;`
  (idempotent; the migration row already exists so `db:deploy` stays a no-op).
  Backup first: `pg_dump` → `/opt/gsi/apps/compcrm/data/backups/compcrm-backup-20260917-0415.sql`.
- **Compose:** added `/opt/gsi/apps/compcrm/agent-chat-override.yml` (content in
  `ops/ada/agent-chat-override.example.yml` in this PR) and brought the stack up with
  `docker compose -f compose.yml -f compose.override.yml -f agent-chat-override.yml up -d`:
  - `agent` service: image `gsi/compcrm:cb4ed37` (the v1.16.0 build — eve requires
    Node ≥ 24; the v1.15.3-local image is node 22 and cannot run eve),
    `bun run --filter=agent start`, `AGENT_PORT=2000`, eve data volume
    `./data/eve:/src/apps/agent/.eve`, health check on `/eve/v1/health`.
  - `api` + `app`: `AGENT_URL=http://agent:2000` and the `GSI_MODEL_GATEWAY_*` vars
    so the model catalog is configured and the UI proxy reaches the agent.
- The mixed version (api/app v1.15.3 + agent v1.16.0) is compatible at the
  `/eve/v1/*` HTTP layer used by the UI proxy and the api trigger path.

## Live verification (real API responses)

After the fix, submitting "Hello" through the app's own route
(`POST /api/trpc/conversations.submitBuilder` with a real signed session cookie)
produced completed turns in `agentEvent` (`agentRunEvent` equivalents), e.g.:

```
message.completed turn_2:
"Hi there! 👋 I'm here and ready to help. What would you like to work on — a contact,
 a company, a deal, or something else in the CRM?"
finishReason: stop, usage: {inputTokens: 10346, outputTokens: 70}
```

The streamed session through the exact browser path
(`GET /eve/v1/session/{id}/stream` via sso-gate → app proxy → agent) returns the
full event stream including the LLM reply. `settings.researchKey` now returns
`{"configured":false,"hint":null}` with HTTP 200 and the
`column ... does not exist` errors stopped entirely.

## Remaining gaps (AI functionality that is still off — needs provisioning decisions)

The agent boots with these capabilities disabled because no credentials exist anywhere
on the host (checked all app containers, all `/opt/gsi/apps/*/.env`):

| Capability | Gating env | Status |
|---|---|---|
| Web research (citations, LinkedIn-slug search) | `PERPLEXITY_API_KEY` | **off — no key anywhere** |
| Company research (official pages / search) | `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_UNLOCKER_*`, `BRIGHTDATA_SERP_*` | **off — not set** |
| Person research | managed connector (same Bright Data set) | **off — not set** |
| Picture storage (logos/avatars) | `BLOB_READ_WRITE_TOKEN` | **off — not set** |

Working today: conversational chat, tool-calls against CRM data (e.g. `set_chat_title`
executed live), the managed model gateway routing (OpenRouter, currently serving
`deepseek/deepseek-v4-flash` for this workspace). Making the research/picture
capabilities real requires provisioning the four credentials above — that is a
provisioning/purchasing decision, not a code fix.
