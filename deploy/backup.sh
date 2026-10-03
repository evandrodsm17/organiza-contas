#!/usr/bin/env bash
set -euo pipefail
cd /opt/organiza-contas
umask 077
exec 9>/opt/organiza-contas/.operation.lock
flock -w 600 9
mkdir -p backups
archive="backups/organiza-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
# Pausa curta: banco e comprovantes ficam no mesmo ponto consistente.
docker compose stop app
trap 'docker compose start app' EXIT
docker compose run --rm --no-deps -T --entrypoint tar app -C /data -czf - . > "$archive"
gzip -t "$archive"
echo "$archive"
# Copie para armazenamento externo. Não há exclusão automática de backups.
