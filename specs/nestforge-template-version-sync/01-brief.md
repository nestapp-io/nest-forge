# 01 — Brief

**Slug:** nestforge-template-version-sync
**Subprojeto:** nest-forge
**Tipo:** Correção de bug (provenância de versão)
**Data:** 2026-06-08

---

## Brief literal do dev

A tela "Sobre" do app gerado mostra **versão 3.0.0** ("Empacotado pelo
nestapp-template 3.0.0") enquanto a tag OCI publicada e o `ctv` que o
`nest-build-app-api` rastreia são **3.1.0**.

**Causa raiz (confirmada no código):** `scripts/publish-template.js`,
`writePublishConfig` (~linha 96), monta
`extraMetadata: { main: ociMainRelative, name: 'nestapp-template' }` **sem**
`version`. Sem injetar `version`, o electron-builder usa o
`nest-forge/package.json.version` (3.0.0) para `app.getVersion()`. A tag OCI
vem de `templates/api-overlay/template.json.version` (3.1.0, já lido no
script ~linha 57). O `nest-build-app-api` NÃO corrige depois: o
`DefaultAsarSafeCustomizer` preserva a integridade do `app.asar` (nunca
modifica).

**Contexto da CONSTITUTION (§7):** dois namespaces de versão são declarados
de propósito — `template.json.version` (template) vs `package.json.version`
(framework, 3.0.0 atual). Esta correção decide que o **app publicado** deve
reportar a **versão do template**, mantendo `package.json.version` como
versão de framework separada.

## Fix proposto

Em `writePublishConfig` injetar `extraMetadata.version = json.version` (a
versão do template). Assim o app assa a mesma versão da tag OCI; a tela
"Sobre"/`app.getVersion()` passam a casar com `ctv`/tag/`X-AppImage-Version`.

## Ressalvas

- Só vale para templates publicados DEPOIS do fix → exige **republicar** o
  template OCI (rebuild + push para `ghcr.io/nestapp-io/nestapp-template`).
- Validar que o electron-builder respeita `extraMetadata.version` no fluxo de
  publish.
- NÃO setar `extraMetadata.name = appName` (trap da CONSTITUTION §5/§ build-app)
  — aqui mexemos só em `version`, em `publish-template.js`, não em build-app.
- Sem emojis; não quebrar `export-template`/`build-app`; validação por
  inspeção de `app.getVersion()`/`package.json` do `app.asar` após build.
- Vai em branch própria + PR no `nest-forge`.
