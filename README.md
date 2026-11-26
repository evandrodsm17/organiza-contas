# Organiza Contas

Aplicação financeira compartilhada em HTML, CSS e JavaScript. A versão VPS usa uma API Node.js 24, SQLite em volume persistente e comprovantes locais privados. Não depende de Vercel ou Firebase em execução.

## Desenvolvimento

```powershell
Copy-Item .env.example .env
npm.cmd run admin -- create-master seu-email@exemplo.com "Administrador"
npm.cmd start
```

Abra `http://localhost:3000`. `create-master` funciona somente em banco vazio. Para migrar dados existentes, importe primeiro; não crie um banco paralelo com novos usuários. Senhas são solicitadas no terminal sem eco.

```powershell
npm.cmd test
```

## Funcionalidades e operação

- Login com senha local (scrypt) e sessão HttpOnly; login Google opcional via OAuth Web.
- Papéis master, proprietário, editor e leitor verificados no servidor.
- Gerenciamentos, limites mensais, planejamento de caixa, cartões, lançamentos, parcelas e recorrências.
- Comprovantes privados de até 10 MB, acessíveis somente a membros ativos.
- Atualização entre participantes por consulta a cada 5 segundos; alterações locais disparam atualização imediata.
- Uma instância da API com SQLite/WAL. Não escale para múltiplas réplicas escrevendo no mesmo volume.

Consulte [Implantação e migração](deploy/README.md). Os arquivos Firebase são mantidos como referência da origem; não são servidos pela API nem incluídos na imagem Docker. [FIREBASE_SETUP.md](FIREBASE_SETUP.md) descreve exclusivamente a versão antiga.

O [GitHub Actions](.github/workflows/deploy.yml) testa pull requests e publica a `main` na VPS. Veja [CI/CD, secrets e rollback](deploy/CI-CD.md).

## Backup portátil fora da VPS

Entre como master e abra **Configurações → Backup completo → Gerar e baixar backup**. Confirme sua senha administrativa e escolha outra senha de pelo menos 12 caracteres, preferencialmente aleatória e longa. O arquivo `.ocbackup` contém o banco SQLite consistente, os comprovantes referenciados e a chave dos comprovantes, protegidos com AES-256-GCM e derivação scrypt. Sessões são removidas somente da cópia; os usuários precisarão entrar novamente após a restauração. O download não modifica a base ativa. A exportação web limita banco + comprovantes a 512 MiB; use também o backup operacional para bases maiores. Guarde o arquivo e a senha em locais distintos, fora da VPS.

### Recuperar em uma nova máquina (Node.js 24 e tar)

```bash
node server/decrypt-backup.mjs organiza-contas-DATA.ocbackup recuperado.tar.gz
mkdir -m 700 recuperacao
tar -xzf recuperado.tar.gz -C recuperacao
```

Informe a senha do backup no terminal. O utilitário rejeita senha errada ou arquivo adulterado e não sobrescreve arquivo de saída existente. Só extraia arquivos de backups próprios e confiáveis. O TAR decifrado contém material sensível: não envie ao Git, não coloque em diretórios públicos e mantenha permissões restritas.

Em uma instalação nova e parada, copie `recuperacao/organiza.sqlite` e `recuperacao/uploads/` para o volume de dados vazio, com proprietário e permissões adequados ao usuário do container. Configure `ATTACHMENT_ENCRYPTION_KEY` no .env com o conteúdo de `recuperacao/attachment-key.txt`. Não copie esse TXT para o volume público. Configure novamente domínio, OAuth, chaves VAPID e demais parâmetros de implantação (não são incluídos). Não substitua arquivos de um banco em execução nem reutilize WAL/SHM de outra instalação. Teste login, contagens e comprovantes em uma instância isolada antes de produção. Apague com segurança as cópias decifradas quando não forem mais necessárias. Consulte também deploy/README.md para a operação e o backup periódico local.
