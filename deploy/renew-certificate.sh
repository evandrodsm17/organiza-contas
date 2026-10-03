#!/usr/bin/env bash
set -euo pipefail
site=/etc/icontainer/apps/nginx/nginx/www/sites/organiza-contas.vps11931.panel.icontainer.cloud
docker run --rm \
    -v "$site/letsencrypt:/etc/letsencrypt" \
    -v "$site/acme:/webroot" \
    certbot/certbot renew --webroot -w /webroot --quiet
docker exec ic-nginx-0zOQ nginx -t
docker exec ic-nginx-0zOQ nginx -s reload
