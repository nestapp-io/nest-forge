# /specs — Specifications de features (nest-forge/)

Esta pasta abriga **specs de features** geradas pela skill par
`spec-create` quando o desenvolvedor descreve nova feature ou mudança no
`nest-forge/`.

## Convenção

```
specs/
└── <feature-name>/
    ├── spec.md
    ├── design.md
    ├── tasks.md
    └── evidence/
```

## Relação com a CONSTITUTION

Specs novas no `nest-forge/` DEVEM respeitar:

- **`app.getName() === "NestApp"` sempre** — não introduzir
  `extraMetadata.name`.
- **`apps/{appName}/src/main.js` é gerado** — todas as mudanças vão em
  `main.js` raiz.
- **Sync com `nest-build-app-api/templates/electron-base/`** — após mudança em
  `modules/`/`shared/`/`src/`/`locales/`/`main.js`/`templates/api-overlay/`,
  rodar `node scripts/export-template.js` e bumpar
  `templates/api-overlay/template.json.version` + changelog.
- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`** — não relaxar.
- **IPC só via `contextBridge` em preloads.**
- **Per-app session isolada** (`persist:{appName}`).
- **Preload intercepta APENAS `target="_blank"`** — não generalizar.
- **`will-navigate` same-root-domain** — não trocar por exact-match.
- **CommonJS** — não migrar para ESM sem ADR.
- **Sem emojis.**
- **i18n via `t(key)`.**
- **Logger via winston** — não `console.log`.

## Workflow recomendado

1. Spec descreve o que quer adicionar (ex: "tela de Settings sub-menu
   de proxies por app").
2. Design lista módulos afetados (window-manager? settings-store?
   IPC novo?).
3. **Identifica se o template api-overlay precisa sync** — se a feature
   for puramente framework (multi-app), `templates/api-overlay/` pode
   manter o comportamento single-app específico.
4. Bump em `templates/api-overlay/template.json` antes do export.
5. CI roda `--check`.

Esta pasta é versionada.
