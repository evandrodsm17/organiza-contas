#!/usr/bin/env bash
set -euo pipefail
cd /opt/organiza-contas
site=/etc/icontainer/apps/nginx/nginx/www/sites/organiza-contas.vps11931.panel.icontainer.cloud
config=/etc/icontainer/apps/nginx/nginx/conf/conf.d/organiza-contas-vps.conf
if test -e "$config"; then
    echo 'Configuração já existe; revise antes de executar novamente.' >&2
    exit 1
fi
mkdir -p "$site/acme" "$site/letsencrypt"
install -m 644 deploy/icontainer-http.conf "$config"
if ! docker exec ic-nginx-0zOQ nginx -t; then
    mv "$config" "$config.failed"
    exit 1
fi
docker exec ic-nginx-0zOQ nginx -s reload
docker run --rm \
    -v "$site/letsencrypt:/etc/letsencrypt" \
    -v "$site/acme:/webroot" \
    certbot/certbot certonly --webroot -w /webroot \
    -d organiza-contas.vps11931.panel.icontainer.cloud \
    --non-interactive --agree-tos --register-unsafely-without-email
install -m 644 deploy/icontainer-https.conf "$config"
if ! docker exec ic-nginx-0zOQ nginx -t; then
    install -m 644 deploy/icontainer-http.conf "$config"
    exit 1
fi
docker exec ic-nginx-0zOQ nginx -s reload
