---
slug: compliance-loja-franca
status: draft
revision_count: 0
created: 2026-10-16
---

# Compliance Loja Franca de Fronteira Terrestre (Estoque-NY) — Fase 1

> **Aviso obrigatório:** requisitos vêm de leitura de fonte pública da IN RFB nº 2075/2022 (resumida
> via busca web), **não é parecer jurídico**. Nenhum REQ abaixo deve ser implementado antes de
> validação com contador/despachante aduaneiro especializado (ver Em aberto, item 1). Por isso
> `status: draft`, não `ready`.

## Objetivo

Dar ao Estoque-NY a base de dados e as travas mínimas para operar como loja franca de fronteira
terrestre: saber a origem e o lote de cada mercadoria, identificar o comprador, registrar a venda
e barrar compras acima do limite por viajante. Fase 1 só cobre a fundação operacional dentro do
sistema; integração com o Sistema de Loja Franca (RFB/Serpro), Fundaf e inventário trimestral
ficam para fases seguintes.

## Estado atual (verificado em `app/models/entities.py`, 2026-10-16)

- Não existem `Customer`, `Sale`, NCM, origem, lote nem data de admissão.
- `SKU.tax_code` existe (texto livre, até 50 chars, nulo), sem validação nem uso conhecido.
- `SKU.attributes` é JSON livre. `StockMove` tem `qty`, `move_type`, `reason`, `reference_id`,
  sem custo, lote ou documento de origem.

## Requisitos

- [ ] REQ-1: `SKU` ganha `ncm` (8 dígitos, validado no schema e na API; nulo permitido para SKUs
  antigos) e `origin` (`FOREIGN`, `NATIONAL`, `EXPORTED_NO_EXIT`; padrão nulo). Migração Alembic roda
  do zero em SQLite e gera SQL equivalente para Postgres. A tela de Variações edita os dois campos.
- [ ] REQ-2: Entrada de estoque (`RECEIPT`) exige `admission_date` e cria um lote
  (`StockLot`: sku, filial, qty restante, `admission_date`, `origin`). Saídas consomem lotes do mais
  antigo para o mais novo (FIFO). Saldo por lote soma o `StockBalance` do SKU; teste cobre a
  invariante.
- [ ] REQ-3: Relatório/endpoint de lotes que passam de 335 dias de permanência (aviso) e de 365/730
  dias (vencido, conforme o prazo de 1 ano prorrogável por mais 1 do Art. 20). Dados e cálculo
  em teste com datas fixas.
- [ ] REQ-4: `Customer` (nome, tipo de documento `PASSPORT`/`MERCOSUL_ID`/`CPF`, número, país,
  data de nascimento). Documento único por tipo. Sem CPF obrigatório. Dados pessoais só acessíveis
  com permissão própria, e toda leitura/escrita gera `AuditLog`.
- [ ] REQ-5: `Sale` e `SaleItem` (cliente, filial, itens com sku, qty, preço em US$). Criar venda
  gera `StockMove` `ISSUE` por item, consome lotes (REQ-2) e é idempotente pelo mecanismo existente
  (`Idempotency-Key`). Recusa menor de 18 anos em SKU de categoria `ALCOHOL` ou `TOBACCO`.
- [ ] REQ-6: Limite por viajante: soma das vendas do mesmo `Customer` nos últimos 30 dias não passa
  de US$ 500 no total, 12 L de bebida alcoólica, 20 maços de cigarro, 25 charutos e 250 g de fumo de
  cachimbo. Venda que estoura o limite é recusada com erro de domínio que diz qual limite e quanto
  resta. Limites ficam em configuração, não fixos no código. Testes em cada fronteira (no limite
  passa, 1 unidade acima barra).
- [ ] REQ-7: Categorias proibidas (`SKU.restricted`: antidumping, Cap. 71 NCM) não podem ser
  criadas como `active` nem vendidas. Teste de rejeição por NCM começando em 71.
- [ ] REQ-8: Testes de domínio novos passam no CI existente (`ruff`, `mypy`, `pytest`), e a migração
  continua rodando do zero em SQLite.

## Critérios de concluído

- `pytest` verde com os testes dos REQ-1 a REQ-7.
- Smoke no browser: cadastrar SKU com NCM e origem, dar entrada com data de admissão, vender
  e ver o limite barrar a compra seguinte. Console sem erro.
- Validação do conteúdo da norma registrada por contador/despachante (Em aberto, item 1).

## Fora de escopo (fases seguintes)

- Integração com o Sistema de Loja Franca (RFB/Serpro), Art. 49 §§3-4.
- Cálculo e relatório de Fundaf (3%, Art. 53).
- Inventário trimestral e relatório de quebra de estoque (Art. 54).
- Limite cumulativo entre lojas francas diferentes (depende da integração com RFB).
- PDV/frente de caixa, emissão de nota fiscal, câmbio automático.
- Parecer jurídico sobre a norma.

## Em aberto

1. **Validar a norma com contador/despachante antes de codar.** Recomendado: sim, é pré-requisito.
   A loja já opera ou vai operar sob o regime? Se ainda não, nada aqui é urgente.
2. **A loja já tem sistema de caixa/PDV?** Se sim, `Sale` deve ser alimentada por ele, não pelo
   Estoque. Recomendado: assumir que o Estoque registra a venda até ter resposta.
3. **Câmbio:** o limite é em US$. Recomendado: preço do SKU já é em US$ (como no catálogo
   público), sem conversão nesta fase.
4. **Peso/volume por SKU** (12 L, 250 g): hoje não existe campo. Recomendado: adicionar
   `volume_ml`/`weight_g` ao SKU no REQ-1, nulos para itens sem limite de quantidade.

## Assumido

- `ncm` novo em vez de reaproveitar `tax_code`: NCM tem formato fixo de 8 dígitos e `tax_code`
  é texto livre que pode já ter outro uso. `tax_code` fica intacto.
- FIFO para consumo de lote: é o padrão mais simples e coerente com o prazo por data de admissão.
- Menor de 18: calculado pela data de nascimento do `Customer`, que vira obrigatória só para
  vendas com `ALCOHOL`/`TOBACCO`.
- Spec grande: ao sair de `draft`, quebrar em tickets (`workflow:to-tickets`): (a) REQ-1 e REQ-7,
  (b) REQ-2 e REQ-3, (c) REQ-4 a REQ-6.

## Skills

Gerar `skills-plan.yaml` com `workflow:spec-router` depois de aprovada.
