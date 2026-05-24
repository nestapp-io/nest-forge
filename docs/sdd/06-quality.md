# 06 — Quality

## Testes

[A CONFIRMAR] — não há diretório `test/` detectado no índice. Sem
dependências de teste no `package.json` (apenas runtime + electron-builder).

## Linters e static analysis

Nenhuma config detectada:
- Sem `.eslintrc*`
- Sem `.prettierrc*`
- Sem `package.json.eslintConfig`

## Convenções de código observadas

- **Sem emojis** (regra global do workspace).
- **CommonJS modules** (`require`, `module.exports`) — não ES modules.
  Evidência: `apps/gchat/package.json` sem `"type": "module"`.
- **Nomeação:**
  - Funções/variáveis: `camelCase`.
  - Arquivos: `kebab-case.js` (`window-manager.js`, `notification-store.js`).
  - Constantes: `UPPER_SNAKE_CASE` (não verificado em código lido, padrão JS).
- **Estrutura por responsabilidade:** uma pasta por feature
  (`modules/`, `shared/`, `src/`, `scripts/`, `locales/`).
- **i18n via `t(key, params)`** — não hardcoded strings em código de UI.
- **Logger via winston** (em `logger-manager.js`) — não `console.log`
  no main process (idealmente).

## Convenções de versionamento

- **Template version (`templates/api-overlay/template.json.version`)** com
  changelog estruturado.
- **App version** em `apps/{appName}/package.json.version`.
- **NestApp framework version** em root `package.json.version` (3.0.0).
- **Bump de template.json.version** dispara rebuild no `nest-build-app-api/` (gating em
  `BuildArtifact.templateVersion`).

## Pipeline de qualidade (CI)

- **CI integrity check** disponível via:
  `node scripts/export-template.js --check`
  — verifica que `nest-build-app-api/templates/electron-base/` está em sync com
  `nest-forge/`. Exit 1 em drift.
- [A CONFIRMAR] se há `.github/workflows/` configurado para chamar isso
  em PR. Não há `.github/` em `nest-forge/`.

## Pontos cegos conhecidos

- **Zero testes automatizados.** Mudanças em `window-manager.js`,
  `notification-window-manager.js` etc. dependem 100% de teste manual
  por app.
- **`will-navigate` heurística de same-root-domain** falha em compound
  TLDs (`.co.uk`, `.com.br`). Sem teste, regressão silenciosa.
- **Notification click replay** depende de DOM scan / `realClick` /
  `sendInputEvent` — frágil em mudanças do site target (especialmente
  SPAs como Google Chat).
- **`extraMetadata.name` trap** — não é guarded por teste. Confiar no
  CLAUDE.md + revisão manual.
- **Sem lint** — formatação/estilo depende do hábito do contribuidor.
- **Re-injection guards** (`__nestappNotifPatched`) — não testados.

Detalhes em [_self-assessment.md](./_self-assessment.md).
