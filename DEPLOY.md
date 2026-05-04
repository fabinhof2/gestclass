# Deploy do GestClass

## Arquitetura recomendada

Para o seu projeto, a rota mais simples e segura hoje e:

- `frontend-escolar` no Vercel
- `backend` no Render
- banco PostgreSQL no Render

Escolhi essa combinacao porque:

- o frontend e um app Next.js, que sobe muito bem no Vercel
- o backend precisa de Node.js tradicional, Prisma e arquivos em `uploads`
- o Render permite ligar um disco persistente no backend, o que evita perder arquivos enviados pelos usuarios a cada deploy

## Antes de publicar

1. Garanta que o projeto roda localmente.
2. Tenha uma conta no GitHub e suba este repositorio.
3. Decida o dominio final:
   - frontend: `https://gestclass-seu-nome.vercel.app`
   - backend: `https://gestclass-api.onrender.com`

## Variaveis de ambiente

### Frontend (`frontend-escolar`)

Use estas variaveis no Vercel:

```env
NEXT_PUBLIC_API_URL=https://SEU-BACKEND.onrender.com
```

### Backend (`backend`)

Use estas variaveis no Render:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
JWT_SECRET=uma-chave-grande-e-segura
CORS_ORIGIN=https://SEU-FRONTEND.vercel.app
FRONTEND_URL=https://SEU-FRONTEND.vercel.app
BACKEND_URL=https://SEU-BACKEND.onrender.com
BODY_SIZE_LIMIT=2mb
AUTH_RATE_LIMIT_MAX_ATTEMPTS=10
AUTH_RATE_LIMIT_WINDOW_MINUTES=15
AUTH_RATE_LIMIT_BLOCK_MINUTES=15
MAIL_USER=
MAIL_PASS=
MAIL_FROM=
```

Notas:

- `JWT_SECRET` precisa ser unico e forte em producao.
- Se quiser liberar mais de uma origem no backend, use virgula em `CORS_ORIGIN`.
- `MAIL_*` so e obrigatorio se voce for usar convites e envio de e-mail.
- O backend agora falha ao iniciar em producao se `JWT_SECRET` ou `CORS_ORIGIN` estiverem mal configurados.

## Publicando o banco no Render

1. Crie uma conta em `render.com`.
2. Crie um banco PostgreSQL.
3. Copie a `External Database URL`.
4. Guarde essa URL para usar em `DATABASE_URL`.

## Publicando o backend no Render

1. No Render, clique em `New +` > `Web Service`.
2. Conecte o repositorio do GitHub.
3. Na criacao do servico, configure:

```text
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npx prisma migrate deploy && npm run start:prod
```

4. Adicione as variaveis de ambiente listadas acima.
5. Adicione um disco persistente.

Configuracao do disco:

- Mount Path: `/opt/render/project/src/uploads`

Isso e importante porque seu backend salva arquivos locais em `./uploads`.

## Publicando o frontend no Vercel

1. Acesse `vercel.com`.
2. Importe o mesmo repositorio.
3. Na configuracao do projeto, use:

```text
Root Directory: frontend-escolar
Framework Preset: Next.js
```

4. Adicione a variavel:

```env
NEXT_PUBLIC_API_URL=https://SEU-BACKEND.onrender.com
```

5. Faca o deploy.

## Ordem correta de publicacao

1. Suba o banco PostgreSQL.
2. Suba o backend no Render.
3. Rode as migracoes pelo comando de start do backend.
4. Teste a URL do backend.
5. Suba o frontend no Vercel.
6. Atualize `CORS_ORIGIN` e `FRONTEND_URL` no backend com a URL final do frontend.
7. Redeploy do backend se necessario.

## Testes apos o deploy

Teste pelo menos estes fluxos:

1. abrir a tela de login
2. fazer login
3. cadastrar ou listar usuarios
4. enviar um arquivo ou imagem
5. abrir um arquivo salvo em `uploads`
6. testar um fluxo financeiro, se estiver usando Mercado Pago

## Pontos de atencao do seu projeto

- O backend hoje depende de arquivos locais em `uploads`, entao nao e bom hospeda-lo em servicos sem disco persistente.
- O frontend precisa da variavel `NEXT_PUBLIC_API_URL` apontando para a URL publica do backend.
- O backend precisa de `CORS_ORIGIN` com a URL publica do frontend.
- Recursos como Mercado Pago, links de retorno e e-mails dependem de `FRONTEND_URL` e `BACKEND_URL` corretos.
- Documentos sensiveis nao devem ser expostos por URL publica; use apenas as rotas autenticadas de download.

## Protecoes ja aplicadas no codigo

- `JWT_SECRET` saiu do codigo fixo e virou variavel de ambiente.
- O backend agora exige configuracao minima de seguranca em producao.
- Foram adicionados cabecalhos de seguranca nas respostas do backend.
- Foi aplicado limite para tamanho de corpo das requisicoes.
- O login ganhou limitacao contra muitas tentativas seguidas.
- Uploads agora validam tipo e tamanho de arquivo.
- Documentos sensiveis em `uploads` agora ficam bloqueados para acesso publico direto.

## Alternativa

Se preferir deixar tudo no mesmo provedor, uma alternativa e:

- frontend no Vercel
- backend + Postgres + volume no Railway

Mas, para o seu caso, Render tende a ficar mais direto para o backend com uploads.
