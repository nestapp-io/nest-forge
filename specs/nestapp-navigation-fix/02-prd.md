# PRD — nestapp-navigation-fix

## Contexto e motivação

A feature `prebuilt-electron-template-distribution` (ADR-0001, concluída
em 2026-05-24) substituiu o build-per-app por template OCI pré-empacotado
e validou, em ambiente real, os apps gerados pelo `nest-build-app-api/`. Durante a
validação (P2.4), foi observado que **apps morrem silenciosamente
quando o usuário clica em links externos** (cross-domain) em Slack
(reproduzido) e suspeita-se que em qualquer app cujo site contenha
links saindo do *root domain* configurado.

A causa-raiz suspeita é defesa frágil nos handlers de navegação de
`nest-forge/main.js`:

- `process.on('uncaughtException', () => app.quit())` global trata
  toda exceção como fatal, mesmo as recuperáveis em handlers de
  navegação.
- `setWindowOpenHandler` retorna `{action:'allow', overrideBrowserWindowOptions
  : { webPreferences: { session: globalStore.get('session') ... } }}`
  sem garantir invariante de `session` setado.
- Sem `render-process-gone` / `child-process-gone` listeners, qualquer
  crash de renderer ou helper não é diagnosticável.
- Sem try/catch em torno do `shell.openExternal`, falhas de
  `xdg-open`/handler de browser ausente derrubam o processo via
  rejection não-tratada.

O impacto direto: **UX quebrada para apps populares** que dependem de
abrir links externos (Slack, Discord, qualquer ferramenta de
colaboração). Como a feature OCI já está em produção e todos os apps
construídos por ela usam este template, o bug atinge **100% dos apps
recém-criados via `nest-build-app-api/`**.

## Objetivo

Eliminar a classe de bugs em que **uma exceção isolada em handlers de
navegação derruba o processo do app**. Após a mudança, todo clique em
link (interno, externo, download, deep link) é tratado defensivamente:
falhas são logadas e UX continua usável; o app só termina por ação
explícita do usuário ou por crash irrecuperável de renderer.

## Casos de uso

### UC-1 — Clique em link externo cross-root-domain
- **Ator:** Usuário do Slack/Discord/Chat de empresa
- **Pré-condição:** App rodando, usuário autenticado
- **Fluxo:**
  1. Usuário clica em link cujo hostname não compartilha root domain
     com `appConfig.url`
  2. App **abre o navegador padrão do SO** com a URL
  3. Janela do app permanece **aberta e usável**
- **Pós-condição:** App continua respondendo a interações; sem crash;
  sem reinício.

### UC-2 — Falha ao abrir navegador externo
- **Ator:** Sistema (xdg-open ausente / browser default não configurado /
  link com protocolo inesperado)
- **Pré-condição:** Mesmo UC-1, mas `shell.openExternal` lança ou
  rejeita
- **Fluxo:**
  1. Tentativa de `shell.openExternal` falha
  2. Falha é capturada e logada via `logger.error` com contexto (URL,
     mensagem do erro)
  3. App permanece aberto; UX não-bloqueada
- **Pós-condição:** Usuário pode tentar novamente; nenhum efeito
  destrutivo.

### UC-3 — OAuth cross-subdomain (regressão a evitar)
- **Ator:** Usuário fazendo login no Google Chat
- **Pré-condição:** Boot inicial do app, redirecionamento
  `chat.google.com` → `accounts.google.com` → callback
- **Fluxo:**
  1. `will-navigate` reconhece same-root-domain (`google.com`)
  2. Navegação acontece **dentro do contentView principal**
  3. Login completa
- **Pós-condição:** Sessão estabelecida; **comportamento idêntico ao
  atual.**

### UC-4 — Crash do processo de renderer
- **Ator:** Sistema (OOM, segfault, GPU crash)
- **Pré-condição:** App rodando, evento `render-process-gone` ocorre
- **Fluxo:**
  1. Crash detectado e logado com `details` (reason, exitCode)
  2. Decisão de recuperação por reason:
     - `crashed` / `oom` → tentar recarregar o `webContents` 1x
     - `killed` / `launch-failed` → quit gracioso
- **Pós-condição:** Usuário sabe o que aconteceu (log); recuperação
  automática quando possível.

### UC-5 — Download via clique em link
- **Ator:** Usuário clicando em link com extensão de download
  (`.pdf`, `.zip`, etc.)
- **Pré-condição:** App rodando
- **Fluxo:**
  1. `setWindowOpenHandler` detecta `isLikelyDownload`
  2. Inicia `contents.downloadURL`
  3. Notificação de progresso (já existente, via `will-download`)
- **Pós-condição:** Arquivo baixado em `~/Downloads`; app intacto.
  **Comportamento idêntico ao atual.**

### UC-6 — Popup OAuth ou `window.open` programático
- **Ator:** Usuário disparando fluxo OAuth, autenticação 2FA, ou
  qualquer `window.open` interno do app
- **Pré-condição:** App rodando
- **Fluxo:**
  1. `setWindowOpenHandler` recebe disposition que NÃO é
     `foreground-tab`/`background-tab` (ex: `new-window`)
  2. Mesmo-root-domain → permite abertura de janela popup com `session`
     herdada e `preload` correto
- **Pós-condição:** Popup abre; OAuth completa; comportamento idêntico
  ao atual.

## Regras de negócio

### RN-1 — Resiliência por padrão
Nenhum handler de navegação (`setWindowOpenHandler`, `will-navigate`,
`web-contents-created`, `will-download`, `did-fail-load`) pode causar
término do processo. Toda exceção lançada por código de usuário ou
biblioteca dentro desses handlers é **capturada, logada e tratada como
falha recuperável**.

### RN-2 — Distinção entre erro fatal e erro de navegação
`uncaughtException` continua existindo, mas:
- Erro em handler de navegação **não é fatal** (já capturado upstream).
- Erro no boot (`createSession`, `loadAppConfig`, `createWindow`)
  permanece fatal — sem app não há nada para preservar.
- Erro de renderer (`render-process-gone`) decide recuperação por
  `reason`.

### RN-3 — Invariante de session
Toda criação de janela popup via `setWindowOpenHandler` que retorne
`{action:'allow'}` DEVE garantir que `webPreferences.session` seja
non-null. Se `globalStore.get('session')` retornar undefined, o handler
deve **negar a abertura** (retornar `{action:'deny'}`) e tratar via
`shell.openExternal` ou log de erro.

### RN-4 — Heurística same-root-domain preservada
A função `isInternalNavigation` (comparação dos 2 últimos labels do
hostname) **permanece como está**. Mudar a heurística é fora de escopo
desta feature (rastreada em débito separado `allowedHosts-config`).

### RN-5 — Preload `target="_blank"`-only preservado
A interceptação em `shared/preload.js` que cobre apenas anchors com
`target="_blank"` **permanece como está**. Restaurar interceptação
genérica de `http*` é proibido (§5 da CONSTITUTION).

### RN-6 — Compatibilidade total com fluxo OCI
Após o fix:
- Template OCI republicado em versão `<bump>` (provavelmente 3.0.11).
- `nest-build-app-api/BuildService` rebuilda automaticamente apps existentes para o
  novo `ctv` na próxima requisição (`cleanupOldVersions` mantém 3
  versões).
- Dev local (`npm run start:gchat`) reflete o mesmo comportamento.

### RN-7 — Diagnóstico mínimo obrigatório
Toda exceção capturada em handler de navegação ou crash de renderer
DEVE ser logada via `logger.error` com:
- Tipo do evento (qual handler)
- URL envolvida (quando aplicável)
- Mensagem do erro
- Stack trace (quando disponível)

## Restrições

- **Linguagem/stack fixos:** JavaScript CommonJS, Electron 37.x,
  módulos atuais do `nest-forge/`.
- **Sem novas dependências:** fix usa apenas APIs já disponíveis
  (`electron`, `winston` já em uso via `logger-manager`).
- **Sem mudanças em preload:** alterações ficam em `main.js` e
  eventualmente em módulos auxiliares (`window-manager.js` se houver
  invariante de session a centralizar).
- **Asar integrity preservada:** sem mudanças em `app.asar.unpacked/`
  além do que já é feito pelo `DefaultAsarSafeCustomizer` no api.
- **Idioma:** mensagens de log em português (alinhado ao código
  existente).

## Fora de escopo

- Substituir heurística `isInternalNavigation` por `allowedHosts`
  configurável (débito separado: `nestapp-allowed-hosts-config`).
- Implementar UI para o usuário ver crashes ou erros de navegação
  (apenas log por enquanto).
- Hardening de IPC (separado).
- Hardening de notification interceptor (separado, não é navegação).
- Multi-arch / Windows / macOS — fix aterra em main.js (cross-platform
  por natureza), mas validação manual cobre apenas Linux. Win/mac
  ficam para `template-multiarch`.
- Build determinístico (`backlog-build-determinism`).
- Issue de taskbar Linux (`backlog-appimage-desktop-integration`).
- Retry com backoff em `shell.openExternal` (excessivo para o caso
  observado — log + permanecer aberto basta).

## Métricas de sucesso

### Funcionais (verificáveis pós-fix)

1. **AC-N1:** Clique em link cross-root-domain no Slack **abre browser
   externo** e **app permanece vivo** por ≥30s após o clique (medido
   via `pgrep` do PID antes/depois).
2. **AC-N2:** Clique em link cross-root-domain no Google Chat
   produz mesmo comportamento de AC-N1.
3. **AC-N3:** Login no Google Chat (OAuth `chat.google.com` →
   `accounts.google.com`) **continua funcionando** sem regressão.
4. **AC-N4:** Falha simulada em `shell.openExternal` (mock retornando
   `Promise.reject`) **NÃO** mata o app; aparece linha de erro no
   logger.
5. **AC-N5:** Crash forçado de renderer (`Ctrl+R` em devtools loop ou
   `webContents.forcefullyCrashRenderer()`) **é logado** com reason
   e tentativa de recovery (quando aplicável).
6. **AC-N6:** Download por clique (link `.pdf`) continua funcionando
   (regressão de UC-5).
7. **AC-N7:** Popup OAuth `disposition: 'new-window'` continua
   abrindo janela embutida (regressão de UC-6).

### Não-funcionais

- **AC-N8:** Sem dependências novas no `package.json` raiz.
- **AC-N9:** Sem aumento de tamanho do template OCI publicado em
  mais de +5KB (medido em `tar.zst`).
- **AC-N10:** Sem regressão no tempo de boot do app (< +50ms vs.
  versão atual, medido com `console.time` ou similar).

## Stakeholders impactados

- **Usuários finais dos apps**: ganham app que não morre ao clicar
  link.
- **`nest-build-app-api/BuildService`**: rebuild automático na próxima criação de
  app (sem ação manual).
- **`nestapp/` (cliente)**: nenhuma mudança — apenas consome
  installer já corrigido.
- **CI/CD `publish-template.yml`**: republica template OCI no merge
  do fix (tag `template/v3.0.11`).
- **Documentação:** atualizar `docs/sdd/CONSTITUTION.md` §3 (se
  houver mudança em invariantes), `nest-forge/CLAUDE.md` "Caveats"
  (sem mudança esperada — apenas reforço).

## Riscos preliminares (não-bloqueantes para o PRD; refinados na spec)

- **R-1:** Capturar exceções em handlers pode mascarar bugs reais —
  mitigado com `logger.error` obrigatório.
- **R-2:** Recovery automático de renderer pode entrar em loop —
  mitigado com contador de tentativas ≤1 por minuto.
- **R-3:** Mudança em `uncaughtException` semantics pode afetar boot
  failure detection — mitigado distinguindo erro em handler
  (recuperável) vs erro em código de inicialização (fatal).
