#!/usr/bin/env bash
# Ada is self-hosted (docker compose), not Vercel, so apps/api/vercel.json's
# crons never fire here. This script is the Ada equivalent of the
# `*/5 * * * *` -> /internal/sync/mailboxes cron declared there for Gmail +
# Calendar (and, as of this pass, Outlook) sync.
#
# Install once, as root, on gsi-fsn1-ada:
#   install -m 750 -o root -g root ops/ada/cron-mailbox-sync.sh \
#     /opt/gsi/apps/compcrm/cron-mailbox-sync.sh
#   (crontab -l -u root 2>/dev/null; echo \
#     "*/5 * * * * /opt/gsi/apps/compcrm/cron-mailbox-sync.sh >> /var/log/compcrm-mailbox-sync.log 2>&1") \
#     | crontab -u root -
#
# Requires CRON_SECRET to be set in /opt/gsi/apps/compcrm/.env (mode 600,
# root:root, same file deploy-live.sh already requires). Fails closed and
# loudly if it is missing, exactly like the API route it calls.
set -Eeuo pipefail

env_file=/opt/gsi/apps/compcrm/.env
[[ -f $env_file ]] || { echo "cron-mailbox-sync: $env_file not found" >&2; exit 1; }

cron_secret=$(grep -m1 '^CRON_SECRET=' "$env_file" | cut -d= -f2- | tr -d '"'"'"'"')
[[ -n $cron_secret ]] || { echo "cron-mailbox-sync: CRON_SECRET is empty in $env_file" >&2; exit 1; }

curl --fail --silent --show-error --max-time 60 \
  --header "Authorization: Bearer ${cron_secret}" \
  --request POST \
  http://127.0.0.1:8531/internal/sync/mailboxes
echo
