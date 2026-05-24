# Spec Técnica — nestapp-navigation-fix

## Visão geral da solução

Hardening defensivo nos handlers de navegação e ciclo de vida do
processo Electron, centralizado em `nest-forge/main.js`. Cada exceção
oriunda de código de usuário/lib em handlers (`setWindowOpenHandler`,
`will-navigate`, IPC de navegação, `shell.openExternal`) passa a ser
**capturada localmente** e logada via `logger.error`, sem disparar
`app.quit()`. Adiciona-se listener `render-process-gone` com decisão
de recovery por `reason`. Refatora-se `uncaughtException` global para
não terminar o app — apenas logar — preservando término apenas nos
caminhos de inicialização e `window-all-closed`.

Bump do template para versão **3.0.11** dispara rebuild automático
dos apps via `BuildService.cleanupOldVersions` (por `ctv`).

## Decisões técnicas e trade-offs

### DT-1 — `uncaughtException` deixa de chamar `app.quit()`

**Decisão:** o handler global passa a apenas registrar o erro
(`logger.error`) e retornar; o app continua rodando.

**Trade-off considerado:**
- *Alternativa A (rejeitada):* manter `app.quit()` mas adicionar
  whitelist por tipo/origem da exceção → frágil, depende de pattern
  matching em mensagens.
- *Alternativa B (rejeitada):* substituir por `dialog.showErrorBox` →
  bloqueia UX em runtime, ruim para usuário não-técnico.
- *Alternativa C (escolhida):* logar e seguir → exceções verdadeiramente
  fatais (ex: corrupção de memória) já causam crash do processo via
  Chromium independentemente; preservar o app para erros recuperáveis
  é o ganho maior.

**Justificativa pela constitution:** §3 Security não regula
`uncaughtException`; §6 (Quality) prevê logging consistente — o fix
adiciona log e remove ação destrutiva. Não há override necessário.

### DT-2 — Wrap defensivo em cada handler de navegação

**Decisão:** envolver o **corpo inteiro** dos callbacks de
`setWindowOpenHandler` e `will-navigate` em try/catch, não apenas a
linha de URL parse (como já existe).

**Trade-off:** custo desprezível (estritamente +1 try/catch por
callback); benefício é robustez total.

### DT-3 — Helper `openExternalSafe(url, context)`

**Decisão:** novo helper local em `main.js` (não exportado, não vira
módulo separado por enquanto):

```js
async function openExternalSafe(url, context) {
    try {
        await shell.openExternal(url);
    } catch (err) {
        logger.error('Falha ao abrir URL externa (contexto={}, url={}): {}',
            context, url, err && err.message ? err.message : String(err));
    }
}
```

**Razão:** `shell.openExternal` retorna `Promise<void>`. Sem `await`
+ try/catch, qualquer rejeição vira `unhandledRejection`. Centraliza
o tratamento.

**Trade-off:** poderia virar módulo (`modules/external-link.js`) com
testes próprios. Decisão: **fica local** por simplicidade — se outras
camadas precisarem (IPC, preload), promover depois.

### DT-4 — Invariante de session para popups OAuth

**Decisão:** antes de retornar `{action:'allow', overrideBrowserWindowOptions
: { webPreferences: { session, ... }}}`, validar `session` não-null:

```js
const session = globalStore.get('session');
if (!session) {
    logger.error('Sessão não disponível para popup; abrindo externamente: {}', url);
    openExternalSafe(url, 'popup-no-session');
    return { action: 'deny' };
}
```

**Trade-off:** marginalmente quebra fluxos onde `session` está
temporariamente ausente — porém, na prática, se `session` é null o
popup ia crashar de qualquer jeito. Fallback elegante.

### DT-5 — Listener `render-process-gone` com recovery

**Decisão:** registrar em `web-contents-created` para cada `contents`:

```js
contents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer crash: reason={}, exitCode={}', details.reason, details.exitCode);
    const recoverable = ['crashed', 'oom'];
    const lastRecoveryKey = 'lastRendererRecoveryAt';
    const now = Date.now();
    const lastAt = globalStore.get(lastRecoveryKey) || 0;
    if (recoverable.includes(details.reason) && (now - lastAt) > 60_000) {
        globalStore.set(lastRecoveryKey, now);
        try { contents.reload(); } catch (e) {
            logger.error('Falha ao recarregar renderer apos crash: {}', e.message);
        }
    }
});
```

**Trade-off:**
- *Sem recovery (rejeitada):* usuário fica com janela morta.
- *Recovery agressivo (rejeitada):* loop infinito em sites instáveis.
- *Recovery throttled (escolhida):* máximo 1 reload por minuto. Após
  isso, janela fica morta + log claro.

### DT-6 — Manter `isInternalNavigation` heurística

**Decisão:** **não tocar**. Mudança para `allowedHosts` é débito
separado (`nestapp-allowed-hosts-config`), registrado no completion
desta feature.

### DT-7 — Manter `did-fail-load` ausente

**Decisão:** não adicionar listener para `did-fail-load`. Causa
comum (-3 ABORTED) é o `will-navigate` preventando navegação, e isso
não é erro real — adicionar log gera ruído. Se necessário no futuro,
escopo separado.

### DT-8 — Bump de template + republicação OCI

**Decisão:** versão `3.0.11` em
`nest-forge/templates/api-overlay/template.json` + changelog entry +
republicação via `scripts/publish-template.js`. Apps existentes
rebuilt automaticamente pela mecânica de `ctv` em
`BuildService.cleanupOldVersions`.

**Trade-off:** poderia ser `3.1.0` (mudança comportamental visível).
Decisão: `3.0.11` por ser fix sem novas features; respeita semver no
contexto de templates Electron.

## Avaliação de perfil arquitetural

Foram avaliados os 8 critérios da skill `spec-create`:

| Critério | Aplica? | Justificativa |
|---|---|---|
| Modifica padrão arquitetural declarado | Não | Mantém handlers Electron existentes |
| Nova tecnologia significativa | Não | Sem novas deps |
| Substitui pattern em escopo amplo | Não | Refatora handlers locais |
| Decisão entre alternativas com trade-off | **Sim, marginal** | DT-1 (uncaughtException semantics) tem alternativas documentadas |
| Breaking change em contrato público | Não | Comportamento observável para usuário final é melhoria, não ruptura |
| Nova integração externa | Não | — |
| Nova estratégia de persistência | Não | — |
| Nova convenção replicada | **Sim, marginal** | "defensive wrap em handlers Electron" pode virar padrão para outros listeners (notification, IPC) |

**Conclusão:** dois critérios aplicam-se marginalmente. **ADR-0002
NÃO é proposto agora** — escopo do fix é tático e localizado. Se em
sessões futuras o padrão "defensive wrap" for replicado em mais lugares,
vale ADR retroativo. Registrar como observação no completion.

> Override: se você preferir formalizar via ADR agora, sinalize no
> Checkpoint 2 — a skill `adr-create` pode ser acionada antes do plano.

## Mudanças no domínio

Nenhuma. Sem entidades novas, sem schemas alterados.

## Mudanças no banco

Nenhuma. Sem migrations.

## Mudanças nos contratos

Nenhuma. Sem novos endpoints, sem mudança em request/response. Apenas
o **template** muda (versão `ctv`), o que aciona rebuild via mecânica
existente do `nest-build-app-api/BuildService`.

## Eventos

Nenhum publicado/consumido alterado.

## Integrações

Nenhuma externa nova. Apenas reuso de `electron`, `shell`, `winston`
(via `logger-manager`), `globalStore`.

## Mudanças de configuração

Nenhuma env var nova. O `template.json.version` muda para `3.0.11`;
isso é convenção de versionamento de template, não config de runtime.

## Impacto em testes

`nest-forge/` não possui suite de testes automatizada significativa
(verificado: sem `__tests__/`, sem `jest.config`, sem `vitest.config`).
A feature segue o padrão atual de **validação manual** documentada,
adicionando ao final um **script de smoke** reutilizável.

### Smoke test (manual + automatizável)

Criar `scripts/smoke-navigation.sh` na raiz do workspace
(consistente com `scripts/smoke-oci.sh` da feature pai):

- Boot `nest-build-app-api/` em background
- Cria app Slack via `POST /apps`
- Baixa AppImage
- Roda AppImage em background
- Captura PID
- Espera 10s, valida processo vivo
- Simula clique externo via `wmctrl`/`xdotool` (best effort) ou
  marca como manual
- Mata processo cleanup

Caso `xdotool` não disponível, script imprime instruções manuais.

### Verificação automatizada do código

- `node -c main.js` (parse OK)
- `npm run start:gchat` em modo dev sobe e roda sem regressão
- `node scripts/export-template.js --check` (drift OK)

## Critérios de aceitação testáveis

Mapeados 1-para-1 aos AC-N* do PRD:

| ID | Verificação |
|---|---|
| AC-N1 | `pgrep -f app-slack-com-a252` antes/30s-depois do clique → mesmo PID |
| AC-N2 | Idem para app Google Chat |
| AC-N3 | Login Google → sessão estabelecida; `~/.config/<appId>/Partitions/.../Cookies` populado |
| AC-N4 | Mock manual: `shell.openExternal = () => Promise.reject(new Error('mock'))`; clicar link; processo continua vivo; `logger.error` registrou |
| AC-N5 | `webContents.forcefullyCrashRenderer()` via devtools; logger registra; reload acontece 1x |
| AC-N6 | Link `.pdf` clicado → download em `~/Downloads`; processo vivo |
| AC-N7 | Disposition `new-window` (testar com window.open manual via devtools) → janela embutida abre |
| AC-N8 | `npm ls --depth=0` no nest-forge: sem deps novas vs commit anterior |
| AC-N9 | `du -sh <tar.zst>` antes/depois → delta ≤ +5KB |
| AC-N10 | `console.time('boot')` no início de `initializeApp`, `console.timeEnd` após `createWindow` retornar; delta vs versão atual ≤ +50ms |

## Tabela de aderência à CONSTITUTION

Princípios relevantes ao escopo (extraídos de
`nest-forge/docs/sdd/CONSTITUTION.md`):

| § | Princípio | Aderência |
|---|---|---|
| §1 Architectural | Chrome custom (BaseWindow + WebContentsView) | ✓ inalterado |
| §3 Security | contextIsolation/sandbox/webSecurity true | ✓ inalterado |
| §3 Security | IPC só via contextBridge | ✓ inalterado |
| §3 Security | Navegação externa via shell.openExternal | ✓ reforçada (helper safe) |
| §3 Security | will-navigate simétrico | ✓ inalterado |
| §3 Security | Preload intercepta apenas target=_blank | ✓ inalterado |
| §5 Forbidden | Não restaurar interceptação genérica http* | ✓ respeitado |
| §5 Forbidden | Não setar extraMetadata.name = appName | ✓ N/A |
| §6 Quality | Logger consistente (winston) | ✓ reforçada (todas exceções logadas) |
| §6 Quality | No emojis | ✓ respeitado |

## Riscos finais e mitigações

| ID | Risco | Mitigação |
|---|---|---|
| R-1 | Capturar exception mascara bug real | `logger.error` obrigatório com stack |
| R-2 | Recovery infinito de renderer | Throttle 1/min via `globalStore.lastRendererRecoveryAt` |
| R-3 | `uncaughtException` deixa app em estado corrupto | Trade-off aceito em DT-1; usuário pode fechar manualmente |
| R-4 | Republicação OCI quebra apps em produção | Mecânica de `ctv` é determinística; rollback = não bumpar versão |
| R-5 | Dev (`npm run start:gchat`) e packaged (OCI) divergem | Fix está em `main.js` raiz, fonte única; `export-template.js --check` valida sync |

## Arquivos identificados (estimativa, refinada no plano)

- `nest-forge/main.js` (modificar) — handlers + helper
- `nest-forge/templates/api-overlay/template.json` (modificar) — bump
  + changelog
- `scripts/smoke-navigation.sh` (criar) — smoke test manual/auto na
  raiz do workspace (workspace, não nest-forge)

Sem mudanças em `modules/`, `shared/`, `src/`, `locales/`.
