#!/usr/bin/env bash
set -Eeuo pipefail

live_host=gsi-fsn1-ada
app_dir=/opt/gsi/apps/compcrm
env_file=$app_dir/.env
live_image=gsi/compcrm:v1.15.3-local

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

sha=${1,,}
[[ $(git -C "$app_dir" rev-parse HEAD) == "$sha" ]] || fail "The application source does not match $sha."
candidate_image=gsi/compcrm:$sha
previous_id=$(docker image inspect --format '{{.Id}}' "$live_image") || fail "Live image $live_image does not exist."

docker build \
	--file "$app_dir/ops/ada/Dockerfile" \
	--build-arg API_URL="$(grep -m1 '^API_URL=' "$env_file" | cut -d= -f2-)" \
	--build-arg APP_URL="$(grep -m1 '^APP_URL=' "$env_file" | cut -d= -f2-)" \
	--build-arg REVISION="$sha" \
	--tag "$candidate_image" \
	"$app_dir"
candidate_id=$(docker image inspect --format '{{.Id}}' "$candidate_image")
candidate_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate_id")
[[ $candidate_revision == "$sha" ]] || fail "Image revision label does not match $sha."

export IMAGE=$candidate_image
deploy_started=false
rollback() {
	local status=$?
	trap - ERR
	if [[ $deploy_started == true ]]; then
		printf '%s\n' "Deployment smoke test failed. Restoring the previous image." >&2
		docker image tag "$previous_id" "$live_image"
		export IMAGE=$live_image
		(
			cd "$app_dir"
			docker compose -f ops/ada/compose.yml up -d --no-build --no-deps --force-recreate app api agent
		)
	fi
	exit "$status"
}
trap rollback ERR

deploy_started=true
cd "$app_dir"
docker compose -f ops/ada/compose.yml up -d --no-build --no-deps --force-recreate app api agent

for service in app api agent; do
	container_id=$(docker compose -f ops/ada/compose.yml ps -q "$service")
	[[ -n $container_id ]]
	[[ $(docker inspect --format '{{.State.Running}}' "$container_id") == true ]]
	[[ $(docker inspect --format '{{.Image}}' "$container_id") == "$candidate_id" ]]
done

sign_in_page=$(curl --fail --silent --show-error --max-time 20 \
	--retry 12 --retry-all-errors --retry-delay 5 \
	--header 'Host: compcrm.carvisgsi.xyz' \
	http://127.0.0.1:3000/sign-in)
grep --fixed-strings --quiet '<title>Sign in · Comp AI CRM</title>' <<<"$sign_in_page"

docker compose -f ops/ada/compose.yml exec -T api sh -ec 'test -n "$AGENT_BRIDGE_SECRET" && wget -qO- --header="Authorization: Bearer $AGENT_BRIDGE_SECRET" http://agent:2000/eve/v1/info >/dev/null'

trap - ERR
printf '%s\n' "Deployed $sha."
