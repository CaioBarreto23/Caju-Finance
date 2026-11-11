# Caju Finance 🥭

Assistente financeiro inteligente e plataforma de gestão de património desenvolvida para organização financeira individual e de casal. A arquitetura prioriza a privacidade do utilizador, processando dados sensíveis diretamente no navegador e sincronizando um estado consolidado na nuvem.

## ✨ Funcionalidades Principais

* **Privacidade Dupla:** Perfis de acesso independentes (Caio e Juliana) protegidos por PIN com hash determinístico.
* **Leitor de Extratos Offline (Parser):** Extração e categorização automática de transações via ficheiros PDF (Itaú, Nubank, Banco do Brasil, Mercado Pago) executada 100% no cliente (Client-side regex), sem envio de documentos para servidores externos.
* **Motor de Conciliação:** Emparelhamento automático de transferências entre contas e aplicação da "Regra dos R$ 300,00" para gestão de investimentos do casal.
* **Agente Albert:** Sistema de auditoria automatizado para deteção de assinaturas e despesas duplicadas.
* **Lançamentos via Telegram:** Bot integrado via Webhook para registo instantâneo de despesas móveis com identificação automática de utilizador (via Telegram ID).

## 🛠 Tecnologias Utilizadas

* **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS.
* **Backend / Database:** Supabase (PostgreSQL) com estado unificado em coluna `JSONB`.
* **Integrações:** Telegram Bot API (Webhooks).
* **Deploy:** Vercel (CI/CD via GitHub).

## ⚙️ Arquitetura de Dados (Single Source of Truth)

Em vez de um modelo relacional tradicional, o projeto utiliza uma arquitetura de "estado empacotado". Toda a lógica de negócio corre no frontend (`app/page.tsx`). As ações do utilizador disparam a rota `/api/sync`, que guarda a totalidade do estado (transações, categorias, alertas) num único documento JSON no Supabase, garantindo leituras rápidas e consistência em tempo real entre dispositivos.

## 🚀 Como Executar Localmente

**1. Clone o repositório**
\`\`\`bash
git clone https://github.com/SEU_USUARIO/caju-finance.git
cd caju-finance
\`\`\`

**2. Instale as dependências**
\`\`\`bash
npm install
\`\`\`

**3. Configure as Variáveis de Ambiente**
Crie um ficheiro `.env.local` na raiz do projeto e adicione as seguintes chaves:
\`\`\`env
SUPABASE_URL=https://sua-url-do-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_sua_chave_service_role
TELEGRAM_BOT_TOKEN=seu_token_do_botfather
TELEGRAM_ID_CAIO=telegram_id_caio
TELEGRAM_ID_JULIANA=telegram_id_juliana
\`\`\`

**4. Inicie o servidor de desenvolvimento**
\`\`\`bash
npm run dev
\`\`\`
Aceda a [http://localhost:3000](http://localhost:3000) no seu navegador.

## 🤖 Comandos do Bot (Telegram)

O webhook escuta mensagens no formato: `[Descrição] [Valor] [Nome Opcional]`.
O sistema reconhece automaticamente o remetente pelo ID do Telegram.

* **Exemplo Padrão:** `Uber 25,90` (Atribui o gasto a quem enviou a mensagem).
* **Exemplo com Atribuição:** `Mercado 152,40 juliana` (Força o registo no perfil da Juliana, independentemente de quem enviou).