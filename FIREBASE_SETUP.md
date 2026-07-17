# Configuração do Conta Clara no Firebase

A interface usa HTML, CSS e JavaScript puro. Authentication e Firestore são acessados pelo SDK CDN. A criação de contas usa uma segunda sessão isolada do Authentication para não desconectar o master.

## Recursos implementados

- login exclusivo para contas autorizadas;
- primeiro usuário com papel `master`;
- master cria usuários e define quem pode criar gerenciamentos;
- calendários financeiros compartilhados;
- papéis de proprietário, editor e somente leitura;
- entradas e débitos categorizados;
- vencimento, data planejada e data real de pagamento/recebimento independentes;
- status pendente/pago;
- estrutura preparada para comprovantes quando o Storage for ativado;
- sincronização em tempo real entre participantes.

## 1. Criar o projeto

1. Crie um projeto no Firebase Console.
2. Adicione um aplicativo Web e copie a configuração para `assets/js/firebase-config.js`.
3. Habilite **Authentication > E-mail/senha**.
4. Crie o Cloud Firestore em modo de produção.
5. O Cloud Storage é opcional e exige o plano Blaze em projetos novos. Sem ele, apenas os anexos ficam indisponíveis.
6. Instale as ferramentas: `npm install -g firebase-tools`.
7. Na pasta do projeto, execute `firebase login` e `firebase use --add`.

## 2. Criar o primeiro master

O primeiro master é inicializado manualmente uma única vez:

1. Em **Authentication > Users**, crie o usuário master.
2. Copie seu `uid`.
3. No Firestore, crie a coleção `users` e um documento cujo ID seja exatamente esse `uid`.
4. Preencha:

```json
{
  "name": "Administrador",
  "email": "seu-email@dominio.com",
  "role": "master",
  "active": true,
  "canCreateManagement": true
}
```

Depois disso, novos usuários devem ser criados somente pelo painel master.

## 3. Instalar e publicar

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

O índice composto pode levar alguns minutos para ficar pronto. Enquanto estiver sendo construído, o console do navegador poderá mostrar um link para acompanhar sua criação.

## Modelo de dados

```text
users/{uid}
managements/{managementId}
  memberIds[]
  memberRoles.{uid}
  transactions/{transactionId}
Storage: managements/{managementId}/receipts/{file}
```

As senhas nunca são gravadas no Firestore. Elas pertencem exclusivamente ao Firebase Authentication.

## Observações de segurança

- A configuração Web do Firebase é pública por natureza; a proteção está nas regras.
- As regras só permitem que o master crie um perfil utilizável no Firestore.
- O Authentication permite cadastro técnico de contas, mas uma conta sem perfil autorizado não consegue acessar nenhum dado da aplicação.
- Somente o proprietário compartilha um gerenciamento.
- Participantes `viewer` podem consultar, mas não alterar lançamentos ou anexos.
- Desativar um perfil bloqueia o aplicativo pelas regras, mas não exclui sua conta do Authentication.
- Para produção, habilite App Check e defina uma política de backup/exportação do Firestore.

## Desenvolvimento local

Sirva os arquivos por HTTP, nunca abrindo `index.html` diretamente como `file://`:

```powershell
npx serve .
```

Inclua o domínio local ou de produção em **Authentication > Settings > Authorized domains**.
