# Guia de novas aplicações na VPS

Padrão para Node.js, Next.js, React e PostgreSQL: Nginx no host recebe HTTPS, encaminha para uma porta em `127.0.0.1` e a aplicação roda em Docker. O PostgreSQL fica apenas na rede Docker.

```text
Internet → DNS → Nginx 80/443 → 127.0.0.1:PORTA → container app → PostgreSQL privado
```

Não exponha portas de aplicações ou bancos na internet. Apenas Nginx deve atender 80/443.

## Planejamento

Para cada projeto, documente privadamente o diretório (`/opt/projeto`), subdomínio, porta local (por exemplo `3101`), volume do banco e rotina de backup.

```bash
docker ps
ss -ltnp
df -h
free -h
mkdir -p /opt/minha-app/backups
cd /opt/minha-app
git clone git@github.com:USUARIO/REPOSITORIO.git .
cp .env.example .env
chmod 600 .env
```

Não versiona `.env`, backups, chaves, dumps ou `node_modules`.

## Compose: Node + PostgreSQL

Crie `compose.yaml`:

```yaml
name: minha-app
services:
  app:
    build: .
    image: minha-app:${APP_IMAGE_TAG:-local}
    restart: unless-stopped
    init: true
    environment:
      NODE_ENV: production
      PORT: "3000"
      APP_ORIGIN: https://${APP_DOMAIN}
      DATABASE_URL: postgresql://app:${POSTGRES_PASSWORD}@db:5432/app
      JWT_SECRET: ${JWT_SECRET}
    ports: ["127.0.0.1:3101:3000"]
    depends_on:
      db: { condition: service_healthy }
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    mem_limit: 768m
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
  db:
    image: postgres:17-bookworm
    restart: unless-stopped
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 10s
      timeout: 5s
      retries: 10
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
volumes:
  postgres_data:
```

Nunca coloque `ports:` no serviço `db`. Acesse-o com `docker compose exec db psql -U app -d app`.

Exemplo de `.env`:

```env
APP_DOMAIN=app.seudominio.com
APP_IMAGE_TAG=local
POSTGRES_PASSWORD=senha-longa-e-unica
JWT_SECRET=segredo-com-32-bytes-ou-mais
```

Gere segredos com `openssl rand -base64 32`. Para Next.js use `output: "standalone"` e imagem multiestágio; para React estático, gere o build e sirva-o com Nginx/Caddy. Use `npm ci`, nunca `npm install` no runtime de produção.

### Dependências dentro da imagem Docker

Se a aplicação usa dependências de runtime, o Dockerfile deve copiar **os dois** arquivos e instalar pelo lockfile:

```dockerfile
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
```

Se o `.dockerignore` começa ignorando tudo (`*`), libere os dois arquivos:

```dockerignore
*
!package.json
!package-lock.json
!server/
!server/**
```

Sem isso, testes locais podem passar enquanto a imagem de produção falha por lockfile ausente ou módulo não encontrado.

### Arquivos estáticos fora de `assets/`

Service workers, manifestos, `robots.txt`, ícones e outros arquivos servidos pela raiz do domínio também precisam entrar na imagem. Quando usar uma allowlist no `.dockerignore`, libere-os e copie-os no Dockerfile:

```dockerignore
!push-sw.js
!site.webmanifest
!favicon.ico
```

```dockerfile
COPY index.html favicon.ico site.webmanifest push-sw.js ./
```

Após o deploy, confirme o código HTTP do arquivo público antes de testar no navegador:

```bash
curl -I https://app.seudominio.com/push-sw.js
```

Para service workers, o resultado precisa ser `200` e o domínio deve usar HTTPS; um `404` impede a inscrição em notificações push.

## Subdomínio, Nginx e HTTPS

1. Crie o registro DNS `A app.seudominio.com → IP_DA_VPS`.
2. Confirme com `dig +short app.seudominio.com`.
3. Crie `/etc/nginx/conf.d/app.seudominio.com.conf`:

```nginx
server {
    listen 80;
    server_name app.seudominio.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name app.seudominio.com;
    ssl_certificate /etc/letsencrypt/live/app.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.seudominio.com/privkey.pem;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

Em servidor direto, emita TLS com `certbot --nginx -d app.seudominio.com`; se o painel já controla certificados, use o fluxo do painel. Sempre valide e recarregue com:

```bash
nginx -t && systemctl reload nginx
```

### Código publicado não atualiza a infraestrutura da VPS

Um pipeline que transmite somente a imagem Docker não atualiza `compose.yaml`, `.env`, Nginx, timers nem scripts do host. Ao adicionar uma variável de ambiente, atualize o Compose e o `.env` da VPS antes do deploy.

```bash
cd /opt/minha-app
cp .env .env.before-change
cp compose.yaml compose.before-change.yaml
docker compose config --quiet
docker compose up -d --no-build --no-deps --wait app
```

## Web Push e chaves VAPID

Gere o par VAPID com a mesma biblioteca usada pela aplicação, para garantir o formato correto:

```bash
docker compose run --rm --no-deps --entrypoint node app -e "import webpush from 'web-push'; console.log(JSON.stringify(webpush.generateVAPIDKeys()))"
```

Guarde `publicKey` e `privateKey` no `.env` como `WEB_PUSH_VAPID_PUBLIC_KEY` e `WEB_PUSH_VAPID_PRIVATE_KEY`, e repasse ambas no serviço `app` do Compose. A chave privada é segredo: não use Git, frontend ou logs. Antes de publicar, inicie a nova imagem isoladamente com as variáveis configuradas para validar a inicialização.

## Deploy, migrations e rollback

```bash
cd /opt/minha-app
docker compose config --quiet
docker compose build --pull app
docker compose up -d --wait
curl --fail http://127.0.0.1:3101/health
curl --fail https://app.seudominio.com/health
docker compose run --rm app npm run migrate
```

Migrations devem ser versionadas. Antes de operações destrutivas, faça backup. Prefira alterações em etapas: adicionar coluna nullable, publicar código compatível, preencher dados e só depois tornar obrigatório/remover o campo antigo. Rollback de código não reverte banco automaticamente; mantenha migrations compatíveis enquanto a versão anterior existir.

## PostgreSQL: backup e restauração

```bash
cd /opt/minha-app
docker compose exec -T db pg_dump -U app -d app -Fc > backups/app-$(date -u +%Y%m%dT%H%M%SZ).dump
docker compose exec -T db createdb -U app app_restore_test
docker compose exec -T db pg_restore -U app -d app_restore_test --clean --if-exists < backups/ARQUIVO.dump
docker compose exec -T db dropdb -U app app_restore_test
```

Automatize o dump diário com timer/cron, retenção e cópia externa. Backup no mesmo disco não protege contra perda da VPS.

## Segurança, manutenção e diagnóstico

- Use chaves SSH e usuário de deploy separado; depois de validar acesso de recuperação, desabilite senha SSH.
- Firewall: 80/443 públicos, 22 restrito quando possível, banco fechado.
- Use containers não-root, filesystem somente leitura quando possível, `cap_drop: [ALL]`, healthchecks e limites de memória.
- Rotacione imediatamente credenciais compartilhadas ou expostas.
- Nunca recarregue Nginx sem `nginx -t`.

```bash
docker ps
docker compose logs --tail=100 app
docker compose logs --tail=100 db
docker stats --no-stream
df -h
nginx -t
ss -ltnp | grep 3101
```

Para erro `502`, confirme nesta ordem: container saudável, porta local, `proxy_pass`, logs da aplicação e log de erro do Nginx. Não altere DNS ou certificados sem evidência.

## Checklist

- [ ] DNS aponta para a VPS.
- [ ] `.env` usa modo `600` e está fora do Git.
- [ ] `docker compose config --quiet` passa.
- [ ] A aplicação responde localmente e em HTTPS.
- [ ] PostgreSQL não expõe porta.
- [ ] Healthcheck, backup, restauração e rollback foram testados.
