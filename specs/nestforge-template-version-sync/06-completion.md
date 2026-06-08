# 06 — Completion

**Slug:** nestforge-template-version-sync
**Subprojeto:** nest-forge
**Branch:** fix/nestforge-template-version-sync
**Status:** Completed (ready to PR)
**Concluído em:** 2026-06-08

---

## Resumo

`scripts/publish-template.js` passou a injetar a versão do template
(`template.json.version`) no empacotamento OCI, em `extraMetadata.version` e
`extraMetadata.nestApp.{name,version}`. Assim o app publicado reporta na tela
"Sobre" / `app.getVersion()` a mesma versão da tag OCI/ctv, eliminando a
divergência com o `package.json` de framework (3.0.0). `package.json.version`
(framework) permanece namespace separado (CONSTITUTION §7); `extraMetadata.name`
inalterado.

## Arquivos

- `scripts/publish-template.js` (modify) — `writePublishConfig(ociMainRelative,
  version)` injeta `version`+`nestApp`; `runElectronBuilderDir(platform, arch,
  version)` propaga.

## SDD atualizada

| Arquivo | Mudança |
|---|---|
| `08-glossary.md` | `extraMetadata.version`/`nestApp` agora documentam o fluxo OCI (template.json.version) |
| `07-operations.md` | nota: no publish OCI a versão vem de template.json.version |
| `docs/adrs/0001-...md` (repo raiz) | Addendum de cross-ref (proveniência de versão) |

## ADRs

Nenhum novo (decisão Checkpoint 2 — doc na SDD + addendum no ADR-0001).

## Testes

- `node -c scripts/publish-template.js` OK.
- Shape do `extraMetadata` gerado confirmado (`version`+`nestApp`).
- Precedente `build-app.js` (linhas 25-30) prova que o electron-builder respeita
  esse mecanismo.
- **Pendente (usuário):** build electron-builder `--dir` completo + **republish**
  do template OCI para efetivar (o artefato 3.1.0 atual segue com 3.0.0 assado).

## Débitos / notas

- Republicar o template OCI para que apps novos reportem a versão correta.
- Apps já instalados (ex.: Google Chat) só refletem após reinstalar de um
  template republicado.

## Sugestão de commit

```
fix(publish): app publicado reporta a versao do template (nao a do framework)

publish-template.js injeta extraMetadata.version + nestApp = template.json.version.
Tela "Sobre"/app.getVersion() passam a casar com a tag OCI/ctv.
package.json.version (framework) segue separado; extraMetadata.name inalterado.

Refs: specs/nestforge-template-version-sync/
```

---

## Checkpoint final

- [ ] Commit na branch + PR
