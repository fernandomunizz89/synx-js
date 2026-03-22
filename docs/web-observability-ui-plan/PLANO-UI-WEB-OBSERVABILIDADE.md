# Plano Técnico: UI Web de Observabilidade e Revisão Humana do SYNX

## 1. Resumo executivo

O SYNX já tem a base correta para ganhar uma UI web forte sem reescrever o motor:

- o runtime já é file-driven
- cada task já persiste estado, histórico, handoffs e artifacts em `.ai-agents/tasks/<task-id>/`
- o engine já escreve métricas globais em JSONL
- a TUI atual já resolve bem a operação em terminal, mas a maior parte do valor reutilizável está nos dados, não no renderer terminal

A melhor estratégia para atingir seu objetivo e aproveitar o máximo do que já existe é:

1. manter o filesystem como source of truth
2. extrair uma camada de leitura/consulta compartilhada para observabilidade
3. extrair uma camada única de ações humanas (`approve`, `reprove`, `cancel`, futuramente `pause/resume`)
4. criar uma UI web local consumindo uma API Node no mesmo repositório
5. começar com polling e leitura read-only, e só depois adicionar realtime e controles operacionais

Minha recomendação concreta para este projeto:

- backend web local: `Fastify` dentro do próprio repo, reaproveitando `src/lib/*`
- frontend: `React + Vite`, separado da CLI, consumindo a API local
- comando futuro: `synx ui`

Essa escolha é mais aderente ao estado atual do projeto do que migrar para um framework fullstack maior logo de início. O SYNX hoje é um runtime Node/CLI com persistência em arquivo; a UI web deve ser uma camada de produto em cima disso, não um segundo runtime concorrente.

---

## 2. Objetivo do produto

Criar uma UI web agradável, humana e operacional para acompanhar:

- processos em andamento
- progresso por task
- estado de cada agente
- itens pendentes de revisão humana
- consumo estimado de tokens por task, por agente e por projeto
- custo estimado, gargalos e loops de QA
- saúde do engine e do provider

Essa UI deve complementar a TUI atual, não substituí-la imediatamente.

---

## 3. Objetivos funcionais

### 3.1 O que a UI precisa entregar

- visão geral do engine em tempo quase real
- fila clara de tasks em `waiting_human`
- drill-down de task com timeline de stages, agentes envolvidos, QA findings, artifacts e arquivos alterados
- dashboards agregados por task, agente e projeto
- destaque para gargalos, loops, falhas e consumo
- ações humanas diretamente pela web para os casos de revisão

### 3.2 O que não precisa acontecer no primeiro momento

- substituir o `synx start`
- mudar o armazenamento para banco
- adicionar autenticação multiusuário
- expor a UI remotamente na internet
- transformar a UI numa nova fonte de verdade do runtime

---

## 4. Diagnóstico técnico do estado atual

## 4.1 O que já existe e pode ser reaproveitado

| Área | O que já existe | Onde |
|---|---|---|
| Source of truth por task | `meta.json`, `done/`, `views/`, `artifacts/`, `logs/`, `human/` | `src/lib/task.ts`, `src/workers/base.ts` |
| Histórico por stage | `TaskMeta.history` com `durationMs`, provider, model, parse retries, tokens e custo | `src/lib/types.ts`, `src/workers/base.ts` |
| Métricas globais | stage timing, queue latency, throttle, parse retries, polling metrics | `src/lib/logging/*`, `src/lib/collaboration-metrics.ts` |
| Estado do daemon | heartbeat, loop, processed stages/tasks, action do loop | `src/commands/start.ts`, `src/lib/logging/daemon-logs.ts` |
| Revisão humana | status `waiting_human`, approve/reprove, artifacts de reprovação | `src/commands/approve.ts`, `src/commands/reprove.ts` |
| Learnings | histórico por agente com outcome aprovado/reprovado | `src/lib/learnings.ts` |
| TUI atual | contadores, resumo de task ativa, fila humana, input inline | `src/lib/start-progress.ts`, `src/lib/start/task-management.ts` |
| Readiness/saúde | checks de prompts, reviewer, provider, modelo | `src/lib/readiness.ts` |
| Estado de pipeline | `pipeline-state.json` com steps compactados | `src/lib/pipeline-state.ts` |

## 4.2 Conclusão do diagnóstico

O SYNX já tem dados suficientes para uma boa UI web de observabilidade. O que falta não é "instrumentar tudo do zero"; o que falta é:

- uma camada de consulta consistente
- uma camada unificada de ações
- uma API web
- alguns ajustes de persistência para fechar lacunas de UX e analytics

---

## 5. O que da TUI atual é reaproveitável e o que não é

## 5.1 Reaproveitável

- `summarizeTaskCounts`
- `pickFocusedTask`
- `resolveHumanTask`
- `stageLabel`
- `progressForMeta`
- `collectReadinessReport`
- `buildCollaborationMetricsReport`
- toda a estrutura de `TaskMeta`, `TimingEntry`, `LearningEntry`, `PipelineState`

## 5.2 Parcialmente reaproveitável

- a semântica de estados da TUI
- o mapeamento de stages e agentes
- os contadores e a lógica de foco humano

## 5.3 Não reaproveitável como está

- o renderer terminal (`boxen`, ANSI, `log-update`)
- o `uiState` em memória do `start`
- o console/event stream da TUI como fonte oficial para a web

Em outras palavras: a web deve reaproveitar a lógica de domínio, não os componentes da TUI.

---

## 6. Gaps reais para atingir seu objetivo

## 6.1 Gap 1: não existe camada de consulta para web

Hoje os dados estão espalhados em:

- `.ai-agents/tasks/*/meta.json`
- `.ai-agents/tasks/*/done/*.done.json`
- `.ai-agents/tasks/*/views/*`
- `.ai-agents/tasks/*/logs/*`
- `.ai-agents/logs/*.jsonl`
- `.ai-agents/runtime/daemon-state.json`
- `.ai-agents/learnings/*.jsonl`

Cada comando lê isso de um jeito diferente. A UI web precisa de uma camada central que normalize esses arquivos em DTOs estáveis.

## 6.2 Gap 2: a lógica de ações humanas está duplicada

Hoje existe lógica parecida em:

- `src/commands/approve.ts`
- `src/commands/reprove.ts`
- `src/lib/start/command-handler.ts`

Problema:

- a TUI inline não está em paridade total com a CLI
- a TUI inline não grava os learnings de pipeline
- a TUI inline não replica todo o comportamento de rollback
- a futura web correria o risco de virar a terceira implementação

Isso precisa virar uma camada única de aplicação, por exemplo:

- `createTaskService`
- `approveTaskService`
- `reproveTaskService`
- `cancelTaskService`

CLI, TUI e UI web devem chamar os mesmos serviços.

## 6.3 Gap 3: projeto ainda é um campo fraco para analytics

Você quer métricas por projeto, mas hoje:

- `synx new` aceita `--project`, porém defaulta para string vazia
- o inline `new` da TUI cria task com `project: ""`
- `synx pipeline run` também cria task com `project: ""`

Sem corrigir isso, a visão por projeto vai ficar inconsistente.

### Ajuste recomendado

- defaultar `project` para `ResolvedProjectConfig.projectName`
- fallback secundário: nome do repositório
- marcar se o valor foi explícito ou inferido

## 6.4 Gap 4: não existe artifact estruturado para aprovação

Na reprovação, já existe:

- `human/90-final-review.reproved.json`

Na aprovação, hoje existe basicamente:

- mudança de `meta.status`
- `logTaskEvent("Human approval completed...")`

Isso é insuficiente para auditoria web mais rica.

### Ajuste recomendado

Criar também:

- `human/90-final-review.approved.json`
- opcionalmente `logs/human-review-decisions.jsonl`

Assim a UI consegue mostrar histórico humano consistente.

## 6.5 Gap 5: realtime da TUI não é durável

A TUI usa `uiState.consoleLogLines` e `uiState.eventLogLines` em memória. Isso serve para terminal, mas não serve como base web confiável.

Hoje a web consegue reconstruir parte da operação a partir de:

- `daemon.log`
- `task events.log`
- `agent-audit.jsonl`
- `stage-metrics.jsonl`

Mas não tudo.

### Ajuste recomendado

Adicionar um stream mais explícito de runtime, por exemplo:

- `.ai-agents/logs/runtime-events.jsonl`

Eventos úteis:

- `engine.started`
- `engine.paused`
- `engine.resumed`
- `engine.stop_requested`
- `task.created`
- `task.waiting_human`
- `task.approved`
- `task.reproved`
- `view.changed`

## 6.6 Gap 6: métricas agregadas existem, mas ainda não no formato da UI

`buildCollaborationMetricsReport()` já resolve muito bem o agregado global, mas ainda faltam:

- breakdown por agente
- breakdown por projeto
- ranking por task
- séries temporais para gráficos
- drill-down por stage attempt

Boa notícia: os dados base já existem em `TaskMeta.history`, `stage-metrics.jsonl`, `agent-audit`, `queue-latency` e `learnings`.

## 6.7 Gap 7: não existe um DTO de task detail

Para uma tela de task detail realmente boa, a UI vai precisar juntar:

- `meta.json`
- `history`
- `done/*.done.json`
- `views/*.md`
- `logs/events.log`
- `logs/timings.jsonl`
- `artifacts/*`
- `human/*`
- `pipeline-state.json` quando existir

Hoje isso não existe como objeto consolidado.

## 6.8 Gap 8: não existe canal externo para controlar o engine

Hoje `pause/resume` é um toggle em memória do `start`:

- útil na TUI
- invisível para qualquer outro processo

Se a UI web precisar controlar o runtime, será necessário um mecanismo explícito, por exemplo:

- `.ai-agents/runtime/daemon-control.json`
- ou uma API local se a UI estiver acoplada ao processo do engine

## 6.9 Gap 9: a UI precisa suportar estado vazio e histórico parcial

O diretório `.ai-agents/` é ignorado pelo Git. Isso é correto, mas implica:

- a UI precisa funcionar com zero tasks
- a UI precisa tolerar logs ausentes
- a UI precisa lidar com artifacts faltantes ou incompletos

---

## 7. Recomendação de arquitetura

## 7.1 Decisão principal

Implementar a UI web em duas camadas:

### Camada 1: servidor local no próprio SYNX

Responsabilidades:

- ler `.ai-agents/**`
- expor REST para consulta
- expor SSE para atualização em tempo real
- executar ações humanas de forma segura
- servir o frontend buildado

### Camada 2: frontend React

Responsabilidades:

- exibir dashboards e drill-downs
- organizar filtros, timeline, review queue e métricas
- fazer polling ou consumir SSE
- disparar approve/reprove/cancel via API

## 7.2 Stack recomendada

### Backend

- `Fastify`
- Zod para contracts de request/response
- `chokidar` apenas quando entrar a fase realtime

### Frontend

- `React`
- `Vite`
- `React Router`
- `@tanstack/react-query`
- `Recharts` ou `Visx` para visualização
- `Radix UI` ou primitives acessíveis equivalentes
- tokens visuais customizados, sem template de dashboard genérico

## 7.3 Por que essa é a melhor escolha para este projeto

### Melhor que um Next.js fullstack agora

Porque:

- o projeto hoje é CLI Node, não app SSR
- a maior necessidade está no acesso ao filesystem local
- você já tem uma base TypeScript Node madura para reaproveitar
- a UI é operacional/local-first, não um SaaS público neste momento

### Melhor que ler arquivos direto no browser

Porque:

- o browser não deve conhecer paths locais diretamente
- você vai precisar de normalização e agregação
- ações humanas exigem um backend
- isso preserva espaço para evoluir para modo remoto no futuro

---

## 8. Arquitetura-alvo proposta

```text
Browser
  |
  | HTTP + SSE
  v
synx ui server
  |
  +-- Application services
  |     - create/approve/reprove/cancel
  |     - runtime controls
  |
  +-- Observability query layer
  |     - tasks
  |     - task detail
  |     - agents
  |     - projects
  |     - metrics
  |     - runtime overview
  |
  +-- Existing filesystem source of truth
        - .ai-agents/tasks/**
        - .ai-agents/logs/**
        - .ai-agents/runtime/**
        - .ai-agents/learnings/**
```

---

## 9. Estrutura sugerida de código

```text
src/
  app/
    tasks/
      create-task.ts
      approve-task.ts
      reprove-task.ts
      cancel-task.ts
    runtime/
      pause-engine.ts
      resume-engine.ts
      stop-engine.ts
  observability/
    types.ts
    queries.ts
    task-overview.ts
    task-detail.ts
    metrics.ts
    runtime.ts
    agents.ts
    projects.ts
    watches.ts
  server/
    index.ts
    routes/
      runtime.ts
      tasks.ts
      agents.ts
      projects.ts
      metrics.ts
      review.ts
    sse.ts
apps/
  web/
    package.json
    src/
      app/
      pages/
      components/
      sections/
      lib/api/
      lib/formatters/
      styles/
```

### Observação importante

Eu não recomendo transformar o repo inteiro em monorepo neste primeiro passo. Um `apps/web` com `package.json` próprio já resolve, preserva a CLI e reduz risco.

---

## 10. Modelo de dados para a UI

## 10.1 Entidades principais

### RuntimeOverview

Campos:

- engine status
- last heartbeat
- loop atual
- active task count
- processed stages last loop
- total processed stages/tasks
- poll interval
- concurrency
- readiness summary
- provider health summary

### TaskListItem

Campos:

- `taskId`
- `title`
- `type`
- `project`
- `status`
- `currentStage`
- `currentAgent`
- `nextAgent`
- `humanApprovalRequired`
- `createdAt`
- `updatedAt`
- `progressRatio`
- `historyCount`
- `estimatedTokensTotal`
- `estimatedCostUsd`
- `qaAttempts`
- `lastFailureSummary`

### TaskDetail

Campos:

- `meta`
- `history`
- `stageExecutions`
- `views`
- `doneOutputsSummary`
- `events`
- `timings`
- `artifacts`
- `humanReview`
- `qaReturnHistory`
- `pipelineState`
- `tokenSummary`
- `costSummary`
- `filesChanged`
- `reviewFocus`
- `manualValidationNeeded`

### AgentSummary

Campos:

- `agent`
- `agentType` (`built_in` | `custom`)
- `stagesExecuted`
- `successCount`
- `failureCount`
- `waitingHumanCount`
- `avgDurationMs`
- `estimatedTokens`
- `estimatedCostUsd`
- `approvalRate`
- `reproveRate`
- `qaReturnRate`
- `recentTasks`

### Nota de modelagem

A UI nao deve assumir apenas o Expert Squad atual. O projeto ja possui conceito de `GenericAgent` e pipelines customizaveis; portanto, a camada de observabilidade deve tratar agente como entidade dinamica vinda de:

- `TaskMeta.history`
- `agent-audit`
- `pipeline-state`
- registry de agentes customizados quando existir

### ProjectSummary

Campos:

- `project`
- `taskCount`
- `activeCount`
- `waitingHumanCount`
- `failedCount`
- `doneCount`
- `estimatedTokens`
- `estimatedCostUsd`
- `avgCycleTimeMs`
- `topAgents`
- `topBottlenecks`

---

## 11. Como cada métrica pode ser calculada usando o que já existe

## 11.1 Por task

Fonte principal:

- `TaskMeta.history`

Cálculos:

- tokens por task = soma de `estimatedInputTokens`, `estimatedOutputTokens`, `estimatedTotalTokens`
- custo por task = soma de `estimatedCostUsd`
- duração por task = `max(history.endedAt) - min(history.startedAt)`
- retries por task = soma de `parseRetries`, `providerBackoffRetries` e loops inferidos

## 11.2 Por agente

Fontes:

- `TaskMeta.history`
- `agent-audit/*.jsonl`
- `learnings/*.jsonl`

Cálculos:

- throughput por agente = contagem de history items por `agent`
- tempo médio = média de `durationMs`
- tokens = soma dos campos de token no history
- qualidade = combinar learnings + outcomes finais atribuídos ao último stage antes da revisão humana

### Observação importante

A taxa de aprovação por agente fica muito mais confiável depois que a aprovação humana passar a gerar artifact estruturado, assim como a reprovação já gera hoje.

## 11.3 Por projeto

Fontes:

- `meta.project`
- fallback `config.projectName`

Cálculos:

- agregar tasks por projeto
- somar tokens/custo/history
- derivar tempo médio de ciclo
- derivar gargalos mais frequentes

### Nota importante

Sem corrigir o preenchimento de `project`, essa camada ficará incompleta.

## 11.4 Fila de revisão humana

Fontes:

- `meta.humanApprovalRequired`
- `meta.status === "waiting_human"`
- `human/90-final-review.reproved.json`
- futuro `human/90-final-review.approved.json`
- último `done/06-synx-qa-engineer.done.json`

Isso já permite montar uma fila rica com:

- task
- resumo do QA
- findings
- agente anterior
- última alteração
- ações de approve/reprove

---

## 12. Informação e UX da UI

## 12.1 Princípios de UX

- o humano deve entender o estado em segundos
- a fila que exige ação humana deve ficar sempre visível
- a task detail deve privilegiar timeline e contexto de decisão, não raw JSON
- métricas devem responder a perguntas operacionais, não apenas "ficar bonitas"
- o design não deve ser uma skin da TUI; deve ser uma interface operacional clara

## 12.2 Direção visual recomendada

- tipografia principal: `IBM Plex Sans` ou `Manrope`
- tipografia técnica: `IBM Plex Mono` ou `JetBrains Mono`
- tema claro por padrão
- fundo com contraste suave, não branco puro chapado
- paleta operacional:
  - azul petróleo / teal para processamento
  - verde para sucesso
  - âmbar para atenção humana
  - coral/vermelho para falha
  - neutros quentes para leitura longa

## 12.3 Páginas recomendadas

### 1. Overview

Objetivo:

- responder "o que está acontecendo agora?"

Blocos:

- hero com status do engine
- cards de KPI
- seção "Aguardando você"
- swimlane de tasks ativas
- event stream ao vivo
- gráfico de consumo de tokens nas últimas horas/dias

### 2. Review Queue

Objetivo:

- responder "em que eu preciso agir agora?"

Blocos:

- lista de tasks em `waiting_human`
- QA summary
- findings
- arquivos afetados
- botão de `Approve`
- botão de `Reprove`
- motivo de reprovação
- opção de rollback quando disponível

### 3. Tasks

Objetivo:

- responder "como está o estoque inteiro de trabalho?"

Blocos:

- tabela/board com filtros por status, agente, projeto, tipo
- busca por `taskId` e título
- colunas de tokens, custo, duração, loops e última atualização

### 4. Task Detail

Objetivo:

- responder "o que aconteceu nessa task e por quê?"

Blocos:

- header com status, projeto, tipo, tempos e custos
- timeline de stages
- agent handoffs
- findings do QA
- changed files
- artifacts e views
- human review history
- event log

### 5. Agents

Objetivo:

- responder "quais agentes estão performando bem e quais estão gargalando?"

Blocos:

- throughput
- tempo médio
- tokens consumidos
- taxa de aprovação
- taxa de retorno do QA
- últimas tasks por agente

### 6. Projects

Objetivo:

- responder "qual projeto está consumindo mais e onde estão os gargalos?"

Blocos:

- cards por projeto
- task volume
- custo/token
- tempo médio de ciclo
- gargalos por stage

### 7. Metrics

Objetivo:

- responder "onde o sistema está gastando tempo e tokens?"

Blocos:

- stage timing
- tokens por agente
- custo por projeto
- queue latency
- throttle/backoff
- parse retries

---

## 13. API mínima recomendada

## 13.1 Runtime

- `GET /api/runtime/overview`
- `GET /api/runtime/readiness`
- `GET /api/runtime/events`

## 13.2 Tasks

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/events`
- `GET /api/tasks/:taskId/artifacts`
- `GET /api/tasks/:taskId/views`

## 13.3 Human review

- `POST /api/tasks/:taskId/approve`
- `POST /api/tasks/:taskId/reprove`
- `POST /api/tasks/:taskId/cancel`

## 13.4 Analytics

- `GET /api/metrics/overview`
- `GET /api/metrics/tasks`
- `GET /api/metrics/agents`
- `GET /api/metrics/projects`
- `GET /api/metrics/timeline`

## 13.5 Streaming

- `GET /api/stream`

Eventos SSE sugeridos:

- `runtime.updated`
- `task.updated`
- `task.review_required`
- `task.decision_recorded`
- `metrics.updated`

---

## 14. Estratégia de implementação por fases

## Phase 0 - Fundação e alinhamento de domínio

### Objetivo

Criar a base certa para que CLI, TUI e UI web usem a mesma lógica.

### Entregas

- camada de serviços para `new`, `approve`, `reprove`, `cancel`
- artifact estruturado de aprovação
- normalização de `project`
- primeira versão da camada `observability/*`
- DTOs compartilhados

### Mudanças recomendadas

- extrair código de `src/commands/approve.ts`
- extrair código de `src/commands/reprove.ts`
- substituir lógica duplicada em `src/lib/start/command-handler.ts`
- padronizar gravação de decisão humana
- criar agregadores de task e métricas reutilizáveis

### Critério de aceite

- CLI e TUI produzem os mesmos side effects
- learnings de pipeline são gravados independentemente do canal usado
- task criada por CLI, pipeline ou inline possui projeto consistente

## Phase 1 - API read-only e dashboard inicial

### Objetivo

Entregar a primeira UI web sem risco operacional alto.

### Entregas

- servidor local com rotas read-only
- página Overview
- página Tasks
- página Task Detail
- página Review Queue read-only
- polling simples a cada 2-5s

### Decisão importante

Nesta fase eu recomendo evitar controle do engine via web. O foco é observabilidade.

### Critério de aceite

- um humano consegue saber rapidamente:
  - se o engine está vivo
  - quantas tasks estão ativas
  - quais tasks aguardam revisão
  - quanto cada task já consumiu

## Phase 2 - Ações humanas na web

### Objetivo

Permitir review humano completo pelo browser.

### Entregas

- approve via API
- reprove via API
- cancel via API
- input de motivo de reprovação
- rollback de task quando aplicável
- persistência de decisão humana auditável

### Critério de aceite

- qualquer ação feita na web gera exatamente os mesmos efeitos da CLI
- logs, artifacts e learnings ficam consistentes

## Phase 3 - Realtime e command center operacional

### Objetivo

Dar sensação de sistema vivo, não de dashboard estático.

### Entregas

- file watching
- SSE
- event stream visual
- live refresh seletivo por task
- sinalização forte de transição para `waiting_human`

### Opcional nesta fase

- controles do engine:
  - pause
  - resume
  - graceful stop

### Recomendação

Para controle do engine, usar arquivo de controle ou canal explícito. Não depender de flags em memória do processo.

## Phase 4 - Analytics avançado por task, agente e projeto

### Objetivo

Atacar diretamente seu pedido de métricas por task, agente e projeto.

### Entregas

- ranking de tasks por consumo
- ranking de agentes por consumo
- ranking de projetos por consumo
- curvas de custo/token
- métricas de gargalo
- métricas de loop de QA
- taxa de aprovação e reprovação por agente

### Critério de aceite

- um humano consegue responder "quem consome mais?", "onde estamos travando?" e "quais tasks estão caras demais?"

## Phase 5 - Hardening, UX polish e empacotamento

### Objetivo

Transformar a UI numa superfície confiável de operação diária.

### Entregas

- testes de API
- testes de componentes críticos
- e2e de review queue
- vazios, loaders, estados de erro
- acessibilidade
- responsividade
- comando `synx ui`
- docs de operação

### Critério de aceite

- a UI pode ser usada diariamente sem depender da TUI para contexto básico

---

## 15. Checklist objetivo do que falta

## 15.1 Backend / domínio

- extrair services compartilhados para ações de task
- criar camada de observabilidade compartilhada
- padronizar artifact de aprovação
- padronizar log de decisões humanas
- normalizar `project`
- criar agregadores por agente e projeto
- criar endpoint de task detail consolidado

## 15.2 Runtime / observabilidade

- persistir eventos operacionais além dos logs atuais
- introduzir canal de realtime
- modelar controle externo do engine, se desejado

## 15.3 Frontend

- layout de overview
- fila de revisão
- task list com filtros
- task detail
- dashboards por agente e projeto
- gráficos de tokens/custo/duração

## 15.4 Qualidade

- testes unitários da camada `observability`
- testes de contrato da API
- testes de parity entre CLI/TUI/Web actions
- testes e2e de approve/reprove

---

## 16. Riscos e mitigação

## 16.1 Risco: divergência entre canais de ação

### Mitigação

Centralizar tudo em services compartilhados.

## 16.2 Risco: custo alto de varrer milhares de arquivos

### Mitigação

- começar com scan simples
- se necessário, criar snapshots materializados em `.ai-agents/runtime/index/`

## 16.3 Risco: histórico inconsistente por falta de `project`

### Mitigação

- corrigir criação de task antes da fase de analytics avançado

## 16.4 Risco: expor dados sensíveis em artifacts

### Mitigação

- bind local-only em `127.0.0.1`
- sanitizar payloads de API quando necessário
- nunca expor configs com API key

## 16.5 Risco: UI web tentar virar novo runtime

### Mitigação

- manter source of truth no filesystem e no daemon atual
- UI apenas observa e aciona services explícitos

---

## 17. Definição de MVP recomendada

Eu recomendo considerar como MVP real:

- servidor local read-only
- Overview
- Tasks
- Task Detail
- Review Queue
- métricas por task
- métricas por agente
- métricas por projeto
- approve/reprove web usando services compartilhados

Se isso estiver pronto, você já terá uma interface muito mais amigável do que a TUI para acompanhamento humano.

---

## 18. Ordem recomendada de execução

1. corrigir a base de domínio e unificar ações
2. criar query layer
3. criar API read-only
4. subir frontend inicial
5. adicionar review actions
6. adicionar realtime
7. expandir analytics

Essa ordem minimiza retrabalho e evita criar uma UI bonita em cima de contratos frágeis.

---

## 19. Decisão final recomendada

Se eu estivesse implementando isso na sequência, faria assim:

- **primeiro**: estabilizar contratos e services compartilhados
- **depois**: criar `synx ui` com backend local + frontend React
- **depois**: habilitar review humano pela web
- **por fim**: sofisticar realtime e analytics

O ponto mais importante do plano não é o framework do frontend. O ponto mais importante é evitar que CLI, TUI e UI web passem a carregar regras de negócio diferentes. Se essa unificação vier antes, o restante do roadmap fica bem mais seguro e reaproveita de verdade o que o projeto já construiu.
