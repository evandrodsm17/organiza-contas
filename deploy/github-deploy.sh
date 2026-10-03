#!/usr/bin/env bash
# Installed root-owned as /usr/local/sbin/organiza-deploy. CI cannot change it.
set -euo pipefail
umask 077
APP_DIR=/opt/organiza-contas
cd "$APP_DIR"
exec 9>"$APP_DIR/.operation.lock"
flock -w 600 9

command=${SSH_ORIGINAL_COMMAND:-$*}
if [[ "$command" == status ]]; then
    docker compose ps app
    curl --fail --silent --show-error http://127.0.0.1:3080/api/health
    exit 0
fi
if [[ "$command" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
    mode=deploy
    revision=${BASH_REMATCH[1]}
elif [[ "$command" =~ ^rollback\ ([a-f0-9]{40}|bootstrap)$ ]]; then
    mode=rollback
    revision=${BASH_REMATCH[1]}
else
    echo 'Allowed commands: deploy COMMIT_SHA, rollback COMMIT_SHA, status.' >&2
    exit 64
fi

mkdir -p releases backups
temporary=$(mktemp -d "$APP_DIR/releases/.incoming.XXXXXXXX")
old_revision=$(sed -n 's/^APP_IMAGE_TAG=//p' .env | tail -1)
[[ "$old_revision" =~ ^([a-f0-9]{40}|bootstrap)$ ]] || { echo 'Invalid current revision.' >&2; exit 1; }
old_image=$(docker inspect organiza-contas-app-1 --format '{{.Image}}')
docker image tag "$old_image" "organiza-contas:$old_revision"
changed=0
stopped=0
finish() {
    result=$?
    trap - EXIT
    if (( result != 0 && changed == 1 )); then
        echo "Deployment failed; restoring image $old_revision." >&2
        cp "$temporary/env.before" .env
        docker compose up -d --no-build --no-deps --wait --wait-timeout 90 app || result=1
        echo 'Application rolled back; database was not reverted.' >&2
    elif (( stopped == 1 )); then
        docker compose start app || result=1
    fi
    # mktemp created this exact directory beneath releases; never supplied by SSH.
    rm -rf -- "$temporary"
    exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if [[ "$mode" == deploy ]]; then
    timeout 300 head -c 314572801 > "$temporary/image.tar.gz"
    [[ $(stat -c %s "$temporary/image.tar.gz") -le 314572800 ]] || { echo 'Image exceeds 300 MB compressed.' >&2; exit 1; }
    # Inspect metadata only, never extract an SSH-provided archive as root.
    python3 - "$temporary/image.tar.gz" "$revision" <<'PY'
import json, sys, tarfile
total = 0
manifest = None
with tarfile.open(sys.argv[1], 'r|gz') as archive:
    for member in archive:
        total += member.size
        if total > 1536 * 1024 * 1024:
            raise SystemExit('Image exceeds the uncompressed limit')
        if member.name == 'manifest.json':
            if manifest is not None or not member.isfile() or member.size > 65536:
                raise SystemExit('Invalid Docker manifest')
            manifest = json.load(archive.extractfile(member))
if not isinstance(manifest, list) or len(manifest) != 1 or manifest[0].get('RepoTags') != ['organiza-contas:' + sys.argv[2]]:
    raise SystemExit('Image tag does not match the requested revision')
PY
    if [[ "$revision" == "$old_revision" ]]; then
        curl --fail --silent --show-error http://127.0.0.1:3080/api/health \
            | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["ok"] and r.get("revision")==sys.argv[1]' "$revision"
        echo "Revision $revision is already deployed."
        exit 0
    fi
    docker load --input "$temporary/image.tar.gz"
    label=$(docker image inspect "organiza-contas:$revision" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
    [[ "$label" == "$revision" ]] || { echo 'Image revision label mismatch.' >&2; exit 1; }
else
    docker image inspect "organiza-contas:$revision" >/dev/null
fi

# Build and image validation have finished before the short write pause.
cp .env "$temporary/env.before"
backup="backups/pre-${mode}-$(date -u +%Y%m%dT%H%M%SZ)-$revision.tar.gz"
stopped=1
docker compose stop app
docker compose run --rm --no-deps -T --entrypoint tar app -C /data -czf - . > "$backup"
gzip -t "$backup"
cp "$temporary/env.before" "releases/$revision.env.before"
sed '/^APP_IMAGE_TAG=/d' .env > "$temporary/env.next"
printf 'APP_IMAGE_TAG=%s\n' "$revision" >> "$temporary/env.next"
changed=1
mv "$temporary/env.next" .env
chmod 600 .env
docker compose up -d --no-build --no-deps --wait --wait-timeout 90 app
stopped=0
curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \
    https://organiza-contas.vps11931.panel.icontainer.cloud/api/health \
    | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["ok"] and r.get("revision", "bootstrap")==sys.argv[1]' "$revision"
printf '%s\n' "$revision" > releases/current
printf '%s\n' "$old_revision" > releases/previous
printf 'Deploy successful: %s; previous: %s; backup: %s\n' "$revision" "$old_revision" "$backup"
