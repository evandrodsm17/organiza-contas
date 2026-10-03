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
