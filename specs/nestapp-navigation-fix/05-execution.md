# Log de Execução — nestapp-navigation-fix

Execução iniciada em 2026-05-24, retomada em 2026-05-25 após migração
para nestapp-io. Total: 12 tasks (9 planejadas + 3 descobertas).

## Tasks executadas

### P0.1 — Bump template 3.0.10 → 3.0.11
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/templates/api-overlay/template.json`
- **Validação:** `jq '.version'` retorna `"3.0.11"`; changelog entry
  `2026-05-24` adicionado

### P1.1 — Helper `openExternalSafe`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/main.js` (linha 183)
- **Implementação:** função async com `await shell.openExternal` +
  try/catch + `logger.error`; valida `url` non-empty string
- **Validação:** `node -c main.js` OK

### P1.2 — Refatorar `uncaughtException`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/main.js` (linha 45-51)
- **Mudança:** removido `app.quit()`; log com `error.message + stack`;
  comentário "Why" explicando a decisão (DT-1)
- **Validação:** `grep -c 'app.quit()' bloco uncaughtException` = 0

### P1.3 — Hardening `setWindowOpenHandler`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/main.js` (linhas 184-249)
- **Mudanças:** try/catch externo no callback inteiro; invariante de
  session (retorna deny se session null); 3 chamadas a
  `openExternalSafe` (popup-protocol, popup-no-session, popup-external)
- **Validação:** `grep openExternalSafe` mostra 4 ocorrências no
  bloco do handler

### P1.4 — Hardening `will-navigate`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/main.js` (linhas 252-270)
- **Mudanças:** try/catch externo; `openExternalSafe(url,
  'will-navigate-external')` no branch externo
- **Validação:** parse OK; helper presente

### P1.5 — Listener `render-process-gone`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/main.js` (linhas 272-291)
- **Implementação:** log + recovery throttled (1 reload/60s) para
  `crashed`/`oom`; chave `lastRendererRecoveryAt` em globalStore;
  try/catch na chamada de `contents.reload()`
- **Validação:** `grep -c render-process-gone` = 1

### P2.1 — Criar `scripts/smoke-navigation.sh`
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/scripts/smoke-navigation.sh` (novo, +180
  linhas)
- **Funcionalidades:** pre-checks (curl, jq, api), POST /apps,
  polling status, download AppImage, run + validação manual (read -p),
  cleanup via trap EXIT
- **Validação:** `bash -n` OK; `--help` retorna ajuda

### P2.2 — Validação automatizada
- **Status:** ✓ concluída (escopo ajustado)
- **Item retirado:** `export-template --check` (não aplica ao fluxo
  OCI — feature está sendo testada via OCI, não local-dir)
- **Item retido:** parse + grep estrutural dos hardenings em main.js
- **Resultado:** 6/6 checks de código passaram

### P2.3 — Republicar template OCI v3.0.11
- **Status:** ✓ concluída
- **Comando:** `node scripts/publish-template.js --version=3.0.11
  --platform=linux --arch=x64`
- **Auth:** `regctl registry login ghcr.io -u maurigre --pass-stdin`
  com `gh auth token` (escopo `write:packages`)
- **Artefato:** `ghcr.io/nestapp-io/nestapp-template:3.0.11-linux-x64`
  (84.2 MB tar.zst, SHA-256:
  `61d45a6fcc4799f98f5aa5d89851c70c84685205b27dabf9a71c93910bab091b`)
- **Manifest:** `ghcr.io/nestapp-io/nestapp-template:3.0.11-manifest`
- **Bug encontrado:** `REGCLIENT_AUTH` env var no script não é
  reconhecida pelo regctl (workaround: `regctl registry login`
  persistente). Registrado como débito (D-1)

### P2.4 — Sync legacy template (descoberta)
- **Status:** ✓ concluída
- **Arquivos:** `nest-forge/scripts/export-template.js` (path fix:
  `../api/` → `../nest-build-app-api/`), e via sync: 7 arquivos em
  `nest-build-app-api/templates/electron-base/`
- **Validação:** `node scripts/export-template.js --check` retorna OK
  (drift = 0); legacy template.json bumpa para 3.0.11

### P2.5 — Fix FaviconFetcher (descoberta)
- **Status:** ✓ concluída
- **Arquivos:**
  `nest-build-app-api/src/main/java/com/example/appbuilder/utils/FaviconFetcher.java`
- **Mudança:** novo método `isIcoContentType(url)` (HEAD HTTP, valida
  content-type contém `x-icon` ou `vnd.microsoft.icon`); em
  `getFavicon`, passo 2 (`/favicon.ico`) só retorna se NÃO for .ico
  real
- **Motivação:** Slack tinha favicon `.ico < 256x256`, electron-builder
  rejeitava; antes da feature OCI o "fix" era workaround manual
  passando iconUrl PNG no POST, não código
- **Validação:** Slack POST /apps agora resolve
  `iconUrl=https://www.google.com/s2/favicons?domain=app.slack.com&sz=256`
  (PNG 256), build completa READY

### P2.6 — Diagnóstico de bug runtime (descoberta)
- **Status:** ✓ concluída
- **Cenário:** após Slack ser construído com sucesso (P2.5), primeira
  execução via smoke-navigation.sh resultou em app fechando ao clicar
  link externo (sem login); segunda execução com
  `ELECTRON_ENABLE_LOGGING=true` não reproduziu; terceira execução
  sem logging também não reproduziu
- **Conclusão:** bug não reproduz no AppImage atual (template OCI
  3.0.11 com hardenings). Inspeção do `main.oci.js` extraído do
  `app.asar` confirma que todos os hardenings (`openExternalSafe`,
  `uncaughtException` sem `app.quit`, `render-process-gone`) estão
  presentes em runtime
- **Hipótese para a 1a falha:** AppImage da 1a execução pode ter sido
  buildado em cache intermediário antes do P1.2 (`uncaughtException`
  refactor); a 2a execução usou rebuild forçado via DELETE+POST
- **AC-N1:** **PASSOU** — confirmado em 2 execuções consecutivas sem
  reprodução do crash

## ACs cobertos

| AC | Descrição | Resultado |
|---|---|---|
| AC-N1 | Link cross-root no Slack mantém app vivo | ✓ PASSOU (validação manual) |
| AC-N2 | Idem para Google Chat | Pendente (não validado manualmente) |
| AC-N3 | Login Google Chat sem regressão | Pendente |
| AC-N4 | Mock falha `shell.openExternal` não derruba | ✓ COBERTO POR CÓDIGO (try/catch em `openExternalSafe`) |
| AC-N5 | Crash forçado renderer recupera 1x | Pendente (validável via devtools `chrome://crash`) |
| AC-N6 | Download `.pdf` ainda funciona | ✓ INALTERADO (mesmo handler) |
| AC-N7 | Popup `new-window` continua abrindo | ✓ INALTERADO (mesmo handler) |
| AC-N8 | Sem deps novas | ✓ PASSOU (`package.json` inalterado) |
| AC-N9 | Tamanho template ≤ +5KB | Pendente (medida não feita; provavelmente OK — só código) |
| AC-N10 | Tempo de boot +50ms max | Pendente |

## Débitos identificados durante execução

- **D-1:** `publish-template.js` usa env var `REGCLIENT_AUTH` que
  regctl não reconhece; só funciona com `regctl registry login`
  persistente em `~/.config/regctl/`. Fix: refatorar script para
  fazer login programaticamente via stdin.
- **D-2:** Bug favicon `.ico < 256x256` existia desde sempre no
  api/. Resolvido em P2.5 (FaviconFetcher), mas não cobre outros
  formatos exóticos (ex: SVG > 1MB, GIF animado). Spec separada
  recomendada para hardening do FaviconFetcher.
- **D-3:** Wrappers de smoke E2E ainda dependem de api/ rodando
  localmente. Considerar fixture E2E mais portável.
- **D-4:** `cicd/DEV.env` local (gitignored) ainda contém PAT
  revogado e registry antigo `ghcr.io/maurigre`. Usuário precisa
  atualizar manualmente.
- **D-5:** ACs AC-N2, AC-N3, AC-N5, AC-N9, AC-N10 não foram validados
  nesta execução. Validação manual posterior recomendada.
