# Trigger.dev Worker

`apps/trigger` owns scheduled and on-demand background jobs. It deploys to the
self-hosted Trigger.dev service.

## Commands

Run `bun run --filter=@crm/trigger dev` for local development. Run
`bun run --filter=@crm/trigger deploy` for a reviewed deployment.

## Configuration

Set `TRIGGER_API_URL`, `TRIGGER_SECRET_KEY`, and `TRIGGER_PROJECT_REF` in the
root `.env`. The default project reference is `proj_comp_ai_crm_self_hosted`.

The Bright Data snapshot poller also reads `BRIGHTDATA_API_TOKEN`.
`BRIGHTDATA_HEARTBEAT_DATASET_ID` and `BRIGHTDATA_HEARTBEAT_URL` override its
heartbeat targets. Missing Bright Data configuration skips the scheduled job.

## Tasks

`bd-snapshot-poll` polls one snapshot until Bright Data returns a terminal
state. `bd-snapshot-poll-cron` creates and polls one heartbeat snapshot every
six hours. Development schedules return before paid snapshot creation.

Trigger.dev owns execution and retry state. The CRM API does not run these
tasks.
