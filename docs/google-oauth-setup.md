# Google OAuth setup for Gmail + Calendar sync (CTRL-117)

**This is the one manual step a human has to do.** Everything else the sync
engine needs — the scopes, the cron route, the token refresh, the matching
rules — already exists in the code (`packages/auth/src/scopes.ts`,
`apps/api/src/google/*`, `apps/api/src/sync/sync.controller.ts`). It is inert
today only because `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are unset on
Ada. Creating those two values requires a Google Cloud Console action nobody
but a Workspace admin (Alex) can take.

**Model, confirmed:** each rep signs in with **their own** Google Workspace
account and grants their own mailbox — mihai-to-mihai, alex-to-alex. This is
**not** a service account and **not** domain-wide delegation. One shared
OAuth *client* (the app's identity), many individual *grants* (one per user,
made by that user, at their own sign-in). Nobody's mailbox is read by anyone
else's login.

Production host: `compcrm.carvisgsi.xyz`, served from Ada
(`/opt/gsi/apps/compcrm`). Callback path is fixed by Better Auth:
`/api/auth/callback/google`, on the **API** origin. Locally that's
`http://localhost:3001/api/auth/callback/google`; on Ada it's
`https://compcrm.carvisgsi.xyz/api/auth/callback/google` (the API is proxied
under the same public host as the app — confirm this is still true before
step 5 if the routing has changed since this doc was written).

## Steps, in order

1. **Open the project.** [Google Cloud Console](https://console.cloud.google.com/)
   → pick the GSI Workspace project this CRM should live under (or create a
   new project if there isn't already one earmarked for internal tools).

2. **Configure the OAuth consent screen** (APIs & Services → OAuth consent
   screen):
   - **User type: Internal.** This is the whole ball game — Internal
     (Workspace-only) apps are exempt from Google's OAuth verification and
     CASA security assessment for restricted scopes. `gmail.readonly` is a
     *restricted* scope under Google's own classification; an External app
     using it needs a paid annual security review. Internal skips all of
     that because only your own Workspace users can ever be offered the
     consent screen.
   - **This is Workspace-only** — "Internal" is not selectable on a personal
     Gmail-based Cloud project. If the project isn't tied to a Workspace
     organization (goodsmartidea.com), it needs to be created in/moved into
     one first.
   - App name: something recognizable, e.g. "Comp AI CRM (GSI internal)".
   - Support email / developer contact: your own goodsmartidea.com address.
   - No need to add scopes on this screen for an Internal app — see the note
     under step 3 in the plan doc (`docs/plan/gmail-calendar-plan.md` §3.3):
     *"scopes aren't listed on the consent screen and use of restricted or
     sensitive scopes doesn't require further review by Google"* for
     Internal apps. Save and continue through the wizard with defaults.

3. **Enable the two APIs** (APIs & Services → Library):
   - **Gmail API**
   - **Google Calendar API**

4. **Create the OAuth client** (APIs & Services → Credentials → Create
   Credentials → OAuth client ID):
   - **Application type: Web application.**
   - **Name:** e.g. "Comp AI CRM — web".
   - **Authorized JavaScript origins:**
     - `https://compcrm.carvisgsi.xyz`
     - (optional, for local dev) `http://localhost:3000`
   - **Authorized redirect URIs** — exact match required, scheme and path
     both matter:
     - `https://compcrm.carvisgsi.xyz/api/auth/callback/google`
     - (optional, for local dev) `http://localhost:3001/api/auth/callback/google`
   - Nothing else changes if this project already has a Google sign-in
     client for the CRM — reuse the existing client and just confirm the
     redirect URI above is present, rather than creating a second one. One
     client, same callback, is deliberate (`gmail-calendar-plan.md` §3.3):
     extending an existing sign-in grant to cover Gmail/Calendar adds no new
     redirect URI to get wrong across environments.
   - **Scopes are requested by the app at sign-in, not configured on the
     client** — you do not pick scopes in this step. The code already
     requests `openid`, `email`, `profile`, `gmail.readonly`, and
     `calendar.readonly` (`packages/auth/src/scopes.ts`, `SYNC_SCOPES`).
   - Click **Create**. Google shows the **Client ID** and **Client Secret**
     once on screen (both are also always retrievable later from the
     Credentials page).

5. **Hand the two values to Hermes/ops for Ada**, do not paste them into
   Slack or a ticket comment. They go into
   `/opt/gsi/apps/compcrm/.env` on Ada (`root:root`, mode `600` — the deploy
   script already enforces this) as:
   ```
   GOOGLE_CLIENT_ID="<client id>.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="<client secret>"
   ```
   `CRON_SECRET` (≥16 chars, e.g. `openssl rand -base64 24`) must also be set
   in that same `.env` for the sync cron to run at all — see
   `docs/environment.md` and `ops/ada/cron-mailbox-sync.sh`, added in this
   change, which is the Ada-side cron entry (Ada runs docker compose, not
   Vercel, so `apps/api/vercel.json`'s cron declaration doesn't fire here —
   this script is the equivalent, meant to be installed via `crontab` per
   the comment at the top of the file).

6. **Restart the API/app containers** on Ada after the `.env` change so the
   new variables are read (`docker compose -f ops/ada/compose.yml up -d
   --force-recreate api app`, or the normal `gsi-deploy-compcrm` path —
   check `ops/ada/UPSTREAM.md` for known deploy-pipeline gaps first).

7. **Verify:** sign out and back in as yourself (alex-to-alex) at
   `https://compcrm.carvisgsi.xyz`. The Google consent screen should now ask
   for Gmail and Calendar read access alongside the basic profile scopes. A
   rep who unticks a scope, or an account that predates this change, lands on
   `/grant-access` instead of the app (`requireGoogleAccess()` gate) — that
   page offers a one-click re-consent. Ask Mihai to do the same
   (mihai-to-mihai) once your own sign-in confirms the flow works.

## What NOT to do

- Do **not** create a service account or enable domain-wide delegation. The
  approved design is per-user consent only — every mailbox is read because
  that specific person signed in and granted it, not because an admin
  authorized the whole domain.
- Do **not** set `prompt: consent` or add scopes to the OAuth *client*
  config in the console — scopes are requested in application code
  (`packages/auth/src/auth.ts` reads `SYNC_SCOPES`), not configured on the
  GCP client itself.
- Do **not** flip the consent screen to External. That reopens the
  restricted-scope verification/CASA requirement this whole Internal-type
  choice exists to avoid, and per the plan doc, going External later means
  full review with no way back to the Internal exemption.

## What's already done (this change, CTRL-117 prep)

- Verified the native sync engine is real and complete: OAuth scopes
  (`packages/auth/src/scopes.ts`), token handling/matching/sync services
  (`apps/api/src/google/*`), the guarded cron route
  (`apps/api/src/sync/sync.controller.ts`, `POST/GET /internal/sync/mailboxes`,
  aliased at `/internal/sync/google`), and the Vercel cron declaration
  (`apps/api/vercel.json`, `*/5 * * * *`).
- Added `ops/ada/cron-mailbox-sync.sh` — the Ada (docker-compose, non-Vercel)
  equivalent of that cron, since Vercel's `vercel.json` crons don't run on a
  self-hosted deployment. Install instructions are in the script's header.
- Documented `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env.example` with
  a pointer to this doc.
- Wrote this doc as the exact, ordered instructions for the one remaining
  manual step: creating the OAuth client in Google Cloud Console.

Once the two env vars are set and the containers restarted, sync activates
automatically — there is deliberately no feature flag
(`gmail-calendar-plan.md` §13).
