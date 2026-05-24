# Self-Assessment — nest-forge/

## Confiança por seção

| Arquivo | Confiança | Justificativa |
|---|---|---|
| 00-overview.md | Alta | Estrutura derivada de package.json + nest-forge/CLAUDE.md + índice |
| 01-architecture.md | Alta | CLAUDE.md é extremamente detalhado; mapeamento de módulos copiado dele |
| 02-domain.md | Média | Shape de Notification/Settings inferido de descrição, não de schema; sem código fonte de stores lido |
| 03-contracts.md | Média | Canais IPC inferidos de descrições no CLAUDE.md; nomes exatos dos métodos expostos por preloads NÃO lidos |
| 04-data.md | Média | Caminhos derivados de CLAUDE.md; estrutura JSON inferida; rotação de logs `[A CONFIRMAR]` |
| 05-integrations.md | Alta | Integrações OS/Electron descritas no CLAUDE.md; export-template.js documentado |
| 06-quality.md | Alta | Ausência de testes/lint confirmada por package.json |
| 07-operations.md | Alta | Scripts npm e installAppImage descritos linha-a-linha no CLAUDE.md |
| 08-glossary.md | Alta | Termos com origem em CLAUDE.md + changelogs |
| CONSTITUTION.md | Alta | Cada item com evidência em CLAUDE.md/changelog/config |

## Pontos cegos

- **Nenhum arquivo de `modules/*.js` foi lido linha-a-linha.** Toda a
  descrição vem de `nest-forge/CLAUDE.md`. Comportamento real (assinaturas
  exatas de IPC, ordem de listeners, edge cases) não verificado.

- **`shared/preload.js` não foi lido.** APIs expostas via
  `contextBridge` listadas apenas o `openExternal`. Outras podem existir.

- **`apps/gchat/src/main.js` (gerado)** não foi inspecionado — mas é
  derivado de `main.js` raiz, que também não foi lido.

- **`scripts/build-app.js` não foi lido.** Conteúdo do
  `.electron-builder-config.generated.json` descrito apenas por
  CLAUDE.md.

- **`scripts/export-template.js` não foi lido.** `PATH_REWRITES` exato
  não verificado.

- **`scripts/sync-app-entry.js` não foi lido.** Algoritmo de substituição
  de placeholders descrito apenas por CLAUDE.md.

- **`electron-builder-config.json` não foi lido.** Plataformas exatas
  (Linux, Windows, macOS sections) não verificadas.

- **Schema real de `notifications.json`** — inferido apenas, não há
  TypeScript/Zod schema.

- **CI/CD** — sem `.github/workflows/` em `nest-forge/`. Não há gating
  automatizado para `export-template.js --check`.

- **Convenções de versionamento de template vs framework vs app:** três
  channels distintos (`templates/api-overlay/template.json.version`,
  `package.json.version`, `apps/{appName}/package.json.version`). Regra
  semver descrita mas não enforced.

## Amostragem aplicada

| Categoria | Total | Analisados | Critério |
|---|---|---|---|
| manifest | 2 | 2 | `package.json` raiz + `apps/gchat/package.json` lidos integralmente |
| doc | 1 | 1 | README.md no índice — mas o CLAUDE.md é a doc principal e foi lido integralmente |
| config | 0 | — | Nenhum config classificado como tal; `electron-builder-config.json` ficou em `other` |
| other | 58 | 2 (apps/gchat/config.json, templates/api-overlay/template.json) | Amostragem direcionada às configs do app exemplo |

> **Esta SDD depende fortemente de `nest-forge/CLAUDE.md`.** Se o CLAUDE.md
> drift do código real, a SDD herda o drift. Auditoria periódica
> comparando CLAUDE.md ↔ código é recomendada.

## Inferências vs Fatos

| Afirmação | Tipo | Evidência |
|---|---|---|
| Electron ^37.2.4 + electron-builder ^26.0.12 | **Fato** | package.json:17-18 |
| Multi-app: codebase compartilhado + per-app configs | **Fato** | Estrutura de apps/gchat + scripts npm |
| Boot sequence (singleInstance → whenReady → createSession → ... → createWindow) | **Inferência forte** | CLAUDE.md descreve; main.js não lido |
| `extraMetadata.name` trap | **Inferência forte** | CLAUDE.md documenta cenário e razão; `build-app.js` não verificado |
| IPC channels listados (settings:*, notifications:*, about:*) | **Inferência forte** | CLAUDE.md descreve módulos; `register*Ipc` não inspecionados |
| `safeReplaceFile` evita `ETXTBSY` | **Inferência forte** | CLAUDE.md explica; `installAppImage.js` não lido |
| Same-root-domain heuristic falha em compound TLDs | **Fato** | Algoritmo de "últimos dois labels" descrito em CLAUDE.md |
| Notification interceptor re-injection guarded | **Inferência forte** | CLAUDE.md explica `__nestappNotifPatched` |
| `triggerNotificationClick` cascata de fallbacks | **Fato** | Cada versão do template (3.0.0-3.0.5) documenta uma adição em template.json changelog |
| Logger rotation/retention via Settings UI v3.0.0+ | **Inferência forte** | template.json v3.0.0 changelog menciona |

## Perguntas para o time

1. **Auditoria CLAUDE.md ↔ código:** Quando foi a última vez que
   CLAUDE.md foi conferido linha-a-linha contra o código? Vale rodar
   um diff entre módulos lidos pela skill e o que está descrito.

2. **`shared/preload.js` API surface:** Além de `openExternal`, que
   outras APIs estão expostas via `contextBridge`?

3. **Schema de notifications.json:** Vale formalizar com JSON Schema/
   TypeScript? Mudanças hoje podem corromper notifs antigos.

4. **CI gating:** Quando entra um workflow rodando
   `node scripts/export-template.js --check` em PRs que tocam
   `modules/`/`shared/`/`src/`?

5. **Compound TLD:** Há roadmap para introduzir `allowedHosts` em
   `config.json` antes de onboarding de app `.com.br`/`.co.uk`?

6. **Logger rotation:** Caminho exato dos logs, retenção em dias e
   tamanho em MB são configuráveis. Quais defaults atuais?

7. **Auto-update:** Considerado e descartado, ou só não priorizado?
   electron-updater está pronto para integrar.

8. **Per-app `productName` com espaços** (ex: "Google Chat") — como o
   `installAppImage.js` lida? `~/apps/Google Chat/` funciona mas pode
   confundir scripts. Usar slug?

9. **Snap vs AppImage:** Quais distros estão recebendo Snap? Tem CI/CD
   para snap store?

10. **Adicionar idioma:** É só plopar `locales/{lang}.json`? Ou requer
    registro em `language-manager.js`?

11. **Apps com OAuth de subdomínio cruzado** (não Google): mesmo
    same-root-domain serve, ou precisa lista explícita?

12. **`extraMetadata.nestApp.version` vs `package.json.version`:** Por
    que dois canais? Há cenário onde diferem?

## Watch out (para agents Copilot/Cursor)

- **NUNCA editar `apps/{appName}/src/main.js`** — é gerado. Editar
  `main.js` raiz.
- **NUNCA setar `extraMetadata.name`** em build-app.js — quebra
  userData path.
- **`nest-build-app-api/templates/electron-base/` é derivado** — editar
  `nest-forge/` e rodar `node scripts/export-template.js`.
- **Preload `target="_blank"` only** — não generalizar.
- **`will-navigate` same-root-domain** — não substituir por exact-match.
- **`safeReplaceFile`** em installAppImage — não substituir por copy
  direto.
- **Notification interceptor IDEMPOTENTE** — `__nestappNotifPatched`
  guard preservar.
- **`triggerNotificationClick` cascata** — não simplificar; cada nível
  resolve um caso específico (ver template.json changelog).
- **`config.json.permissions` default `false`** quando não declarado.
- **i18n: usar `t(key)`** — não hardcoded strings em UI.
- **CommonJS** — não migrar para ESM sem ADR.
- **Bump `templates/api-overlay/template.json.version` ANTES de
  `export-template.js`**, com changelog entry.
