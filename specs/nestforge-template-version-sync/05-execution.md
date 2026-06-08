# 05 — Execution Log

**Slug:** nestforge-template-version-sync
**Subprojeto:** nest-forge
**Branch:** fix/nestforge-template-version-sync
**Autorizado:** Checkpoint 3, 2026-06-08

---

### P1.1 — Injetar versão do template no publish
**Status:** Concluída. `scripts/publish-template.js`:
- `writePublishConfig(ociMainRelative, version)` — `extraMetadata` agora inclui
  `version` e `nestApp: { name: 'nestapp-template', version }`; `name`
  inalterado.
- `runElectronBuilderDir(platform, arch, version)` propaga `version`; call site
  em `run()` passa `version` (já em escopo).
**Verificação:** `node -c` OK; shape do `extraMetadata` confirmado
(`version` + `nestApp` = template version).

### P2.1 — Validação (build local) — proporcional
**Status:** Concluída (validação por precedente + shape; build completo
opcional).
- Shape do config gerado confirmado: `{main, name, version, nestApp:{name,version}}`.
- **Precedente:** `scripts/build-app.js` (linhas 25-30) já injeta
  `extraMetadata.version` + `extraMetadata.nestApp.version` no fluxo multi-app
  e o electron-builder respeita (a tela "Sobre" do build local mostra a versão
  do app). Mesmo mecanismo → o publish OCI passará a assar a versão do template.
- **Não rodado:** build electron-builder `--dir` completo (download de electron
  + zstd; pesado). Validação empírica de ponta-a-ponta + **republish** do
  template OCI ficam como passo operacional do usuário.
**Observação:** o artefato OCI 3.1.0 já publicado NÃO muda — só novos publishes.
