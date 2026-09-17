#!/usr/bin/env bash
set -Eeuo pipefail

live_host=gsi-fsn1-ada
app_dir=/opt/gsi/apps/compcrm
compose_file=$app_dir/ops/ada/compose.yml
env_file=$app_dir/.env
live_image=gsi/compcrm:live
lock_file=/run/lock/gsi-deploy-compcrm.lock

fail() {
	printf '%s\n' "$1" >&2
	exit 1
}

[[ $# -eq 1 && $1 =~ ^[0-9a-fA-F]{40}$ ]] || fail "Usage: gsi-deploy-compcrm <40-hex-git-sha>"
[[ $(hostname) == "$live_host" ]] || fail "Deployment is restricted to $live_host."
[[ $EUID -eq 0 ]] || fail "This command must run as root."
[[ -f $env_file ]] || fail "$env_file does not exist."
[[ $(stat -c '%a' "$env_file") == 600 ]] || fail "$env_file must have mode 600."
[[ $(stat -c '%U:%G' "$env_file") == root:root ]] || fail "$env_file must be owned by root:root."
[[ -f $compose_file ]] || fail "$compose_file does not exist."

exec 9>"$lock_file"
flock -n 9 || fail "A Comp CRM deployment is already running."

sha=${1,,}
candidate_image=gsi/compcrm:$sha
docker image inspect "$candidate_image" >/dev/null || fail "Candidate image $candidate_image does not exist."
candidate_id=$(docker image inspect --format '{{.Id}}' "$candidate_image")
candidate_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate_image")
[[ $candidate_revision == "$sha" ]] || fail "Image revision label does not match $sha."
if ! previous_id=$(docker image inspect --format '{{.Id}}' "$live_image" 2>/dev/null); then
	running_id=$(docker compose -f "$compose_file" ps -q api 2>/dev/null || true)
	[[ -n $running_id ]] || fail "Live image $live_image does not exist and no running api container to bootstrap it from."
	previous_id=$(docker inspect --format '{{.Image}}' "$running_id")
	docker image tag "$previous_id" "$live_image"
	printf '%s\n' "Bootstrapped missing $live_image tag from the running api container." >&2
fi

export IMAGE=$candidate_image
cd "$app_dir"
docker compose -f "$compose_file" config -q
docker compose -f "$compose_file" run --rm --no-deps api bun run db:deploy

deploy_started=false
rollback() {
	local status=$?
	trap - ERR
	if [[ $deploy_started == true ]]; then
		printf '%s\n' "Deployment smoke test failed. Restoring the previous image." >&2
		docker image tag "$previous_id" "$live_image"
		export IMAGE=$live_image
		docker compose -f "$compose_file" up -d --no-build --force-recreate agent api app sso-gate
	fi
	exit "$status"
}
trap rollback ERR

deploy_started=true
docker compose -f "$compose_file" up -d --no-build --force-recreate agent api app sso-gate

for service in agent api app sso-gate; do
	container_id=$(docker compose -f "$compose_file" ps -q "$service")
	[[ -n $container_id ]]
	for _ in $(seq 1 24); do
		status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
		[[ $status == healthy ]] && break
		[[ $status != unhealthy ]] || fail "$service health check failed."
		sleep 5
	done
	[[ $status == healthy ]] || fail "$service did not become healthy."
	[[ $(docker inspect --format '{{.Image}}' "$container_id") == "$candidate_id" ]]
done

sign_in_page=$(curl --fail --silent --show-error --max-time 20 --retry 12 --retry-all-errors --retry-delay 5 --header 'Host: compcrm.carvisgsi.xyz' http://127.0.0.1:8530/sign-in)
grep --fixed-strings --quiet '<title>Sign in · Comp AI CRM</title>' <<<"$sign_in_page"
docker compose -f "$compose_file" exec -T api sh -ec 'test -n "$AGENT_BRIDGE_SECRET"'
docker compose -f "$compose_file" exec -T api sh -ec 'wget -qO- http://agent:2000/eve/v1/health >/dev/null'

docker image tag "$candidate_id" "$live_image"
trap - ERR
printf '%s\n' "Deployed $sha."
