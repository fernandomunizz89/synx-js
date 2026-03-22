# SYNX Mission Control - Feature Roadmap (inspirado na referência visual)

## Objetivo
Transformar o SYNX Web UI em um **Mission Control operacional**, com foco em:
- clareza de estado do runtime e dos agentes;
- fluxo humano de decisão (aprovar/reprovar) sem fricção;
- navegação orientada por operação (não só por telas);
- visual premium, consistente e legível em uso contínuo.

---

## Referências extraídas da imagem

## 1) Estrutura de produto (IA)
- Sidebar fixa com navegação primária por áreas operacionais.
- Header superior compacto com busca global, status de conectividade e ações rápidas.
- Conteúdo principal em blocos modulares (cards) com hierarquia clara.
- Leitura vertical natural: **status global -> métricas -> trabalho em andamento -> agentes ativos -> integrações**.

## 2) Linguagem visual
- Tema escuro profundo com superfícies em camadas e contraste suave.
- Cards com borda sutil, cantos arredondados e separação forte de seções.
- Uso consistente de acentos de cor para estado (online, ativo, bloqueado, review etc).
- Métricas numéricas em destaque com ícones pequenos para reconhecimento rápido.

## 3) Padrão de componentes
- Card de boas-vindas/contexto no topo (resumo do estado atual do sistema).
- Grid de KPIs (números principais de operação).
- Listas de tarefas recentes com status e tempo relativo.
- Lista de agentes com estado por item (thinking/building/reviewing etc).
- Bloco de integrações/conexões ativas.

## 4) Padrões de UX
- Conteúdo “escaneável” em 3 segundos.
- Interação contextual: cada card tem ação natural (“View all”, “Manage”, “Open”).
- Sem excesso de texto descritivo; foco em sinais operacionais.
- Densidade de informação equilibrada (não minimalista demais, não poluída).

---

## Roadmap de implementação para SYNX

## Fase 0 - Fundamentos visuais e tokens
### Entregas
- Definir design tokens globais (cores, radius, spacing, tipografia, sombras).
- Tema triplo: `light`, `dark`, `system` com paridade real.
- Superfícies em camadas (`base`, `panel`, `card`, `elevated`).

### Critérios de aceite
- Contraste AA mínimo em textos principais.
- Sem “flicker” visual em polling/realtime.
- Coerência entre todos os cards e controles.

---

## Fase 1 - Arquitetura da interface (Mission Control layout)
### Entregas
- Sidebar fixa com seções operacionais:
  - Dashboard
  - Task Board
  - Review Queue
  - Live Stream
  - Analytics
  - Integrations
- Header superior compacto com busca global e status de runtime.
- Área principal com grade modular responsiva.

### Critérios de aceite
- Navegação rápida sem perder contexto.
- Layout funcional em desktop e tablet sem quebra de cards.

---

## Fase 2 - Dashboard operacional
### Entregas
- Card “System Welcome/Context” com resumo:
  - runtime status;
  - tarefas ativas;
  - itens aguardando humano;
  - número de agentes ativos.
- Grid de KPIs com indicadores principais:
  - total tasks;
  - completed;
  - active agents;
  - waiting human;
  - failed/blocked;
  - consumo (tokens/custo).

### Critérios de aceite
- Usuário entende estado geral do sistema em < 5 segundos.
- KPIs atualizam sem recarregar tela inteira.

---

## Fase 3 - Task Board (Jira/Kanban + Agent Lanes)
### Entregas
- Dual mode no board:
  - `Jira Kanban`: Backlog, To Do, In Progress, In Review, Done, Blocked.
  - `Agent Lanes`: Dispatcher, Planner, Research, Experts, QA, Human Review.
- Cartões com:
  - task id, título, estágio, agente atual, próximo agente, updated at.
- Transição automática de cards por polling/realtime.

### Critérios de aceite
- Mudança de modo instantânea sem perda de contexto.
- Board funciona para leitura operacional contínua.

---

## Fase 4 - Human Review UX (core do SYNX)
### Entregas
- Inbox de review com prioridade visual.
- Ações inline por card:
  - Approve
  - Reprove (com motivo obrigatório)
  - Rollback mode
- Atalhos de decisão (keyboard + quick actions).
- Histórico de decisão por task no detalhe.

### Critérios de aceite
- Aprovar/reprovar em 2 cliques + motivo quando necessário.
- Mensagens e estados claros após ação.

---

## Fase 5 - Command Center (CLI-like, menos verboso)
### Entregas
- Console de comandos estilo CLI enxuto.
- Botão `Commands` com catálogo de comandos + função de cada um.
- Filtro de comandos e snippets “Use snippet”.
- Modo `command` e `human` explícitos com feedback direto.

### Critérios de aceite
- Usuário encontra comando em < 10 segundos.
- Fluxo web independente da TUI para operações principais.

---

## Fase 6 - Live Stream human-friendly
### Entregas
- Timeline semântica por evento:
  - título humano,
  - resumo contextual,
  - task relacionada,
  - timestamp local.
- Filtros por tipo (runtime/task/review/metrics).
- “Pins” para eventos críticos (review required, failed, stop requested).

### Critérios de aceite
- Timeline útil para tomada de decisão humana.
- Redução de ruído e aumento de legibilidade.

---

## Fase 7 - Search, drill-down e produtividade
### Entregas
- Busca global por task id, título, agente, projeto, status.
- Drill-down contextual:
  - do KPI para lista filtrada,
  - da lista para task detail,
  - do evento para task/review.
- Saved filters (ex.: “waiting_human”, “blocked”, “high cost”).

### Critérios de aceite
- Navegação entre visão macro e micro em no máximo 2 ações.

---

## Fase 8 - Analytics e inteligência operacional
### Entregas
- Curvas de custo/tokens/duração com comparação de período.
- Ranking de gargalos por estágio/agente.
- Métricas de qualidade:
  - taxa de retrabalho;
  - loops de QA;
  - SLA de review humana.
- Alertas de anomalia (spike de custo, fila travada, agente ocioso).

### Critérios de aceite
- Painel analítico suportando decisão de melhoria contínua.

---

## Melhorias transversais (aplicam a todas as fases)
- Performance: render incremental, diff de DOM, debounce de polling.
- Acessibilidade: foco visível, labels claros, navegação por teclado.
- Observabilidade de UI: logs de ação do usuário e erros de interação.
- Testes: unit + contract + fluxo crítico (approve/reprove/runtime actions).
- I18N/L10N: datas, números e moeda via locale do sistema.

---

## Backlog de ideias extras (alto impacto)
- Comando palette (`Cmd/Ctrl + K`) para navegar e executar ações.
- “War Room mode” (auto-refresh agressivo + painéis fixos em TV).
- Layout presets (Operator, Reviewer, Analytics).
- Notificações contextuais (somente eventos críticos).
- Modo “Focus Review” para processar fila humana em lote.

---

## Plano sugerido de execução
1. Fases 0-2: base visual e IA definitiva.
2. Fases 3-5: produtividade operacional e fluxo humano.
3. Fases 6-8: inteligência e otimização contínua.

Resultado esperado: SYNX UI com padrão **Mission Control de operações AI** pronto para uso real de equipes.
