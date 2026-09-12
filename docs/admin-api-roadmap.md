# Evolucao para API administrativa interna

## Objetivo

Transformar a API atual de estoque em uma API administrativa interna consumida por
um ou mais frontends. A API deve centralizar dados operacionais e analiticos de
Estoque, Catalogo, Marketing e Relatorios, mantendo autenticacao, permissoes e
auditoria como capacidades transversais.

## Estado atual

A base ja esta em FastAPI com SQLAlchemy async, Alembic, JWT, RBAC e auditoria.
Os dominios existentes cobrem:

- Estoque: saldos, movimentacoes, ajustes, transferencias e inventarios.
- Catalogo: categorias, marcas, produtos, SKUs e codigos de barras.
- Relatorios: valuation, giro, curva ABC e movimentacoes de estoque.
- Administracao: usuarios, papeis, permissoes e logs de auditoria.

## Desenho alvo da API

As rotas devem ficar organizadas por dominio para facilitar consumo por frontends:

```text
/auth
/admin/users
/admin/roles
/admin/audit

/catalog/categories
/catalog/brands
/catalog/products
/catalog/skus
/catalog/collections

/stock/balances
/stock/moves
/stock/receipts
/stock/issues
/stock/adjustments
/stock/transfers
/stock/inventory-counts

/marketing/channels
/marketing/campaigns
/marketing/promotions
/marketing/audience-segments
/marketing/content-assets

/reports/stock
/reports/catalog
/reports/marketing
/reports/overview
```

No curto prazo, as rotas antigas podem continuar existindo. A reorganizacao por
prefixos deve ser feita com cuidado para nao quebrar frontends ja conectados.

## Fases de implementacao

### Fase 1: Modulo Marketing

Adicionar o dominio de Marketing como modulo independente, com vinculos opcionais
ao Catalogo:

- `MarketingChannel`: canais como Instagram, email, marketplace, loja fisica ou
  midia paga.
- `Campaign`: campanhas com periodo, status, orcamento, objetivo e canal.
- `Promotion`: promocoes ligadas ou nao a campanhas.
- `AudienceSegment`: segmentos de publico com regras em JSON.
- `ContentAsset`: materiais e links usados em campanhas.
- `CampaignProduct`: produtos associados a campanhas.
- `PromotionSKU`: SKUs associados a promocoes.

### Fase 2: Relatorios cruzados

Criar endpoints que combinem dados de marketing, catalogo e estoque:

- produtos em campanha com saldo atual;
- promocoes ativas com SKUs e precos;
- campanhas por periodo e canal;
- produtos com baixo giro candidatos a campanha;
- resumo operacional para dashboard.

### Fase 3: Organizacao dos dominios

Padronizar rotas e tags OpenAPI:

- manter compatibilidade temporaria com rotas existentes;
- introduzir aliases em `/catalog`, `/stock`, `/marketing`, `/reports` e `/admin`;
- documentar rotas legadas que serao depreciadas;
- versionar com `/api/v1` quando houver frontend dependente de contratos estaveis.

### Fase 4: Governanca e consumo por frontends

Melhorar a previsibilidade da API:

- respostas paginadas padronizadas;
- filtros consistentes por `q`, `status`, periodo, produto, SKU, canal e filial;
- permissoes por dominio;
- auditoria em operacoes de escrita;
- fixtures/seeds para ambiente de homologacao;
- documentacao OpenAPI revisada por tags e exemplos.

## Permissoes alvo

As permissoes seguem o padrao `dominio.recurso.acao`:

```text
marketing.channel.create
marketing.channel.read
marketing.channel.update
marketing.channel.delete
marketing.campaign.create
marketing.campaign.read
marketing.campaign.update
marketing.campaign.delete
marketing.promotion.create
marketing.promotion.read
marketing.promotion.update
marketing.promotion.delete
marketing.audience.read
marketing.audience.manage
marketing.content.read
marketing.content.manage
reports.marketing.read
```

## O que falta apos o primeiro incremento

- Implementado neste incremento:
  - entidades de Marketing no SQLAlchemy;
  - migration Alembic para tabelas de Marketing;
  - schemas Pydantic de Marketing;
  - rotas `/marketing/channels`, `/marketing/campaigns`,
    `/marketing/promotions`, `/marketing/audience-segments` e
    `/marketing/content-assets`;
  - vinculo de campanhas com produtos;
  - vinculo de promocoes com SKUs;
  - permissoes RBAC de Marketing;
  - auditoria nas escritas de Marketing;
  - teste de fluxo cobrindo canal, campanha, promocao, segmento e asset.
- Validacao executada:
  - `uv run ruff check app tests migrations`;
  - `uv run pytest`;
  - importacao de `app.main:app`.
- Observacao de migration local:
  - `uv run alembic upgrade head` em SQLite temporario para desde a base falhou
    em uma migration antiga (`678cb1a6f4bf`) por limitacao de `ALTER
    CONSTRAINT` do SQLite. A falha ocorre antes da migration de Marketing.
    Os testes validam as novas tabelas via `Base.metadata.create_all`.
- Validacao bloqueada pelo ambiente:
  - `uv run black --check app tests migrations` foi bloqueado por uma politica
    local do Windows ao carregar uma DLL do pacote `black`.
- Criar relatorios especificos de Marketing.
- Criar aliases organizados em `/catalog/*` e `/admin/*` sem quebrar rotas atuais.
- Definir se campanhas/promocoes terao fluxo de aprovacao.
- Definir metricas externas de marketing, como cliques, impressoes, custo e receita.
- Adicionar importacao/exportacao CSV para campanhas e promocoes.
- Criar seeds de dados de exemplo para Marketing.
- Revisar o frontend para consumir os novos endpoints por dominio.
- Decidir quando introduzir `/api/v1` como contrato publico para frontends.
