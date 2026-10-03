#!/usr/bin/env bash
# Exercises the real gateway with temporary paths and fake Docker/HTTP commands.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
sandbox=$(mktemp -d)
trap 'rm -rf -- "$sandbox"' EXIT
mkdir -p "$sandbox/bin" "$sandbox/app"
export TEST_DEPLOY_ROOT="$sandbox/app"
export PATH="$sandbox/bin:$PATH"
old=$(printf 'a%.0s' {1..40})
new=$(printf 'b%.0s' {1..40})
export TEST_REVISION="$new"
sed "s|APP_DIR=/opt/organiza-contas|APP_DIR=$sandbox/app|" "$repo/deploy/github-deploy.sh" > "$sandbox/gateway"
cat > "$sandbox/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_DEPLOY_ROOT/docker.log"
case "$*" in
  'inspect '*) echo sha256:previous ;;
  'image inspect '*--format*) echo "$TEST_REVISION" ;;
  'compose run '*) printf 'consistent backup' | gzip ;;
  'compose up '*)
    if [[ ${TEST_FAIL_NEW:-0} == 1 ]] && grep -q "^APP_IMAGE_TAG=$TEST_REVISION$" "$TEST_DEPLOY_ROOT/.env"; then exit 1; fi ;;
esac
SH
cat > "$sandbox/bin/curl" <<'SH'
#!/usr/bin/env bash
printf '{"ok":true,"revision":"%s"}\n' "$TEST_REVISION"
SH
chmod +x "$sandbox/bin/"*
python3 - "$sandbox/image.tar.gz" "$new" <<'PY'
import io,json,sys,tarfile
data=json.dumps([{'RepoTags':['organiza-contas:'+sys.argv[2]]}]).encode()
with tarfile.open(sys.argv[1],'w:gz') as archive:
    item=tarfile.TarInfo('manifest.json'); item.size=len(data)
    archive.addfile(item,io.BytesIO(data))
PY
printf 'APP_IMAGE_TAG=%s\nSECRET=preserved\n' "$old" > "$sandbox/app/.env"
SSH_ORIGINAL_COMMAND="deploy $new" bash "$sandbox/gateway" < "$sandbox/image.tar.gz"
grep -q "^APP_IMAGE_TAG=$new$" "$sandbox/app/.env"
grep -q '^SECRET=preserved$' "$sandbox/app/.env"
test "$(cat "$sandbox/app/releases/previous")" = "$old"
test "$(find "$sandbox/app/backups" -name '*.tar.gz' | wc -l)" -eq 1

printf 'APP_IMAGE_TAG=%s\nSECRET=preserved\n' "$old" > "$sandbox/app/.env"
if TEST_FAIL_NEW=1 SSH_ORIGINAL_COMMAND="deploy $new" bash "$sandbox/gateway" < "$sandbox/image.tar.gz"; then
    echo 'Expected failure deploying unhealthy image' >&2; exit 1
fi
grep -q "^APP_IMAGE_TAG=$old$" "$sandbox/app/.env"
grep -q '^SECRET=preserved$' "$sandbox/app/.env"
test "$(grep -c 'compose up' "$sandbox/app/docker.log")" -eq 3

if SSH_ORIGINAL_COMMAND='deploy invalid; touch /tmp/should-not-exist' bash "$sandbox/gateway" < /dev/null; then
    echo 'Invalid SSH command was accepted' >&2; exit 1
fi
if SSH_ORIGINAL_COMMAND="deploy $old" bash "$sandbox/gateway" < "$sandbox/image.tar.gz"; then
    echo 'Mismatched image tag was accepted' >&2; exit 1
fi
echo 'Deployment, backup, rollback and input validation passed.'
