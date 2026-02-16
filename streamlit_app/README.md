# Streamlit Backoffice (ERP de Estoque)

Interface administrativa em portugues para operar a API FastAPI de estoque.

## O que voce encontra

- Login com JWT
- Visao geral com indicadores
- Transferencias entre locais/filiais
- Contagem de estoque (abertura, fechamento e confirmacao)
- Cadastros de produtos e variacoes
- Usuarios e permissoes (quando endpoints existirem)
- Relatorios com exportacao para Excel (CSV)
- Auditoria (quando endpoint existir)
- Explorador de estoque (saldos, movimentacoes e lancamentos rapidos)

## 1) Instalar dependencias

```bash
pip install -r streamlit_app/requirements.txt
```

## 2) Configurar ambiente

```bash
cp streamlit_app/.env.example streamlit_app/.env
```

Defina a URL da API:

```env
API_BASE_URL=http://localhost:8000
```

## 3) Executar

```bash
streamlit run streamlit_app/app.py
```

## Fluxos principais

### Transferencia

1. Abra **Transferencias** e clique em **Nova transferencia**.
2. Escolha origem, destino e itens.
3. Confirme a criacao.
4. No detalhe da transferencia, use:
   - **Enviar transferencia**
   - **Confirmar recebimento**
   - **Cancelar transferencia**

### Contagem de estoque

1. Abra **Contagens de estoque** e clique em **Nova contagem**.
2. Escolha filial/local e escopo.
3. Informe quantidades contadas (manual ou CSV).
4. Execute:
   - **Fechar contagem**
   - **Aplicar ajustes no estoque**

## Endpoints esperados

O app verifica rotas por `/openapi.json`. Se uma rota nao existir, a tela mostra aviso de indisponibilidade sem quebrar.

Principais rotas usadas:

- Auth: `/auth/login`, `/auth/me`, `/auth/register`, `/auth/roles/assign`
- Base: `/health`, `/health/db`
- Cadastros: `/branches`, `/locations`, `/products`, `/skus`, `/categories`, `/brands`
- Estoque: `/stock/receipts`, `/stock/issues`, `/stock/adjustments`, `/stock/balances`, `/stock/moves`
- Transferencias: `/stock/transfers`, `/stock/transfers/{id}`, `/ship`, `/receive`, `/cancel`
- Contagem: `/stock/inventory-counts`, `/stock/inventory-counts/{id}`, `/lines`, `/close`, `/post`, `/cancel`
- Relatorios: `/reports/stock/valuation`, `/turnover`, `/movements`, `/abc`

## Idempotency-Key

Acoes criticas enviam `Idempotency-Key` automaticamente:

- Criacao e acoes de transferencias
- Criacao/fechamento/confirmacao/cancelamento de contagens
- Lancamentos de estoque (entrada, saida e ajuste)

## Prints (adicione os arquivos)

Salve capturas em `streamlit_app/docs/` e referencie aqui:

- `streamlit_app/docs/01-login.png`
- `streamlit_app/docs/02-visao-geral.png`
- `streamlit_app/docs/03-transferencias.png`
- `streamlit_app/docs/04-contagem.png`

Exemplo de exibicao no README:

```md
![Tela de login](docs/01-login.png)
```
