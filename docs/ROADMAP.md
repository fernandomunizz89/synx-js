# SYNX — Roadmap Técnico Detalhado
> Gerado em: 2026-03-23
> Objetivo: Fábrica de software automatizada — enviar uma tarefa, agentes especializados identificarem o tipo, e o ciclo de desenvolvimento correr automaticamente de agente para agente sem intervenção humana exceto na revisão final.

---

## 1. Avaliação Geral do Estado Atual

### O que está sólido ✅
- Arquitetura stage-based funciona: cada arquivo JSON na inbox representa um handoff limpo entre agentes
- Sistema de fallback de providers existe (mas só 1 model de fallback, não uma lista)
- Learning loop: learnings de approvals/reproves são injetados de volta nos prompts futuros
- 5 experts built-in cobrindo Front, Mobile, Back, QA e SEO
- Web UI com dashboard, review queue, stream e prompt de projeto
- Concorrência de até 3 tasks paralelas (`AI_AGENTS_TASK_CONCURRENCY`)
- Sistema de rollback de arquivos por task
- Anti-loop guard no QA (max 3 retries por issue)

### O que está frágil / faltando ❌
| Área | Problema |
|---|---|
| **Fallback models** | `fallbackModel?: string` é só 1 modelo — deveria ser lista `string[]` |
| **Agentes ausentes** | Falta DevOps, Security, Docs Writer, Code Reviewer, DB Architect, Perf Optimizer |
| **Ciclo automático** | Tasks sempre param em `waiting_human` — sem modo auto-approve por confidence |
| **Conflito de arquivos** | Nenhuma detecção quando 2 tasks tocam o mesmo arquivo |
| **UI: Settings** | Não tem página para configurar providers/modelos por agente |
| **UI: Task creation** | Só tem prompt de projeto — falta form de tarefa individual |
| **UI: Task detail** | Não exibe artifacts, timeline, histórico de reproves |
| **UI: Metrics** | Métricas existem no server mas não aparecem na UI |
| **UI: Runtime controls** | Pause/Resume/Stop existem na API mas não têm botões na UI |
| **Context injection** | Agentes não sabem padrões do projeto (tech stack, conventions em uso) |
| **Agent collaboration** | Expert não consegue pedir ajuda a outro expert sem ir ao humano |
| **"Project Orchestrator"** | Não está no union type `AgentName`, então `agentProviders` não consegue configurá-lo |

---

## 2. O que Falta para o Objetivo Principal

> **Objetivo:** Enviar prompt → orquestrador cria tasks → agentes identificam tipo → ciclo corre automaticamente de agente para agente

### Gap 1: Auto-approve por confidence score
O Dispatcher já produz `confidenceScore`. Se a confiança for alta (ex: > 0.85) e o tipo de task for `Research` ou `Documentation`, a task poderia avançar sem parar em `waiting_human`.

**Decisão técnica:** Adicionar `autoApproveThreshold?: number` em `LocalProjectConfig`. Quando o QA finaliza com `riskLevel === "low"` E o score de confiança do dispatcher for >= threshold, a task vai direto para `done` sem esperar humano.

### Gap 2: Context Injection inteligente
Agentes recebem o prompt e o histórico da task, mas não sabem:
- Quais bibliotecas o projeto já usa
- Padrões de arquitetura existentes (ex: "usamos Zustand, não Context API")
- Decisões tomadas em tasks anteriores relacionadas

**Decisão técnica:** Criar `.ai-agents/context/project-memory.json` — um arquivo acumulativo com `{patterns: [], decisions: [], conventions: []}` que é atualizado após cada task aprovada e injetado em todos os prompts de experts.

### Gap 3: Agent Collaboration (expert-to-expert)
Se o Front Expert precisa saber como funciona a API do Back, hoje ele ou alucina ou para para review humana.

**Decisão técnica:** Adicionar `collaborationRequest` no output de experts. Quando um expert solicita contexto de outro, o sistema cria uma sub-task de `Research` direcionada ao expert correto e injeta o resultado de volta antes de continuar.

### Gap 4: File Conflict Detection
2 tasks rodando em paralelo podem editar o mesmo arquivo. O resultado é merges conflitantes ou sobrescrita.

**Decisão técnica:** Ao começar um expert, registrar em `.ai-agents/runtime/file-locks.json` quais arquivos a task pretende tocar (baseado no dispatcher handoff). Se overlap detectado, a task mais nova entra em fila. Liberado quando a task anterior completa.

### Gap 5: "Project Orchestrator" como AgentName
O orchestrator existe como worker mas não está no union `AgentName`, então `agentProviders` no GlobalConfig não consegue configurar o modelo dele separadamente.

---

## 3. Agentes Ausentes para uma Fábrica de Software

### Agentes que faltam

| Agente | Responsabilidade | Stage File Prefix | Quando ativado |
|---|---|---|---|
| **DevOps Engineer** | Dockerfile, GitHub Actions, terraform, deploy scripts, environment vars | `04-synx-devops-expert` | Dispatcher roteia tasks de infra/deploy/CI |
| **Security Auditor** | OWASP Top 10, dependency vulnerabilities (npm audit), secrets scanning, auth review | `08-synx-security-auditor` | Sempre após expert em tasks de Auth/API/Payments (ou on-demand) |
| **Documentation Writer** | README, JSDoc/TSDoc, Swagger/OpenAPI, CHANGELOG, ADRs | `04-synx-docs-writer` | Tasks tipo `Documentation` ou quando expert marca `generateDocs: true` |
| **Code Reviewer** | Conventions, DRY, SOLID, dead code, naming, complexity (sem rodar testes) | `07-synx-code-reviewer` | Entre Expert e QA — reviewar antes de testar |
| **Database Architect** | Schema design, Prisma migrations, índices, query optimization, seeds | `04-synx-db-architect` | Tasks envolvendo modelos de dados, migrations, performance de queries |
| **Performance Optimizer** | Bundle analysis, Lighthouse, N+1 queries, memoization, caching patterns | `09-synx-perf-optimizer` | On-demand ou quando QA detecta Lighthouse < 80 |

### Cadeia de Agentes Completa por Tipo de Task

```
Feature (Frontend):
  Dispatcher → Front Expert → Code Reviewer → QA Engineer → [Security Auditor?] → Human Review

Feature (Backend):
  Dispatcher → Back Expert → [DB Architect?] → Code Reviewer → QA Engineer → Security Auditor → Human Review

Feature (Mobile):
  Dispatcher → Mobile Expert → Code Reviewer → QA Engineer → Human Review

Infrastructure/Deploy:
  Dispatcher → DevOps Engineer → Security Auditor → Human Review

Documentation:
  Dispatcher → Docs Writer → Human Review

Research:
  Dispatcher → Web Researcher → Docs Writer → Human Review

Bug (Critical):
  Dispatcher → Expert → Code Reviewer → QA Engineer → Human Review (priority queue)

Full Feature (Database + API + UI):
  Orchestrator → [DB Architect || Back Expert || Front Expert] paralelo → Code Reviewer → QA Engineer → Human Review
```

### Prompt files necessários (`.ai-agents/prompts/`)
- `synx-devops-expert.md`
- `synx-security-auditor.md`
- `synx-docs-writer.md`
- `synx-code-reviewer.md`
- `synx-db-architect.md`
- `synx-perf-optimizer.md`

---

## 4. Modelo LLM por Agente com Lista de Fallbacks

### Problema atual
`ProviderStageConfig` tem `fallbackModel?: string` — só 1 fallback. Para uma fábrica de software real, precisamos:
- Lista ordenada de fallbacks: se `claude-opus-4` falha por rate limit → tenta `claude-sonnet-4-5` → tenta `gpt-4o`
- Fallback cross-provider: se Anthropic está fora → cai em OpenAI → cai em modelo local (LM Studio)
- Por agente: Code Reviewer pode usar modelo mais leve/barato; Security Auditor precisa do modelo mais capaz

### Decisão técnica: Upgrade de `ProviderStageConfig`

```typescript
// ANTES
export interface ProviderStageConfig {
  type: ProviderType;
  model: string;
  fallbackModel?: string;           // ← só 1
  // ...
}

// DEPOIS
export interface ProviderStageConfig {
  type: ProviderType;
  model: string;
  fallbackModels?: FallbackModel[]; // ← lista ordenada
  // ...
}

export interface FallbackModel {
  type: ProviderType;               // pode ser provider diferente do primário
  model: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  apiKey?: string;
}
```

### Exemplo de config global com fallbacks por agente

```json
// .ai-agents/config/global.json
{
  "providers": {
    "dispatcher": {
      "type": "anthropic",
      "model": "claude-opus-4-5",
      "fallbackModels": [
        { "type": "anthropic", "model": "claude-sonnet-4-5" },
        { "type": "openai-compatible", "model": "gpt-4o" },
        { "type": "lmstudio", "model": "qwen2.5-coder-32b" }
      ]
    }
  },
  "agentProviders": {
    "Project Orchestrator": {
      "type": "anthropic",
      "model": "claude-opus-4-5",
      "fallbackModels": [
        { "type": "openai-compatible", "model": "gpt-4o" }
      ]
    },
    "Synx Front Expert": {
      "type": "anthropic",
      "model": "claude-sonnet-4-5",
      "fallbackModels": [
        { "type": "anthropic", "model": "claude-haiku-4-5" },
        { "type": "lmstudio", "model": "qwen2.5-coder-32b" }
      ]
    },
    "Synx Security Auditor": {
      "type": "anthropic",
      "model": "claude-opus-4-5",
      "fallbackModels": [
        { "type": "openai-compatible", "model": "o3-mini" }
      ]
    },
    "Synx Code Reviewer": {
      "type": "openai-compatible",
      "model": "gpt-4o-mini",
      "fallbackModels": [
        { "type": "lmstudio", "model": "qwen2.5-coder-7b" }
      ]
    }
  }
}
```

### Lógica de fallback no provider factory
```
1. Tenta provider primário (model principal)
2. Se erro recoverable (rate limit, timeout, 503):
   - Itera fallbackModels em ordem
   - Instancia provider correto para o fallback
   - Loga qual fallback foi usado em events.log
3. Se erro não-recoverable (auth failure, invalid model):
   - Falha imediata, não tenta fallbacks
4. Registra em TaskMeta.history qual provider/model foi usado
```

---

## 5. Melhorias Incrementais na UI

> Princípio: UI deve conseguir fazer TUDO que a CLI faz. Cada incremento é pequeno e aditivo.

### 5.1 — Tab "Settings" na sidebar
Nova página na sidebar com 3 seções:

**Providers:**
- Tabela: agente | provider atual | modelo | fallbacks
- Click para editar inline (dropdown de provider type + input de model)
- Botão "+ Add Fallback" que adiciona linha na lista de fallbacks
- Save → POST /api/config (novo endpoint)

**Runtime:**
- Toggle "Auto-approve" + input de threshold (0.0–1.0)
- Input de concurrency (1, 2, 3 tasks paralelas)
- Botões Pause / Resume / Stop engine
- Indicador de uptime

**Project:**
- Campos: project name, language, framework
- Toggle "E2E Policy" global (auto/required/skip)

### 5.2 — Modal "New Task" além do Project Prompt
O prompt de projeto cria tasks tipo `Project` (vai ao Orchestrator). Mas às vezes o usuário quer criar uma task individual diretamente.

**Botão "+ New Task"** no topbar abre modal com:
- Título
- Tipo (Feature/Bug/Refactor/Research/Documentation/Mixed)
- Descrição / rawRequest (textarea)
- Contexto extra (arquivo(s) relacionados, notas)
- E2E policy (auto/required/skip) — aparece só se tipo ≠ Research/Documentation
- Submit → POST /api/tasks (novo endpoint, wrap de createTaskService)

### 5.3 — Task Detail (drawer ou página)
Click numa task qualquer abre drawer lateral (não modal) com:

**Aba "Overview":**
- Status, tipo, agente atual, criada em
- rawRequest completo
- Timeline de eventos (cada stage: agente, duração, modelo usado, timestamp)
- Botões Approve/Reprove/Cancel no topo se waiting_human

**Aba "Artifacts":**
- Lista de artifacts disponíveis (dispatcher.done.json, expert.done.json, qa-findings.json, etc)
- Click → mostra conteúdo formatado (JSON prettify ou Markdown render)
- Botão "Download"

**Aba "History":**
- Lista de reproves: timestamp, motivo, agente que recebeu
- Lista de learnings registrados para essa task

### 5.4 — Metrics Tab
Aba na sidebar com dashboard de consumo:

**Cards de sumário (24h / 7d / 30d selecionável):**
- Total tokens (input + output)
- Custo estimado total
- Tasks concluídas
- Taxa de aprovação na primeira revisão

**Rankings:**
- Top agentes por custo
- Top tasks por custo
- Top projetos por custo

**Gráfico de timeline** (sparkline simples via SVG):
- Tokens por dia (últimos 30 dias)

Todos os dados vêm dos endpoints `/api/metrics/*` que já existem.

### 5.5 — Comando Inline na UI
Campo de texto na sidebar footer (colapsável):
```
> synx approve task-123
> synx fix
> synx doctor
```
→ POST /api/command já existe no server, só falta expor na UI.

### 5.6 — Notificação de Review pendente
Badge já existe na sidebar. Adicionar:
- Browser Notification API: quando task entra em `waiting_human`, dispara `new Notification("SYNX: Task pronta para review", { body: title })`
- Pede permissão na primeira vez com botão discreto no topbar

---

## 6. Plano de Implementação em Fases

### Fase 1 — Fundação (Semana 1–2)
> Sem essas mudanças, tudo na Fase 2+ fica frágil

**1.1 Upgrade `fallbackModels` na infraestrutura**
- `src/lib/types.ts`: `fallbackModel?: string` → `fallbackModels?: FallbackModel[]` + novo tipo `FallbackModel`
- `src/lib/schema.ts`: schema Zod correspondente
- `src/providers/factory.ts`: lógica de retry iterando `fallbackModels`
- `src/commands/setup.ts`: interface de setup suporta adicionar lista de fallbacks por agente
- Backward compat: se `fallbackModel` existir (string), converte automaticamente para `fallbackModels[0]`
- Testes: mock provider com cenários de retry

**1.2 "Project Orchestrator" no AgentName**
- `src/lib/types.ts`: adicionar `"Project Orchestrator"` ao union `AgentName`
- Permite configurar via `agentProviders` no GlobalConfig

**1.3 Auto-approve threshold**
- `src/lib/types.ts`: adicionar `autoApproveThreshold?: number` em `LocalProjectConfig`
- `src/workers/base.ts`: após QA finalizar com `riskLevel === "low"`, verificar threshold
- Se `dispatcherConfidence >= threshold` E `riskLevel === "low"` → chamar `approveTaskService()` automaticamente
- Log: registra auto-aprovação em `events.log` com motivo

**1.4 File conflict detection básico**
- `src/lib/runtime.ts` (ou novo `src/lib/file-locks.ts`): manter mapa `filePath → taskId` em `.ai-agents/runtime/file-locks.json`
- Ao iniciar expert: ler `edits` do dispatcher handoff, tentar reservar arquivos
- Se conflito: marcar task como `waiting_agent` (re-tenta depois que conflito libera)
- Ao task completar/falhar: liberar seus locks

---

### Fase 2 — Novos Agentes Especialistas (Semana 2–4)

Cada agente segue o mesmo padrão dos existentes. Ordem de prioridade:

**2.1 Code Reviewer** (mais impacto imediato)
- `src/workers/experts/synx-code-reviewer.ts`
- Stage: `07-synx-code-reviewer.{request,working,done}.json`
- Input: expert output (edits + implementationSummary)
- Output: `{ reviewPassed: boolean, issues: [{file, line, severity, message}], suggestions: string[], summary: string }`
- Inserido entre Expert e QA na chain default do Dispatcher
- Se `reviewPassed === false` E severity tem `"critical"`: volta ao expert com issues
- Se só warnings: passa para QA com issues como contexto adicional
- Prompt file: `.ai-agents/prompts/synx-code-reviewer.md`

**2.2 DevOps Engineer**
- `src/workers/experts/synx-devops-expert.ts`
- Stage: `04-synx-devops-expert.{request,working,done}.json`
- Keywords no dispatcher que ativam: "deploy", "docker", "ci", "cd", "pipeline", "kubernetes", "terraform", "actions", "workflow", "environment"
- Output: mesmo schema builder (edits em Dockerfile, .github/workflows/, etc)
- Prompt: especializado em GitHub Actions, Docker multi-stage, secrets management

**2.3 Security Auditor**
- `src/workers/experts/synx-security-auditor.ts`
- Stage: `08-synx-security-auditor.{request,working,done}.json`
- Stage 08 = roda DEPOIS do QA, ANTES de `waiting_human`
- Ativado automaticamente quando task envolve: auth, payments, API keys, login, tokens, permissions
- Output: `{ auditPassed: boolean, vulnerabilities: [{severity: "critical"|"high"|"medium"|"low", cve?, description, file, fix}], summary: string }`
- Se `critical` ou `high` vulnerabilities: volta ao expert com security brief
- Prompt: OWASP Top 10, secrets never in code, input validation, SQL injection, XSS

**2.4 Documentation Writer**
- `src/workers/experts/synx-docs-writer.ts`
- Stage: `04-synx-docs-writer.{request,working,done}.json`
- Ativado para tasks tipo `Documentation` ou quando expert output tem `generateDocs: true`
- Output: builder schema (edits em README.md, docs/, JSDoc comments, OpenAPI spec)
- Não precisa de QA nem Code Review — vai direto para `waiting_human`

**2.5 Database Architect**
- `src/workers/experts/synx-db-architect.ts`
- Stage: `04-synx-db-architect.{request,working,done}.json`
- Ativado quando keywords: "schema", "migration", "model", "database", "prisma", "query", "index"
- Output: builder schema (edits em `schema.prisma`, migrations, seeds)
- Pode colaborar com Back Expert: DB Architect define schema → Back Expert implementa services

**2.6 Performance Optimizer** (menor prioridade — deixa por último)
- `src/workers/experts/synx-perf-optimizer.ts`
- Stage: `09-synx-perf-optimizer.{request,working,done}.json`
- On-demand (flag na task) ou quando QA detecta lighthouse < 80
- Output: builder schema (bundle analysis, memoization, query optimization)

**Dispatcher update:**
- Atualizar prompt do Dispatcher para conhecer os novos agentes e suas condições de ativação
- Atualizar schema de output do dispatcher para incluir `securityAuditRequired: boolean`, `codeReviewRequired: boolean`
- Atualizar `STAGE_FILE_NAMES` e `DONE_FILE_NAMES` em `constants.ts`
- Adicionar novos AgentNames ao union type

---

### Fase 3 — UI Completa (Semana 3–5, paralelo com Fase 2)

Todos os incrementos são aditivos — não mudam o que existe, só adicionam.

**3.1 Endpoints novos no server.ts**
```
POST /api/tasks              → createTaskService() (task individual, não projeto)
GET  /api/config             → retorna GlobalConfig + LocalProjectConfig resolved
POST /api/config             → salva alterações de config
POST /api/runtime/pause      → já existe, expor na UI
POST /api/runtime/resume     → já existe, expor na UI
GET  /api/tasks/:id/detail   → TaskMeta + todos done files + artifacts list
GET  /api/tasks/:id/artifact?scope=done&name=00-dispatcher.done.json → arquivo JSON
```

**3.2 Tab "Settings" na sidebar**
- Nova entrada na sidebar entre "Live Stream" e footer
- Página `page-settings` com 3 seções: Providers, Runtime, Project
- Providers: tabela editável de agentes com modelo principal + lista de fallbacks
- Runtime: pause/resume/stop, concurrency, auto-approve threshold
- Cada campo tem botão Save individual (PATCH semântico)

**3.3 Drawer de Task Detail**
- Click em qualquer linha/card de task abre drawer que desliza da direita (sem mudar de página)
- Drawer tem 3 abas: Overview, Artifacts, History
- Não bloqueia a listagem (drawer sobre o conteúdo)
- Fecha com ESC ou click fora

**3.4 Modal "New Task"**
- Botão "＋ Nova Task" no topbar (ao lado do tema)
- Modal com form completo (título, tipo, descrição, E2E policy)
- Chama POST /api/tasks ao submeter
- Fecha e atualiza dashboard automaticamente

**3.5 Tab "Metrics"**
- Cards de sumário com seletor 24h/7d/30d
- Gráfico SVG inline de tokens por dia (sem biblioteca externa)
- Rankings de agentes/tasks/projetos
- Dados de `/api/metrics/*`

**3.6 Notificações e comando inline**
- Permissions + Notification API quando task entra em review
- Input de comando inline na sidebar footer

---

### Fase 4 — Ciclo Automático Avançado (Semana 5–7)

**4.1 Project Memory**
- `.ai-agents/context/project-memory.json`:
  ```json
  {
    "lastUpdated": "...",
    "patterns": ["Uses Zustand for state", "TailwindCSS v4", "NestJS with fastify adapter"],
    "decisions": [{"date":"...", "decision":"Chose Prisma over Drizzle", "taskId":"..."}],
    "conventions": ["All API routes prefixed with /api/v1", "Error responses use RFC 9457"]
  }
  ```
- Atualizado por um hook após task aprovada: LLM extrai patterns/decisions do output
- Injetado no system prompt de todos experts como "Project Context"

**4.2 Agent Collaboration Request**
- Novo campo em expert output: `collaborationNeeded?: { agent: AgentName, question: string }`
- Quando presente: sistema cria task de Research com aquele agente como target
- Resultado injetado de volta na task original antes de continuar
- Exemplo: Front Expert → "preciso saber endpoints da API" → sistema chama Back Expert com query → injeta resposta → Front Expert continua

**4.3 Enhanced Dispatcher routing**
- Dispatcher output adiciona: `suggestedChain: AgentName[]` — a chain completa sugerida para essa task
- Ex: `["Synx Back Expert", "Synx DB Architect", "Synx Code Reviewer", "Synx QA Engineer", "Synx Security Auditor"]`
- Sistema executa a chain em ordem, passando contexto acumulado
- Human review só no final da chain (não entre cada agente)

**4.4 Smart retry no QA**
- Quando QA falha (tests failing), antes de voltar pro expert:
  1. Verifica se o erro é de tipo que o Code Reviewer pode ajudar (lint, types)
  2. Se sim, cria micro-loop: Expert → Code Reviewer (sem QA) → Expert novamente
  3. Se falha novamente: escala para humano com contexto completo
- Evita loops infinitos com contador global por task (max 5 ciclos total)

---

### Fase 5 — Produção e Integração (Semana 7–9)

**5.1 Webhook support**
- Config: `webhookUrl?: string` em GlobalConfig
- Eventos: `task.created`, `task.waiting_human`, `task.done`, `task.failed`
- Payload: `{event, taskId, title, status, agentName, timestamp}`
- Útil para: Slack notifications, GitHub status checks, Discord bots

**5.2 CI/CD Integration**
- Novo comando `synx ci` que:
  - Recebe task via stdin ou `--prompt`
  - Roda com `--no-interactive` (sem review humana, auto-approve se threshold met)
  - Exit code 0 = task aprovada, 1 = falhou, 2 = esperando review humana
  - `--format json` para output legível por scripts

**5.3 Export de resultados**
- `GET /api/tasks/:id/export?format=markdown` → gera relatório completo da task em MD
- `GET /api/tasks/export?status=done&from=2026-01-01` → export em lote
- Útil para geradores de CHANGELOG automático

**5.4 Diagnostic improvements**
- `synx doctor` melhorado: testa cada provider com uma chamada real (não só config check)
- UI: botão "Test Provider" na Settings page dispara o health check e mostra latência/erro

---

## 7. Resumo de Decisões Técnicas

| Decisão | Escolha | Motivo |
|---|---|---|
| Fallback models | `FallbackModel[]` com type+model por entrada | Suporta cross-provider fallback |
| Auto-approve | Threshold numérico (0.0–1.0) por projeto | Flexível, não binário |
| Novos agentes | Mesma arquitetura WorkerBase + stage file | Consistência, sem risco de regressão |
| UI Settings | Nova tab aditiva na sidebar | Não quebra nada existente |
| Task detail | Drawer lateral (não rota nova) | Mantém contexto da listagem |
| Project memory | Arquivo JSON plano em `.ai-agents/context/` | Simples, editável manualmente |
| Conflicts | File locks em JSON no runtime dir | Solução simples sem banco de dados |
| Agent collab | Sub-task de Research com resultado injetado | Reutiliza infra existente |
| Metrics UI | SVG inline (sem Chart.js) | Zero dependências novas |
| Webhooks | HTTP POST com retry | Padrão de mercado, sem broker |

---

## 8. Ordem de Execução Recomendada

```
Semana 1:  Fase 1 completa (fallbackModels + Project Orchestrator em AgentName + auto-approve básico)
Semana 2:  Code Reviewer + DevOps Expert (Fase 2.1 e 2.2)
Semana 3:  UI Settings + Task Detail drawer (Fase 3.1, 3.2, 3.3)
Semana 4:  Security Auditor + Docs Writer (Fase 2.3 e 2.4)
Semana 5:  UI New Task modal + Metrics tab (Fase 3.4 e 3.5)
Semana 6:  Project Memory + Enhanced Dispatcher chain (Fase 4.1 e 4.3)
Semana 7:  DB Architect + Agent Collaboration (Fase 2.5 e 4.2)
Semana 8:  Smart QA retry + Performance Optimizer (Fase 4.4 e 2.6)
Semana 9:  Webhooks + CI command + Export (Fase 5)
```

---

## 9. Métricas de Sucesso

- **Fase 1 concluída quando:** `synx setup` deixa configurar lista de fallbacks e auto-approve threshold; build passa sem erros TS
- **Fase 2 concluída quando:** Task de feature completa o ciclo `Dispatcher → Expert → Code Reviewer → QA → Security → waiting_human` sem intervenção
- **Fase 3 concluída quando:** Tudo que se faz na CLI consegue ser feito na UI sem abrir terminal
- **Fase 4 concluída quando:** Task marcada como `done` automaticamente quando `riskLevel === "low"` E threshold met
- **Fase 5 concluída quando:** `synx ci --prompt "..." --auto-approve 0.8` funciona em pipeline de GitHub Actions

---

*Este documento deve ser atualizado a cada fase concluída.*
