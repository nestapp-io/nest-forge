# Brief — nestapp-navigation-fix

## Tipo de mudança

Correção de bug (regressão de UX observada em produção/validação real).

## Descrição original (literal do dev)

> "Slack morre ao clicar em links — `setWindowOpenHandler` /
> `will-navigate` heuristic precisa revisão."

Detalhamento adicional (sessão de validação P2.4 da feature
`prebuilt-electron-template-distribution`, 2026-05-24):

- App Slack gerado via fluxo OCI (`/tmp/app-slack-com-a252.AppImage --no-sandbox`)
- Ao clicar em **qualquer link que aponte para domínio fora do same-root**
  de `app.slack.com`, o processo termina silenciosamente (sem janela
  visível de erro, sem stack trace no terminal)
- Comportamento similar suspeitado no Google Chat ao clicar links
  externos (a confirmar)
- Apps de produtividade que dependem de OAuth cross-domain (Google,
  Microsoft) **não foram afetados** porque o `will-navigate` permite
  same-root-domain (`google.com` ↔ `accounts.google.com`)

## Subprojeto afetado

`nest-forge/` — fonte única de verdade do template Electron. O fix
precisa:

1. Aterrar em `nest-forge/main.js` (handlers de `setWindowOpenHandler`,
   `will-navigate`, `uncaughtException`)
2. Bump em `nest-forge/templates/api-overlay/template.json` (próxima
   versão, ex: 3.0.11)
3. Republicar OCI artifact via `nest-forge/scripts/publish-template.js`
4. Apps existentes serem rebuilt pelo `nest-build-app-api/` automaticamente (cleanup
   por `(appId, target, ctv)`)

## Hipóteses iniciais (a validar na fase de spec)

1. **`uncaughtException` handler global mata o app** (`main.js:45-48`).
   Qualquer exception em `setWindowOpenHandler`/`will-navigate`/
   `shell.openExternal` dispara `app.quit()` sem diagnóstico.
2. **`setWindowOpenHandler` `{action:'allow'}` com `webPreferences.session:
   globalStore.get('session')` undefined** (linhas 211-221) — Electron
   pode crashar fatal se `session` não estiver setado.
3. **`shell.openExternal` falha em ambiente AppImage standalone** sem
   handler de browser default configurado no DE Linux.
4. **Loop de redirect** `will-navigate` → `shell.openExternal` → o
   sistema reabre no próprio Electron via xdg-open → re-entra
   `will-navigate` → exceção?

## Reprodução conhecida

```bash
# 1. Garantir que o app Slack está construído via fluxo OCI:
curl -X POST http://localhost:8080/apps \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '{"name":"Slack","url":"https://app.slack.com"}'

# 2. Baixar AppImage gerado (ver appbuilder.db / API)
# 3. Rodar:
chmod +x /tmp/app-slack-com-a252.AppImage
/tmp/app-slack-com-a252.AppImage --no-sandbox

# 4. Logar no Slack
# 5. Clicar em qualquer link externo (ex: link compartilhado em mensagem)
# 6. Processo termina silenciosamente
```

## Critério de sucesso (alto-nível, refinado no PRD)

- Cliques em links externos (cross-domain) abrem o navegador padrão do
  SO **sem** matar o app Slack/Chat/etc.
- Eventual exceção em handler de navegação **NÃO** dispara `app.quit()`;
  é apenas logada via `logger.error`.
- Comportamento legacy de OAuth cross-subdomain continua intacto
  (Google login `chat.google.com` ↔ `accounts.google.com`).
- Apps gerados via OCI (`nest-build-app-api/` flow) e apps de dev local
  (`npm run start:gchat`) ficam alinhados.

## Referências

- `specs/prebuilt-electron-template-distribution/06-completion.md` —
  feature pai que introduziu o fluxo OCI
- `docs/sdd/CONSTITUTION.md` §3 (Security Rules: navegação externa)
- `nest-forge/CLAUDE.md` "Caveats" — heurística same-root-domain
- Backlog memory: `backlog_nestapp_navigation_fix.md`
