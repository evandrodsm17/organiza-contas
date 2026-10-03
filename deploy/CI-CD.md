# GitHub Actions e deploy da VPS

O workflow `CI and Deploy VPS` roda testes em pull requests para `main`. Pushes em `main` e execuções manuais nessa branch fazem deploy depois dos testes.

## Fluxo

1. Instalação reprodutível, testes Node.js, validação de Compose e scripts.
2. Testes isolados de backup, falha de deploy e rollback.
3. Build de imagem `organiza-contas:COMMIT_SHA` e testes dentro dessa imagem.
4. Transmissão da imagem por SSH à VPS; o servidor confere tag e revisão.
5. Backup consistente do volume, atualização do container e verificação de saúde com o SHA publicado.
6. Se a atualização falhar, restaura a imagem e a configuração anteriores. O banco não é restaurado automaticamente, para não perder gravações.

O banco e os comprovantes permanecem no mesmo volume. O deploy pausa brevemente a aplicação para produzir o backup consistente. Backups e deploys usam o mesmo lock, evitando operações simultâneas.

## Configuração GitHub

Ambiente: **Production**, limitado à branch `main`. Secrets:

| Secret | Uso |
| --- | --- |
| `VPS_HOST` | Host da VPS |
| `VPS_PORT` | Porta SSH |
| `VPS_USER` | Conta SSH |
| `VPS_SSH_KEY` | Chave exclusiva de deploy |
| `VPS_KNOWN_HOSTS` | Chave pública do host previamente conferida |

As actions oficiais estão fixadas por SHA. Pull requests não recebem os secrets de produção. O workflow usa somente `contents: read`; segredos OAuth, dados e chaves Firebase não são enviados ao runner.

A chave de deploy tem comando forçado em `authorized_keys`: pode enviar uma imagem, consultar status ou solicitar rollback. Não permite shell interativo, SCP, encaminhamento de portas ou agente. O programa instalado como root em `/usr/local/sbin/organiza-deploy` só aceita comandos com revisão validada. Como qualquer credencial de deploy, ela permite publicar código que acessa os dados da aplicação; mantenha o acesso de escrita ao repositório restrito.

## Atualizações normais

Faça commit, publique a branch e abra um pull request. Após revisar e integrar em `main`, acompanhe **Actions → CI and Deploy VPS**. Para republicar a revisão atual, use **Run workflow** em `main`.

O endpoint `/api/health` informa `revision`. A revisão anterior fica em `/opt/organiza-contas/releases/previous`; a atual, em `releases/current`. Logs de deploy ficam no GitHub Actions. Backups anteriores à publicação ficam em `/opt/organiza-contas/backups/pre-deploy-*.tar.gz`.

## Rollback manual

No terminal da VPS:

```bash
cat /opt/organiza-contas/releases/previous
/usr/local/sbin/organiza-deploy rollback SHA_DA_REVISAO
```

O rollback também cria um backup e preserva o banco atual. `bootstrap` identifica a imagem que estava em produção antes da primeira execução do pipeline. A compatibilidade do schema com a imagem anterior deve ser mantida quando forem introduzidas migrations futuras.

## Configuração do servidor

CI publica **a imagem da aplicação**. Arquivos de infraestrutura da VPS — Compose, Nginx, timers e o gateway de deploy — são administrados separadamente; alterações nesses arquivos no Git não os substituem automaticamente no servidor. O código-fonte copiado durante a migração em `/opt/organiza-contas/server` não é a referência da versão em execução: a imagem e o SHA são.

`APP_IMAGE_TAG` em `/opt/organiza-contas/.env` seleciona a imagem. O gateway é instalado com dono root e modo 755 a partir de `deploy/github-deploy.sh`. Não use `docker compose up --build` para atualizar produção após habilitar o pipeline: isso poderia reconstruir código antigo do host sob a tag atual.

Imagens antigas e backups não são apagados automaticamente. Monitore espaço e configure retenção e cópia externa de backups conforme o volume de uso.
