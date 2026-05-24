# Plano de Execução — nestapp-navigation-fix

## Resumo

- **Total de tasks:** 9 (1 P0, 5 P1, 3 P2)
- **Tempo estimado:** ~3h30 (210 min)
- **Arquivos a modificar:** 2 (`nest-forge/main.js`, `nest-forge/templates/api-overlay/template.json`)
- **Arquivos a criar:** 1 (`scripts/smoke-navigation.sh`)
- **Skills auxiliares envolvidas:** nenhuma específica (sem Java/JUnit; JS sem suite formal)
- **Riscos identificados:**
  - Republicação OCI requer `GHCR_PAT` no env do dev/CI (manual)
  - Smoke test depende de Docker rodando + nest-build-app-api/ acessível
  - Validação de AC-N3 (OAuth Google) requer conta Google ativa do dev

## Ordem de execução

```
P0.1 ────────────────────────────────────┐
                                         │
P1.1 (helper) ──┬──> P1.3 (set-open)     │ (independente — bump
                ├──> P1.4 (will-nav)     │  pode acontecer ao
                │                        │  final, mas listado
P1.2 (uncaught) │                        │  como P0 por ser
P1.5 (renderer) │                        │  pré-requisito pra
                │                        │  publish OCI)
                ▼                        ▼
                P2.1 (smoke) ──> P2.2 (validate ACs) ──> P2.3 (publish OCI)
```

P0.1 é independente do código mas precisa estar pronto antes da
publicação OCI (P2.3). Pode ser feito em qualquer momento; convenção é
fazer cedo para evitar esquecer.

---

## P0 — Bloqueante

### P0.1 — Bump template version para 3.0.11

- **Tipo:** modify
- **Arquivos:** `nest-forge/templates/api-overlay/template.json`
- **Depende de:** —
- **Estimativa:** 5 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:** atualizar campo `version` de `"3.0.10"` para
  `"3.0.11"` e adicionar nova entrada em `changelog[]` com `date:
  "2026-05-24"`, `version: "3.0.11"`, `notes` descrevendo o hardening
  (resiliência a exceptions em handlers de navegação + recovery de
  renderer crash + helper openExternalSafe).
- **Segurança:** N/A (apenas metadado).
- **Boas práticas aplicadas:** SemVer — patch bump (fix sem novo
  comportamento exposto).
- **Design pattern:** N/A.
- **Critério de conclusão:** `jq '.version' nest-forge/templates/api-overlay/template.json`
  retorna `"3.0.11"`; novo changelog entry presente.
- **Testes da task:** `node -e "JSON.parse(fs.readFileSync('nest-forge/templates/api-overlay/template.json'))"` parseia OK.

---

## P1 — Core

### P1.1 — Adicionar helper `openExternalSafe` em main.js

- **Tipo:** modify
- **Arquivos:** `nest-forge/main.js`
- **Depende de:** —
- **Estimativa:** 15 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:** adicionar função local `async function
  openExternalSafe(url, context)` antes do bloco
  `app.on('web-contents-created', ...)`. Implementação conforme DT-3
  da spec. Função NÃO exportada, NÃO promovida a módulo.
- **Segurança:** valida `url` é string não-vazia antes de chamar
  `shell.openExternal`; nunca propaga rejection.
- **Boas práticas aplicadas:** SRP (uma responsabilidade: abrir link
  externo seguro), error containment.
- **Design pattern:** N/A.
- **Critério de conclusão:** função declarada com try/catch
  obrigatório, await em `shell.openExternal`, `logger.error` em
  catch path.
- **Testes da task:** `node -c nest-forge/main.js` (parse OK).

### P1.2 — Refatorar handler `uncaughtException` (DT-1)

- **Tipo:** modify
- **Arquivos:** `nest-forge/main.js`
- **Depende de:** —
- **Estimativa:** 10 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:** alterar `process.on('uncaughtException', ...)`
  (atualmente em `main.js:45-48`) para apenas chamar `logger.error`
  com mensagem + stack; **remover** `app.quit()`. Adicionar comentário
  curto explicando "Why" (uma linha apenas, justificando a remoção).
- **Segurança:** logs sem vazar conteúdo sensível (erro original
  pode conter URLs; mas é fluxo interno de log).
- **Boas práticas aplicadas:** error containment, observabilidade.
- **Design pattern:** N/A.
- **Critério de conclusão:** handler não chama mais `app.quit()`;
  log inclui `error.message` e `error.stack`.
- **Testes da task:** `node -c nest-forge/main.js` (parse OK); revisar
  diff manualmente.

### P1.3 — Hardening do `setWindowOpenHandler` (DT-2 + DT-4)

- **Tipo:** modify
- **Arquivos:** `nest-forge/main.js`
- **Depende de:** P1.1 (usa `openExternalSafe`)
- **Estimativa:** 25 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:**
  1. Envolver callback inteiro de `contents.setWindowOpenHandler` em
     try/catch externo.
  2. Em catch, logar e retornar `{ action: 'deny' }` (resposta segura).
  3. Adicionar invariante de session conforme DT-4 antes do retorno
     `{ action: 'allow' }`: se `globalStore.get('session')` é null,
     chamar `openExternalSafe(url, 'popup-no-session')` e retornar
     `{ action: 'deny' }`.
  4. Substituir chamadas diretas a `shell.openExternal(url)` no
     branch externo pelo helper `openExternalSafe(url, 'popup-external')`.
  5. Para `mailto:`/`tel:` no branch de protocolo não-http, usar
     `openExternalSafe(url, 'popup-protocol')`.
- **Segurança:** invariante de session protege contra crash em
  Electron quando session é undefined; try/catch externo garante que
  exceção em URL parse exótica não derruba o app.
- **Boas práticas aplicadas:** defense-in-depth, fail-safe defaults,
  SRP.
- **Design pattern:** Null Object para session ausente (fallback
  comportamental).
- **Critério de conclusão:** callback envolto em try/catch; gating
  de session presente; helper usado em 3 lugares do callback.
- **Testes da task:** boot dev `npm run start:gchat`; abrir devtools
  manualmente e disparar `window.open('https://example.com', '_blank')`
  — browser externo abre; app vivo.

### P1.4 — Hardening do `will-navigate` (DT-2)

- **Tipo:** modify
- **Arquivos:** `nest-forge/main.js`
- **Depende de:** P1.1 (usa `openExternalSafe`)
- **Estimativa:** 15 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:**
  1. Envolver callback inteiro de `contents.on('will-navigate', ...)`
     em try/catch externo (atualmente em `main.js:231-249`).
  2. Em catch, logar e fazer **early return** (sem prevent default —
     deixa Electron decidir).
  3. Substituir `shell.openExternal(url)` no branch externo pelo helper
     `openExternalSafe(url, 'will-navigate-external')`.
- **Segurança:** mesmo motivo de P1.3 — contém exceções.
- **Boas práticas aplicadas:** defense-in-depth, error containment.
- **Design pattern:** N/A.
- **Critério de conclusão:** callback envolto em try/catch externo;
  helper usado.
- **Testes da task:** mesmo cenário de P1.3 — link cross-domain abre
  no browser externo, app vivo.

### P1.5 — Listener `render-process-gone` com recovery throttled (DT-5)

- **Tipo:** modify
- **Arquivos:** `nest-forge/main.js`
- **Depende de:** —
- **Estimativa:** 20 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:** dentro do bloco
  `app.on('web-contents-created', (_, contents) => {...})`, adicionar
  após o `will-navigate` listener:

  ```js
  contents.on('render-process-gone', (_event, details) => {
      logger.error('Renderer crash: reason={}, exitCode={}',
          details.reason, details.exitCode);
      const RECOVERABLE = ['crashed', 'oom'];
      const KEY = 'lastRendererRecoveryAt';
      const now = Date.now();
      const lastAt = globalStore.get(KEY) || 0;
      if (RECOVERABLE.includes(details.reason) && (now - lastAt) > 60_000) {
          globalStore.set(KEY, now);
          try { contents.reload(); }
          catch (e) {
              logger.error('Falha ao recarregar renderer apos crash: {}', e.message);
          }
      }
  });
  ```
- **Segurança:** recovery não-destrutivo; throttle previne loop.
- **Boas práticas aplicadas:** circuit breaker (throttle), graceful
  degradation.
- **Design pattern:** Circuit Breaker (degenerado — janela de 60s).
- **Critério de conclusão:** listener presente; throttle implementado;
  log obrigatório.
- **Testes da task:** dev mode + devtools: `chrome://crash` provoca
  crash; logger registra; reload acontece 1x.

---

## P2 — Complementar

### P2.1 — Criar `scripts/smoke-navigation.sh` (workspace root)

- **Tipo:** create
- **Arquivos:** `scripts/smoke-navigation.sh`
- **Depende de:** P1.1, P1.2, P1.3, P1.4, P1.5 (precisa do código pronto
  para validar)
- **Estimativa:** 30 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:** script bash idempotente que:
  1. Detecta se `nest-build-app-api/` está rodando em `localhost:8080`; instrui se não.
  2. Cria app Slack via `POST /apps` com token `changeme`.
  3. Faz polling de status até `READY` (timeout 5 min).
  4. Baixa `.AppImage` para `/tmp/`.
  5. Roda AppImage em background com `--no-sandbox`, captura PID.
  6. Espera 10s, valida processo vivo (`kill -0 $PID`).
  7. Imprime instruções para teste manual de cliques (xdotool quando
     disponível; caso contrário, manual).
  8. Após confirmação do usuário (`read -p`), valida processo ainda
     vivo (AC-N1).
  9. Cleanup: `kill $PID 2>/dev/null`.
- **Segurança:** não hardcoded credentials (lê de env); valida HTTP
  status; cleanup em `trap EXIT`.
- **Boas práticas aplicadas:** fail-fast, cleanup garantido, idempotência.
- **Design pattern:** N/A.
- **Critério de conclusão:** script executável (`chmod +x`); roda sem
  erro em modo `--help`; cumpre fluxo descrito.
- **Testes da task:** `bash scripts/smoke-navigation.sh --help`; teste
  E2E real com nest-build-app-api/ ligada.

### P2.2 — Validação manual dos ACs + `export-template --check`

- **Tipo:** test
- **Arquivos:** —
- **Depende de:** P1.1, P1.2, P1.3, P1.4, P1.5, P0.1, P2.1
- **Estimativa:** 40 min
- **Skill auxiliar sugerida:** —
- **Descrição técnica:**
  1. `cd nest-forge && node scripts/export-template.js --check` →
     exit 0 (sem drift; ou drift apenas em campos esperados).
  2. Rodar `bash scripts/smoke-navigation.sh` e seguir checklist
     manual:
     - AC-N1: clicar link externo no Slack → app vivo (sim/não)
     - AC-N3: login Google Chat (testar em outro app via mesmo flow)
     - AC-N6: clicar link `.pdf` → download em `~/Downloads`
     - AC-N7: `window.open('about:blank', '_blank')` via devtools →
       janela popup
  3. Registrar resultados em `05-execution.md` durante a Fase 5.
- **Segurança:** N/A.
- **Boas práticas aplicadas:** checklist explícito, evidence-based.
- **Design pattern:** N/A.
- **Critério de conclusão:** todos ACs marcados; bloqueios documentados
  se algum falhar.
- **Testes da task:** este é o teste em si.

### P2.3 — Republicar template OCI versão 3.0.11

- **Tipo:** config (operacional)
- **Arquivos:** —
- **Depende de:** P0.1, P1.1, P1.2, P1.3, P1.4, P1.5, P2.2 (precisa
  validação completa antes de publicar)
- **Estimativa:** 20 min (depende de rede)
- **Skill auxiliar sugerida:** —
- **Descrição técnica:**
  1. Confirmar `GHCR_PAT` no env (ou usar GitHub Action via tag
     `template/v3.0.11`).
  2. Executar `node nest-forge/scripts/publish-template.js
     --version=3.0.11 --platform=linux --arch=x64`.
  3. Verificar publicação via `regctl artifact get
     ghcr.io/nestapp-io/nestapp-template:3.0.11-linux-x64 -o /tmp/check.tar`.
  4. Atualizar `nest-forge/scripts/publish-template.js`? — verificar
     se precisa bump de constante; provavelmente não (versão é arg).
- **Segurança:** `GHCR_PAT` em env local (gitignored) ou secret de
  GitHub Action; nunca commitar.
- **Boas práticas aplicadas:** secret management, validação
  pós-publicação.
- **Design pattern:** N/A.
- **Critério de conclusão:** `regctl tag ls ghcr.io/nestapp-io/nestapp-template`
  mostra `3.0.11-linux-x64`.
- **Testes da task:** smoke test contra nest-build-app-api/ recriando app — `ctv`
  3.0.11 utilizado.

---

## Verificação de constitution (todas as tasks vs princípios)

| Task | §3 Security | §5 Forbidden | §6 Quality (no emoji) | Override? |
|---|---|---|---|---|
| P0.1 | ✓ | ✓ | ✓ | — |
| P1.1 | ✓ reforça shell.openExternal | ✓ | ✓ | — |
| P1.2 | ✓ | ✓ | ✓ | — |
| P1.3 | ✓ reforça setWindowOpenHandler | ✓ | ✓ | — |
| P1.4 | ✓ reforça will-navigate | ✓ | ✓ | — |
| P1.5 | ✓ adiciona render-process-gone | ✓ | ✓ | — |
| P2.1 | ✓ | ✓ | ✓ | — |
| P2.2 | ✓ | ✓ | ✓ | — |
| P2.3 | ✓ | ✓ | ✓ | — |

Sem overrides necessários. Tudo dentro dos princípios da CONSTITUTION.

---

## Notas para execução

- **Atomicidade:** cada task deixa `node -c nest-forge/main.js` passando.
  P0.1 é metadado puro. P1.* são modificações incrementais ao
  `main.js`. P2.* não tocam código de produção.
- **Validação contínua:** após cada P1, executar `node -c
  nest-forge/main.js` antes de avançar.
- **Commit manual:** após Fase 5 concluída, sugerir mensagem de
  commit em Fase 6. Nunca commitar pelo skill.
- **Recuperação de falhas:** se P1.x falhar, parar e diagnosticar;
  nada de tasks subsequentes até resolver.
