# Código do Concurso

Você digita o concurso (ex.: "Guarda Municipal de São Gonçalo", RJ) e o app:

- pesquisa na internet se o concurso está **aberto, previsto ou encerrado**;
- encontra o **edital**, a **banca**, as datas, as vagas e a nota mínima;
- monta o **mapa do edital**: matérias, nº de questões, pesos e assuntos;
- lista os **concursos abertos no seu estado**;
- cria **questões no estilo da banca** para medir seu nível em cada matéria e assunto;
- mostra sua **chance de passar do corte** e diz **o que treinar** para subir a nota.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app (tudo que aparece na tela) |
| `api/ia.js` | O servidor que pesquisa na internet com a IA do Google (Gemini) |
| `vercel.json` | Configuração da hospedagem |
| `firestore.rules` | Regras de segurança do login com Google (opcional) |

## Por que precisa de um servidor

Um site comum não consegue ler editais de outros sites, e a chave da IA não pode ficar visível no navegador. Por isso existe o arquivo `api/ia.js`. A **Vercel** hospeda o site e esse servidor juntos, de graça no plano Hobby.

## Passo 1: pegar a chave da IA (5 min)

1. Acesse https://aistudio.google.com e entre com sua conta Google.
2. Clique em **Get API key → Create API key** e copie a chave.
3. A IA usa a "Pesquisa Google" para achar os editais. O Google tem uma cota gratuita, mas a pesquisa pode ser cobrada acima dela. Confira os valores atuais em https://ai.google.dev/pricing e, se quiser, defina um limite de gastos no Google Cloud.

## Passo 2: publicar na Vercel (10 min)

1. Crie uma conta em https://github.com e um repositório novo (ex.: `codigo-do-concurso`). Envie para ele todos os arquivos, mantendo a pasta `api/`. Pelo celular dá para usar "Add file → Upload files" no site do GitHub.
2. Acesse https://vercel.com, entre com o GitHub e clique em **Add New → Project**. Escolha o repositório.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `GEMINI_API_KEY` = a chave do passo 1
   - (opcional) `GEMINI_MODEL` = nome do modelo. O padrão é `gemini-3.6-flash`. Se o Google lançar outro, é só trocar aqui.
4. Clique em **Deploy**. O site fica em `https://codigo-do-concurso.vercel.app` (ou parecido).

Pronto: a busca de editais já funciona.

## Passo 3 (opcional): login com Google

Sem login, cada pessoa usa normalmente e o progresso fica salvo no próprio celular. Com login, o progresso fica na nuvem e aparece em qualquer aparelho.

1. Em https://console.firebase.google.com, crie um projeto.
2. **Authentication → Sign-in method → Google → Ativar**.
3. **Authentication → Settings → Authorized domains** → adicione o domínio da Vercel (ex.: `codigo-do-concurso.vercel.app`).
4. **Firestore Database → Create database** (região `southamerica-east1`). Na aba **Rules**, cole o conteúdo de `firestore.rules` e publique.
5. Em **Configurações do projeto → Seus apps → Web (`</>`)**, copie `apiKey`, `authDomain`, `projectId` e `appId` e cole em `FIREBASE_CONFIG`, no começo do script do `index.html`.
6. Na Vercel, adicione também a variável `FIREBASE_API_KEY` com a mesma `apiKey`. Assim, só quem estiver logado consegue usar a IA, o que protege sua cota contra abuso.
7. Envie o `index.html` atualizado para o GitHub. A Vercel publica sozinha.

## Instalar no celular

Abra o site → menu do navegador → **Adicionar à tela inicial**.

## Como os cálculos funcionam

- **Nota projetada:** para cada matéria, multiplica seu % de acerto pelos pontos que ela vale no edital (questões × pontos por questão), com um ajuste pelo nível da banca. Matérias ainda não testadas contam como 35%.
- **Chance de passar:** compara a nota projetada com a nota de corte ou mínima do edital. Você pode trocar a nota de corte no Perfil.
- **O que fazer agora:** prioriza (1) prazo de inscrição acabando, (2) matérias sem diagnóstico, (3) assuntos com acerto abaixo de 60%, ordenados pelo impacto em pontos, (4) a matéria que mais aumenta a sua nota.
- **Questões da IA:** podem conter erros. Se achar uma questão errada, toque em "anular" depois de responder, e ela deixa de contar.
