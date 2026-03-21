# Plano: Synx como Orquestrador Configurável de Pipelines

## Contexto atual

O sistema já tem uma base excelente:
- Workers com handoff via arquivo (`inbox/` → `working/` → `done/`)
- Multi-provider (Anthropic, OpenAI, Google, LMStudio)
- `WorkerBase` com ciclo de vida completo
- `finishStage()` já faz o enfileiramento para o próximo agente

**O problema:** o pipeline é hardcoded. `nextAgent` é um union literal de TypeScript, e os agentes existem como enums. Não dá pra compor sequências novas sem mudar código.

---

## O que precisa mudar

### Phase 1 — Generic Agent + Dynamic Registry

Hoje cada agente é uma classe TypeScript (`SynxFrontExpert`, `SynxBackExpert`, etc). A ideia é criar um `GenericAgent` que aceita qualquer configuração:

```
.ai-agents/agents/
  my-architect.json   ← define nome, prompt, provider, input/output schema
  my-reviewer.json
```

```json
{
  "id": "my-architect",
  "name": "My Architect",
  "prompt": ".ai-agents/prompts/my-architect.md",
  "provider": { "type": "openai-compatible", "model": "gpt-4o" },
  "outputSchema": "builder"
}
```

O `GenericAgent` implementa `WorkerBase`, lê esse JSON e executa. Adicionar um agente novo = criar um arquivo, sem tocar código.

---

### Phase 2 — Pipeline Definition

Novo diretório `.ai-agents/pipelines/` com definições de sequências:

```json
{
  "id": "fullstack-feature",
  "name": "Fullstack Feature Pipeline",
  "steps": [
    { "agent": "Dispatcher" },
    { "agent": "my-architect", "providerOverride": "anthropic/claude-opus-4" },
    { "agent": "Synx Back Expert" },
    { "agent": "Synx Front Expert", "providerOverride": "openai/gpt-4o" },
    { "agent": "Synx QA Engineer" },
    { "agent": "Human Review" }
  ],
  "routing": "sequential"
}
```

Com suporte a:
- **`sequential`**: cada agente sempre passa pro próximo fixo (ignora `nextAgent` do output)
- **`dynamic`**: cada agente decide o próximo (comportamento atual)
- **`conditional`**: regras baseadas no output (`if type == "Bug" → step 3`)

---

### Phase 3 — Pipeline Executor

Novo worker `PipelineExecutor` que:
1. Lê a definição do pipeline da task
2. Controla qual step está ativo
3. Passa o **contexto acumulado** de todos os steps anteriores para o próximo
4. Suporta rollback por step

Context passing hoje é via `inputRef` (ponteiro para arquivo anterior). A melhoria é passar um `pipelineContext` com todos os outputs anteriores compactados.

---

### Phase 4 — Provider por Step com Sintaxe Simplificada

Hoje o config de provider é um objeto grande. Adicionar shorthand:

```
"providerOverride": "anthropic/claude-opus-4-6"
"providerOverride": "openai/gpt-4o"
"providerOverride": "google/gemini-2.0-flash"
"providerOverride": "lmstudio/llama-3.1-70b"
```

E suporte a fallback chain:

```json
"providerFallbacks": ["anthropic/claude-sonnet-4-6", "openai/gpt-4o", "google/gemini-1.5-pro"]
```

---

### Phase 5 — Novos Comandos CLI

```bash
synx pipeline list                    # lista pipelines disponíveis
synx pipeline run <id> "input..."     # roda um pipeline com input direto
synx pipeline create                  # wizard interativo
synx agent list                       # lista agentes registrados
synx agent create                     # wizard para criar agente
```

---

## Estrutura de arquivos final

```
.ai-agents/
  agents/
    my-architect.json       ← agente customizado
    my-reviewer.json
  pipelines/
    fullstack-feature.json  ← pipeline customizado
    bug-fix.json
  prompts/
    my-architect.md         ← prompt do agente
    my-reviewer.md
  config/
    project.json
```

---

## Ordem de implementação

| # | Phase | O que | Por quê primeiro |
|---|-------|-------|-----------------|
| 1 | Phase 1 | `GenericAgent` + agent registry | Desbloqueia tudo o mais |
| 2 | Phase 2 | Pipeline schema + `pipelineStepSchema` no Zod | Base para executor |
| 3 | Phase 3 | `PipelineExecutor` worker | Core da feature |
| 4 | Phase 4 | Provider shorthand (`provider/model`) | UX essencial |
| 5 | Phase 5 | `synx pipeline run` command | Interface principal |
| 6 | Phase 6 | Context accumulation melhorado | Qualidade do output |
| 7 | Phase 7 | Routing condicional | Feature avançada |

---

## O que NÃO muda

- `WorkerBase`, `finishStage()`, sistema de lock
- Infraestrutura de providers existentes
- Sistema de tasks, status, histórico
- Agentes existentes (Dispatcher, Front, Back, etc.) continuam funcionando
