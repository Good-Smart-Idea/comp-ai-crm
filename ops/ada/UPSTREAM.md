# Upstream pins

- `node:22-trixie@sha256:2082d2bf902c8835655c6bcfee3594c00ea900498a9f6e2b96d3352536f9e8d8`
- `postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`

`ops/ada/compose.yml` owns Comp CRM application services. It preserves the Control Center `compcrm` PostgreSQL contract. The deployment workflow installs this reviewed file with the reviewed helper. No Control Center checkout is copied during a CRM release.
