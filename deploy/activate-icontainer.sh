#!/usr/bin/env bash
set -euo pipefail
cd /opt/organiza-contas
config=/etc/icontainer/apps/nginx/nginx/conf/conf.d/organiza-contas-vps.conf
curl --fail --silent http://127.0.0.1:3080/api/health
docker compose run --rm --no-deps -v /opt/organiza-contas/migration-export:/migration:ro app node server/verify-import.mjs /migration
cp -p "$config" "$config.before-activation"
sed '/return 503 "Organiza Contas: migracao em preparacao/d' deploy/icontainer-https.conf > "$config"
if ! docker exec ic-nginx-0zOQ nginx -t; then
    cp -p "$config.before-activation" "$config"
    exit 1
fi
docker exec ic-nginx-0zOQ nginx -s reload
curl --retry 5 --retry-delay 1 --retry-all-errors --fail --silent --show-error https://organiza-contas.vps11931.panel.icontainer.cloud/api/health
