# SYNX — Roadmap Técnico Detalhado
> Gerado em: 2026-03-23 · Fechado em: 2026-03-24
> Objetivo: Fábrica de software automatizada — enviar uma tarefa, agentes especializados identificarem o tipo, e o ciclo de desenvolvimento correr automaticamente de agente para agente sem intervenção humana exceto na revisão final.

---

## Status Final

| Fase | Descrição | Status |
|---|---|---|
| 1.1 | FallbackModel list + cross-provider fallback | ✅ Concluído |
| 1.2 | Project Orchestrator no AgentName | ✅ Concluído |
| 1.3 | Auto-approve threshold | ✅ Concluído |
| 1.4 | File conflict detection (parallel tasks) | 🔜 Pendente (issue separada) |
| 2.1 | Synx Code Reviewer (Stage 07) | ✅ Concluído |
| 2.2 | Synx DevOps Expert (Stage 04) | ✅ Concluído |
| 2.3 | Synx Security Auditor (Stage 08) | ✅ Concluído |
| 2.4 | Synx Documentation Writer (Stage 04) | ✅ Concluído |
| 2.5 | Synx DB Architect (Stage 04) | ✅ Concluído |
| 2.6 | Synx Performance Optimizer (Stage 04) | ✅ Concluído |
| 3.1 | Novos endpoints server.ts (config, tasks, files) | ✅ Concluído |
| 3.2 | Tab "Settings" na sidebar | ✅ Concluído |
| 3.3 | Task Detail Drawer (Overview / Artifacts / History) | ✅ Concluído |
| 3.4 | Modal "New Task" | ✅ Concluído |
| 3.5 | Tab "Metrics" (sparkline, rankings, cards) | ✅ Concluído |
| 3.6 | Browser Notifications + Inline Command footer | ✅ Concluído |
| 4.1 | Project Memory — injeção em experts + write-back | ✅ Concluído |
| 4.2 | Agent Collaboration — consulta in-process com cache | ✅ Concluído |
| 4.3 | Enhanced Dispatcher Chain — suggestedChain + pipeline position | ✅ Concluído |
| 4.4 | Smart QA Retry — adaptive strategy (local_patch → expanded_context → strategy_shift) | ✅ Concluído |
| 5.1 | Webhooks — HTTP POST config-driven por evento | ✅ Concluído |
| 5.2 | `synx ci` — modo CI/CD não-interativo com exit codes | ✅ Concluído |
| 5.3 | Export — `GET /api/tasks/:id/export` audit trail completo | ✅ Concluído |
| 5.4 | Diagnostic improvements — `synx doctor` real + "Test Provider" na UI | 🔜 Pendente (issue separada) |

**Resultado: 22 de 24 itens concluídos. 815 testes passando. 0 erros TypeScript.**

---

## 1. Avaliação Geral do Estado Atual

### O que estava sólido ✅ (pré-roadmap)
- Arquitetura stage-based funciona: cada arquivo JSON na inbox representa um handoff limpo entre agentes
- Sistema de fallback de providers existe (mas só 1 model de fallback, não uma lista)
- Learning loop: learnings de approvals/reproves são injetados de volta nos prompts futuros
- 5 experts built-in cobrindo Front, Mobile, Back, QA e SEO
- Web UI com dashboard, review queue, stream e prompt de projeto
- Concorrência de até 3 tasks paralelas (`AI_AGENTS_TASK_CONCURRENCY`)
- Sistema de rollback de arquivos por task
- Anti-loop guard no QA (max 3 retries por issue)

### O que estava frágil / faltando ❌ (pré-roadmap)
| Área | Problema | Resolução |
|---|---|---|
| **Fallback models** | `fallbackModel?: string` é só 1 modelo | ✅ `FallbackModel[]` com cross-provider |
| **Agentes ausentes** | Falta DevOps, Security, Docs Writer, Code Reviewer, DB Architect, Perf Optimizer | ✅ Todos implementados |
| **Ciclo automático** | Tasks sempre param em `waiting_human` sem modo auto-approve | ✅ `autoApproveThreshold` configurável |
| **Conflito de arquivos** | Nenhuma detecção quando 2 tasks tocam o mesmo arquivo | 🔜 Pendente |
| **UI: Settings** | Não tem página para configurar providers/modelos por agente | ✅ Tab Settings implementada |
| **UI: Task creation** | Só tem prompt de projeto — falta form de tarefa individual | ✅ Modal "New Task" |
| **UI: Task detail** | Não exibe artifacts, timeline, histórico de reproves | ✅ Task Detail Drawer |
| **UI: Metrics** | Métricas existem no server mas não aparecem na UI | ✅ Tab Metrics com sparkline |
| **UI: Runtime controls** | Pause/Resume/Stop existem na API mas não têm botões na UI | ✅ Botões na Settings |
| **Context injection** | Agentes não sabem padrões do projeto | ✅ Project Memory injectado em todos experts |
| **Agent collaboration** | Expert não consegue pedir ajuda a outro expert | ✅ `requestAgentConsultation()` com cache |
| **"Project Orchestrator"** | Não está no union type `AgentName` | ✅ Adicionado ao union |

---

## 2. O que Falta para o Objetivo Principal

> **Objetivo:** Enviar prompt → orquestrador cria tasks → agentes identificam tipo → ciclo corre automaticamente de agente para agente

### ✅ Gap 1: Auto-approve por confidence score — RESOLVIDO
`autoApproveThreshold` em `LocalProjectConfig`. Quando QA finaliza com `riskLevel === "low"` E confidence >= threshold, a task vai direto para `done`.

### ✅ Gap 2: Context Injection inteligente — RESOLVIDO
`.ai-agents/memory/project-memory.json` com `{patterns, decisions, knownIssues}`. Injectado no system prompt de todos os experts via `buildAgentRoleContract()`. Write-back automático após QA pass.

### ✅ Gap 3: Agent Collaboration — RESOLVIDO
`requestAgentConsultation()` com caching por `(stage, consultant, question)`, budget limit de 3/par, deduplicação case-insensitive. `WorkerBase.consultAgent()` disponível para todos os experts.

### 🔜 Gap 4: File Conflict Detection — PENDENTE
2 tasks rodando em paralelo podem editar o mesmo arquivo. Será implementado como issue separada: `file-locks.json` em `.ai-agents/runtime/` com reserva de arquivos por task.

### ✅ Gap 5: "Project Orchestrator" como AgentName — RESOLVIDO
Adicionado ao union `AgentName`. `agentProviders` no GlobalConfig consegue configurar o modelo dele separadamente.

---

## 3. Agentes Implementados

### Cadeia de Agentes Completa por Tipo de Task

```
Feature (Frontend):
  Dispatcher → Front Expert → Code Reviewer → QA Engineer → [Security Auditor?] → Human Review

Feature (Backend):
  Dispatcher → Back Expert → [DB Architect?] → Code Reviewer → QA Engineer → Security Auditor → Human Review

Feature (Mobile):
  Dispatcher → Mobile Expert → Code Reviewer → QA Engineer → Human Review

Infrastructure/Deploy:
  Dispatcher → DevOps Engineer → Code Reviewer → Human Review

Documentation:
  Dispatcher → Docs Writer → Human Review

Performance:
  Dispatcher → Performance Optimizer → Code Reviewer → Human Review

Bug (Critical):
  Dispatcher → Expert → Code Reviewer → QA Engineer → Human Review (priority queue)
```

---

## 4. Modelo LLM por Agente com Lista de Fallbacks ✅

`ProviderStageConfig` suporta `fallbackModels?: FallbackModel[]` com cross-provider fallback. `executeWithFallback()` itera a lista em ordem, logando qual fallback foi usado.

---

## 5. UI Completa ✅

Todos os incrementos implementados como vanilla JS SPA aditiva:
- **Settings tab**: providers table, runtime controls (pause/resume/stop/threshold), project info
- **Metrics tab**: sparkline SVG, rankings por agente/task/projeto, cards 24h/7d/30d
- **Task Detail Drawer**: Overview (timeline, approve/reprove), Artifacts (JSON viewer), History (reproves/learnings)
- **New Task Modal**: form completo com tipo, E2E policy, contexto
- **Browser Notifications**: Notification API quando task entra em `waiting_human`
- **Inline Command**: footer com POST `/api/command`

---

## 6. Ciclo Automático Avançado ✅

- **Project Memory**: injectado em experts, write-back após QA pass
- **Agent Collaboration**: consulta in-process com cache e budget
- **suggestedChain**: Dispatcher persiste chain sugerida → experts sabem sua posição no pipeline
- **Smart QA Retry**: `local_patch` → `expanded_context` → `strategy_shift` → Human Review (no-progress abort)

---

## 7. Produção e Integração ✅

- **Webhooks**: `deliverWebhook()` config-driven (enabled, url, events filter)
- **`synx ci`**: exit 0=done, 1=failed, 2=timeout, 3=waiting_human. Opções: `--timeout`, `--fail-fast`, `--dry-run`
- **Export**: `GET /api/tasks/:id/export` — stages, custos, tokens, outputs do dispatcher e QA
- **`synx doctor`**: melhorias pendentes (issue separada)

---

## 8. Itens Pendentes (Issues Separadas)

### 1.4 — File Conflict Detection
- Detectar quando 2 tasks paralelas reservam o mesmo arquivo
- `src/lib/file-locks.ts`: mapa `filePath → taskId` em `.ai-agents/runtime/file-locks.json`
- Task mais nova entra em `waiting_agent` até conflito liberar

### 5.4 — Diagnostic Improvements
- `synx doctor` com chamada real ao provider (não só config check) — mede latência
- Botão "Test Provider" na Settings page da UI
- Output estruturado com latência e erro por provider

---

## 9. Métricas de Sucesso (Final)

- ✅ **Fase 1:** `synx setup` deixa configurar lista de fallbacks e auto-approve threshold
- ✅ **Fase 2:** Task de feature completa o ciclo `Dispatcher → Expert → Code Reviewer → QA → Security → waiting_human` sem intervenção
- ✅ **Fase 3:** Tudo que se faz na CLI consegue ser feito na UI sem abrir terminal
- ✅ **Fase 4:** Task marcada como `done` automaticamente quando threshold met
- ✅ **Fase 5:** `synx ci` funciona em pipeline de GitHub Actions (exit codes padronizados)

---

*Roadmap fechado em 2026-03-24. 22/24 itens implementados. 815 testes. 0 erros TS.*
