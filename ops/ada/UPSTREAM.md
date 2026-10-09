# Upstream pins

- `node:22-trixie@sha256:2082d2bf902c8835655c6bcfee3594c00ea900498a9f6e2b96d3352536f9e8d8`
- `postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`

`ops/ada/compose.yml` owns Comp CRM application services. It preserves the Control Center `compcrm` PostgreSQL contract. The deployment workflow installs this reviewed file with the reviewed helper. No Control Center checkout is copied during a CRM release.

## Two known gaps — resolved 2026-09-17

Both gaps below (recorded 2026-09-17 morning, CTRL-81) are now fixed in
`ops/ada/compose.yml` and `ops/ada/deploy-live.sh`. Left here as the record of
what broke and why, since the same failure modes can recur if this file
drifts from what actually runs on Ada again.

**Missing `gsi/compcrm:live` tag.** `deploy-live.sh` had no bootstrap path for
a missing live tag — the tag was created by the one deploy that completed
(`cb4ed37`, 2026-09-15 16:37 UTC), then lost when the image it pointed at was
pruned. Fixed: if `gsi/compcrm:live` does not exist, `deploy-live.sh` now
tags whatever image the running `api` service under this compose project is
currently using, then proceeds — the container already serving traffic is by
definition the same thing a human would have hand-tagged.

**Port collision with the SSO gate.** The host ran a hand-built
`compcrm-sso-gate-1` sidecar (Cloudflare Access header SSO,
`/opt/gsi/apps/compcrm/compose.override.yml`, never committed) bound to
`127.0.0.1:8530` — the same port `ops/ada/compose.yml`'s `app` service
published. Fixed: `sso-gate` is now a real service in `ops/ada/compose.yml`
(script at `ops/ada/sso-gate.ts`, installed by `deploy-ada.yml` alongside the
compose file). It owns the public port `127.0.0.1:8530`; `app` moved to the
internal-only `127.0.0.1:8532` and is reached through the gate, exactly as the
hand-built overlay had it. `deploy-live.sh` now recreates, health-checks, and
rolls back `sso-gate` along with `agent api app`.

## CRM wake and deployment coordination

The on-demand manager's default root Compose definition can restore older images
while this helper replaces containers. Both wake and stop now use the CRM-owned
ops/ada/compose.yml, gsi/compcrm:live, and the helper's nonblocking deployment lock.

Manager source remains in mcp-servers/scripts/gsi-ada/app-ondemand. Its main-only
Actions workflow verifies and stages the content-addressed artifact. This helper
pins checksum 4c02c2a53f7656440e1dffb7feee15d3bafd6352ca5c92b331cce8efc6699143,
checks ownership and permissions, saves the previous binary and restarts the
existing manager while holding the deployment lock. Failed manager activation
restores the prior binary before app deployment begins.

No registry, nginx route, or app admission changes. The manager selftest and real
flock behavior test live beside its canonical source. Validate this helper with
bash -n, then use release Actions and verify all four image revisions and a CRM
conversation. Never invoke a manual restart or a wake bypass to qualify a release.
