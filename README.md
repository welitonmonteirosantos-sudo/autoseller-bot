# Berovenda's AutoSeller — pacote consolidado

Esta versão concentra o bot em `src/index.js` para reduzir a necessidade de editar muitas pastas durante a construção.

## Railway variables
- `DISCORD_TOKEN`
- `DATABASE_URL`
- `PANEL_IMAGE_URL`

## Comandos
- `+ping`
- `+painel`
- `+admin`
- `+hs 10`

## Incluído
- Produtos 100 RAP (R$ 3,50) e 1.000 RAP (R$ 17,00)
- Estoque persistente PostgreSQL
- Painel de compra e painel admin
- Seleção 1–10 unidades
- Um produto por ticket
- Lista de espera 10 pessoas, entrada/saída e DM em reposição
- Histórico persistente e +hs
- Logs administrativos protegidos
- Preço editável pelo painel
- Tabela persistente para cupons e feedback
- Conclusão manual da compra, cargo CLIENTE e registro em vendas

## Observação
Integração com intermediador de pagamento não está ativada porque ainda depende da escolha do provedor e das credenciais/API.
