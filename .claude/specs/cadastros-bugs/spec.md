---
slug: cadastros-bugs
status: done
revision_count: 0
created: 2026-09-25
---

# Corrigir 3 bugs de Cadastros (frontend Estoque-NY)

## Objetivo
Corrigir os 3 bugs de UI achados no smoke visual de 2026-09-25 na tela Cadastros (Marcas, Filiais, Locais).
Mini-spec de escopo já fechado (fonte: `## Tarefas` do hub New York no vault). Aprovada no G1 pelo usuário.

## Requisitos
- [x] REQ-1: Enter no campo do modal (Marcas, Filiais e Locais) salva, como o botão Salvar (modal com `<form onSubmit>`). O erro "Informe o nome" some ao digitar.
- [x] REQ-2: "Excluir" pede confirmação antes do DELETE. Cancelar não faz request.
- [x] REQ-3: O rótulo do botão concorda em gênero: "Nova marca", "Nova filial", "Novo local".

## Verificação (2026-09-27)
Implementação já estava commitada (`0d48443`, `b04e298`); esta review confirmou em runtime real
(browser, backend :8010 + frontend :8080, login admin@estoque.local):
- REQ-1: criei marca "Marca Teste QA" digitando e pressionando Enter (sem clicar Salvar) — salvou e apareceu na tabela.
- REQ-2: cliquei Excluir na linha de teste, modal "Confirmar exclusão" mostrou o nome certo; Cancelar fechou sem alterar a tabela; Excluir de fato removeu o registro.
- REQ-3: confirmado "Nova marca" (aba Marcas) e "Nova filial" (aba Filiais) na UI; "Novo local" confirmado por leitura de código (`LocationsTab.tsx:82`, mesmo padrão).
- `npm run typecheck` e `npm run test` (65/65) verdes.
- Console sem erros novos (só logs de dev do Vite/React DevTools).
- Nenhum arquivo fora de `frontend/src/features/cadastros/**` foi alterado nesses commits.

## Critérios de concluído (observáveis)
1. `npm run typecheck` e `npm run test` (frontend) verdes.
2. No browser (DB temporário): Enter salva nas 3 abas; Excluir abre confirmação, Cancelar não dispara DELETE, Confirmar dispara; rótulos corretos.
3. 0 erros de console novos (além do favicon 404).
4. Só arquivos de `frontend/src/features/cadastros/**` alterados (mais testes, se criados).

## Fora de escopo
Backend, `ORDER BY` de marcas, coluna Usuário da Auditoria, moeda, push/PR.
