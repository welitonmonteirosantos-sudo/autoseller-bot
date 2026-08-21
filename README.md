# Berovenda's AutoSeller

Bot Discord para vendas de RAP do Blade Ball, hospedado no Railway e usando PostgreSQL.

## Variáveis obrigatórias no Railway

- `DISCORD_TOKEN` — token do bot.
- `DATABASE_URL` — referência para `${{Postgres.DATABASE_URL}}`.
- `PANEL_IMAGE_URL` — URL pública permanente do banner.

## Variáveis opcionais

- `PAYMENT_INSTRUCTIONS` — texto exibido no ticket para orientar o pagamento manual.

## Comandos administrativos

- `+setup` — cria/verifica canais, categorias, permissões e publica painéis básicos.
- `+painel` — publica/atualiza o painel de compras.
- `+admin` — publica/atualiza o painel administrativo.
- `+hs 10` — remove os 10 registros mais antigos do histórico comum. Logs administrativos não são apagados.
- `+ping` — teste do bot.

## Recursos

- 100 RAP e 1.000 RAP.
- Quantidade de 1 a 10 por pedido.
- Um produto por ticket.
- Estoque e preços persistentes.
- Lista de espera de até 10 pessoas por produto.
- Aviso por DM e canal de avisos, em sequência de 1 minuto, sem reserva de estoque.
- Cupons com percentual/valor fixo, validade, produto opcional, limite total e limite por usuário.
- Tickets privados de compra e suporte.
- Pagamento manual com confirmação administrativa.
- Conclusão/cancelamento de pedidos.
- Cargo CLIENTE após entrega.
- Feedback de 1 a 10 estrelas, uma vez por compra concluída.
- Canal de entregas com avatar, produto, quantidade, valor e horário.
- Histórico comum persistente e logs administrativos protegidos.
- Filtro de logs administrativos.

## Pagamento

A integração com um intermediador real não está ativada porque o provedor/API ainda não foi definido. O fluxo atual é manual: pedido -> ticket -> confirmar pagamento -> marcar entregue.
