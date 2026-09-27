---
slug: cadastros-bugs
status: ready
revision_count: 0
created: 2026-09-25
---

# Corrigir 3 bugs de Cadastros (frontend Estoque-NY)

## Objetivo
Corrigir os 3 bugs de UI achados no smoke visual de 2026-09-25 na tela Cadastros (Marcas, Filiais, Locais).
Mini-spec de escopo já fechado (fonte: `## Tarefas` do hub New York no vault). Aprovada no G1 pelo usuário.

## Requisitos
- [ ] REQ-1: Enter no campo do modal (Marcas, Filiais e Locais) salva, como o botão Salvar (modal com `<form onSubmit>`). O erro "Informe o nome" some ao digitar.
- [ ] REQ-2: "Excluir" pede confirmação antes do DELETE. Cancelar não faz request.
- [ ] REQ-3: O rótulo do botão concorda em gênero: "Nova marca", "Nova filial", "Novo local".

## Critérios de concluído (observáveis)
1. `npm run typecheck` e `npm run test` (frontend) verdes.
2. No browser (DB temporário): Enter salva nas 3 abas; Excluir abre confirmação, Cancelar não dispara DELETE, Confirmar dispara; rótulos corretos.
3. 0 erros de console novos (além do favicon 404).
4. Só arquivos de `frontend/src/features/cadastros/**` alterados (mais testes, se criados).

## Fora de escopo
Backend, `ORDER BY` de marcas, coluna Usuário da Auditoria, moeda, push/PR.
