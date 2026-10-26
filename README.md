# 🖨️ Prisma 3D Studio - Sistema de Gestão & Linha de Produção

Sistema web moderno, responsivo e seguro desenvolvido sob medida para a **Prisma 3D**, estúdio de impressão 3D sob encomenda.

---

## 🌟 O que o sistema resolve

1. **Gestão de Prazos Dinâmicos & Flexíveis**:
   - Prazos com alerta visual por cor (🟢 No prazo, 🟡 Vence em até 48h, 🔴 Atrasado).
   - Campo para **Prazo Ajustado** com histórico de motivo (ex: *reimpressão por falha na camada*, *cliente solicitou alteração no STL*).
   - Linha de produção visual em **Kanban com 6 etapas**:
     1. 📝 *Orçamento & STL*
     2. ⏳ *Na Fila de Espera*
     3. 🖨️ *Imprimindo* (com horas estimadas de máquina)
     4. 🎨 *Pós-Processamento & Acabamento*
     5. 📦 *Pronto para Envio / Retirada*
     6. ✅ *Finalizado / Entregue*

2. **Cadastro Completo de Clientes (CRM & Frete)**:
   - Nome, CPF/CNPJ, E-mail e WhatsApp.
   - **Botão direto para o WhatsApp** com mensagem pronta preenchida com um clique.
   - **Busca automática de CEP (ViaCEP)** para preenchimento de endereço de frete (Sedex/Transportadora).

3. **Insumos de Impressão 3D & Bobinas de Filamento**:
   - Cadastro de carretéis (PLA, PETG, ABS, ASA, TPU, Resinas UV).
   - **Cálculo automático de custo por grama (R$/g)**.
   - **Calculadora Instantânea de Fatiador**: digite os gramas e horas do Cura/Bambu Studio/PrusaSlicer e veja na hora o custo do material e o preço de venda sugerido.

4. **Controle Financeiro & Lucro Real**:
   - Acompanhamento de Entradas (Sinal e Saldo Restante).
   - Dedução direta do custo de filamento e energia consumida.
   - Cálculo do **Lucro Líquido Real** por peça e no acumulado do mês.

5. **Segurança com Senha & Nuvem Realtime**:
   - Protegido por **Firebase Auth** (Login com e-mail e senha).
   - Banco de dados em tempo real no **Firebase Firestore** (gratuito perpétuo).

---

## 🚀 Como Executar Localmente

No terminal, dentro desta pasta:

```bash
npm start
```

Abra no seu navegador: **`http://localhost:3000`**

Você será direcionado para a tela de login. Basta entrar com o mesmo e-mail e senha cadastrados no seu Firebase!

---

## ☁️ Como Colocar 100% Online Grátis (Vercel)

Como o sistema é uma Single Page Application estática conectada ao Firebase:

1. Suba esta pasta para um repositório no seu **GitHub**.
2. Acesse [vercel.com](https://vercel.com) e conecte o repositório.
3. Configure o **Root Directory** como `./app` (ou deixe o padrão).
4. Clique em **Deploy**.
5. Pronto! O sistema estará disponível em `https://seu-projeto.vercel.app` para acessar no celular da oficina, tablet ou computador, de qualquer lugar do mundo.

---

## 📁 Estrutura de Arquivos

```text
Prisma/
├── app/
│   ├── index.html            # Redirecionador autenticado
│   ├── login.html            # Tela de login com e-mail e senha
│   ├── dashboard.html        # Estrutura principal da dashboard e modais
│   ├── css/
│   │   ├── auth.css          # Estilos da tela de login
│   │   └── dashboard.css     # Design system glassmorphic responsivo
│   ├── js/
│   │   ├── firebase-config.js # Conexão com Firebase Auth & Firestore
│   │   ├── seguranca.js      # Proteção de rotas e sessão
│   │   └── dashboard.js      # Lógica SPA, CRUD, cálculos e Kanban
│   ├── views/
│   │   ├── home.html         # Visão geral, alertas e fila prioritária
│   │   ├── producao.html     # Kanban 3D com 6 etapas de produção
│   │   ├── clientes.html     # CRM de clientes e endereços de entrega
│   │   ├── insumos.html      # Bobinas, estoque e calculadora de fatiador
│   │   └── financeiro.html   # Fluxo de pagamentos e lucro líquido
│   └── assets/
│       └── logo.svg          # Logo oficial Prisma 3D Studio
├── server.js                 # Servidor local de desenvolvimento sem dependências
└── package.json              # Configuração do projeto Node.js
```
