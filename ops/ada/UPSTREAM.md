# Upstream pins

- `node:22-trixie@sha256:2082d2bf902c8835655c6bcfee3594c00ea900498a9f6e2b96d3352536f9e8d8`
- `postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`

`ops/ada/compose.yml` owns Comp CRM application services. It preserves the Control Center `compcrm` PostgreSQL contract. The deployment workflow installs this reviewed file with the reviewed helper. No Control Center checkout is copied during a CRM release.

## Two known gaps, as of 2026-09-17

`gsi-deploy-compcrm` fails every run today, before touching a container:
`previous_id=$(docker image inspect ... gsi/compcrm:live) || fail "Live image
gsi/compcrm:live does not exist."` has no bootstrap path. The tag was created
by the one deploy that completed (`cb4ed37`, 2026-09-15 16:37 UTC), then lost
— the image it pointed at is gone from `docker images` and nothing recreated
the tag since. A human must `docker tag <the image actually serving traffic>
gsi/compcrm:live` once, by hand, before this pipeline can run again — that tag
is also what a failed deploy rolls back to, so tagging the wrong image is a
real rollback hazard. Silently patching around a missing tag is worse: see the
next gap.

The host also runs a `compcrm-sso-gate-1` sidecar (Cloudflare Access header
SSO, `/opt/gsi/apps/compcrm/compose.override.yml`) bound to
`127.0.0.1:8530`, the exact port `ops/ada/compose.yml`'s `app` service also
publishes. Neither this compose file nor `deploy-live.sh` knows the gate
exists. Once the tag above is bootstrapped, the next `agent api app` recreate
will collide on that port and fail partway through — after `agent`/`api` are
already replaced. Reconcile the port (move the gate or add its sidecar to this
compose file) before relying on the automated pipeline again.

## Confirmed, 2026-09-17: the collision above is reproducible, and recovery lands on a stale image

Ran `gsi-deploy-compcrm` twice after bootstrapping the `live` tag. Both runs
failed exactly as predicted: `agent` and `postgres` recreate onto
`ops/ada/compose.yml`, then `api`/`app`/`compcrm-sso-gate-1` (all three, not
just the gate) collide and error with `No such container`, and the rollback
path itself partially fails the same way — one run left `compcrm-app-1`
deleted with nothing running on :8530 until it was brought back by hand.

There is a second compose stack at `/opt/gsi/apps/compcrm/compose.yml` +
`compose.override.yml` (project name also `compcrm`, so same container names)
that predates the `agent` service split — no `AGENT_URL`, image hardcoded to
`gsi/compcrm:v1.15.3-local` (`56fd648`, 2026-09-14). Whatever last brings
`api`/`app`/`compcrm-sso-gate-1` back after a failed `ops/ada` recreate reads
*that* stack, because it is the only one that still knows how to start the
gate. The site ends up served, but by the older image, with `api`/`app` unable
to reach the `agent` container at all (`AGENT_URL` empty in that stack) — the
chat / research surface is silently disconnected even though every container
reports healthy.

Do not run `gsi-deploy-compcrm` again until the gate is reconciled into
`ops/ada/compose.yml` (or the legacy `compose.yml`/`compose.override.yml` pair
is retired) — a third run will very likely reproduce the same partial-failure
window, and each one costs a live outage window on `app` while it is
recovered by hand.
