# OrganizeFinance — Organiza

Aplicativo de organização financeira pessoal para acompanhar o que você precisa pagar a cada mês. Reúne dívidas com pessoas, faturas de cartões e linhas de crédito bancárias, com uma agenda mensal e controle dos pagamentos realizados.

Esta é a primeira versão do projeto (MVP), em desenvolvimento. No momento, o trabalho é feito localmente em `http://localhost:3000/`.

## O que você pode fazer

### Início e agenda mensal

- Escolher o mês e consultar o total dos compromissos, o valor já pago e o que ainda falta pagar.
- Visualizar todos os pagamentos do mês na aba **Agenda**, separados entre **Pessoas** e **Bancos**, com subtotal por grupo.
- Conferir nome, foto, descrição, parcela, valor e situação de cada pagamento, em ordem de vencimento.
- Identificar a situação pelas etiquetas: **Em aberto** em laranja, **Fechada** em roxo e **Paga** em verde. Dívidas com pessoas usam apenas **Em aberto** e **Paga**.
- Ver os dias de fechamento e vencimento das faturas de cartão na agenda, inclusive depois de fechadas ou pagas.

### Dívidas com pessoas

- Cadastrar, editar ou excluir pessoas com nome e foto.
- Recortar e enquadrar a foto com zoom e arraste direto na imagem.
- Cadastrar e editar dívidas à vista ou parceladas, informando valor total, quantidade de parcelas, mês inicial e dia do vencimento.
- Marcar e desmarcar parcelas pagas e acompanhar os meses de cada parcela.
- Consultar o valor a pagar no mês e o saldo restante de cada pessoa.

### Bancos, cartões e faturas

- Cadastrar bancos com nome e foto, editar ou excluir seus cards.
- Adicionar cartões com nome, dia de fechamento e dia de vencimento.
- Lançar e editar os valores das faturas do mês selecionado e dos próximos meses.
- Editar a fatura atual diretamente no seu painel, inclusive se já estiver fechada ou paga.
- Acompanhar a situação aberta/fechada calculada pela data do dispositivo e marcar o pagamento manualmente.

### Linhas de crédito

- Registrar o produto, valor total, número de parcelas e a data completa do primeiro vencimento.
- Informar o valor da parcela quando houver juros e visualizar a diferença em reais entre a soma das parcelas e o valor original.
- Acompanhar vencimentos mensais e marcar as parcelas pagas. Linhas de crédito não possuem data de fechamento.

O valor de juros exibido é uma estimativa simples: `máximo de zero e (valor da parcela × quantidade de parcelas − valor original)`. Não é um cálculo de taxa de juros ou de CET.

## Como executar localmente

Requisitos: **Node.js 22.13 ou superior**, **pnpm** e **Git**. É necessário acesso ao repositório privado para cloná-lo.

```bash
git clone https://github.com/luizfelipee7/OrganizeFinance.git
cd OrganizeFinance
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço informado pelo terminal, normalmente `http://localhost:3000/`.

Outros comandos disponíveis:

```bash
pnpm build   # Gera a versão de produção
pnpm start   # Executa a versão gerada
pnpm lint    # Executa a análise de código
```

## Onde ficam os dados

Os cadastros, fotos e pagamentos são armazenados no **localStorage do navegador**, na chave `organiza-data-v1`. A aplicação começa sem cadastros de exemplo.

- Os dados pertencem ao navegador e ao endereço utilizados. `localhost` e o site hospedado têm armazenamentos separados.
- Não há sincronização automática entre dispositivos ou navegadores nesta versão.
- Limpar os dados do site no navegador remove os cadastros desse endereço.
- O repositório guarda o código do aplicativo; ele não é um backup das informações financeiras cadastradas.
- Nesta versão, o app não se conecta às contas bancárias nem realiza pagamentos. O controle é preenchido manualmente.

## Tecnologias e estrutura

O projeto utiliza **React 19**, **TypeScript**, **Vinext/Vite** com estrutura App Router compatível com Next.js e **Tailwind CSS**. Também mantém a configuração de integração com Sites/Cloudflare para uma futura publicação. Não há banco de dados remoto ou armazenamento de fotos remoto configurado neste MVP.

```text
app/
  page.tsx       # Telas, formulários, cálculos e estado do aplicativo
  globals.css    # Estilos e responsividade
  layout.tsx     # Layout principal, fontes e metadados
public/          # Ícone e imagem de compartilhamento do app
.openai/         # Identificação do projeto para hospedagem via Sites
vite.config.ts   # Configuração do Vinext/Vite e integração com Cloudflare
pnpm-lock.yaml   # Versões fixadas das dependências
```

Dependências instaladas, arquivos de compilação, caches, arquivos de ambiente e pastas temporárias não são versionados. Publicar o código no GitHub não atualiza automaticamente o site hospedado.
