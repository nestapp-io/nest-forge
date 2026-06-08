# 03 — Specification (Spec Técnica)

> "COMO" — decisões técnicas.

**Slug:** nestforge-template-version-sync
**Subprojeto:** nest-forge
**Status:** Approved
**Última revisão:** 2026-06-08
**Decisão arquitetural registrada em:** N/A — sem ADR novo; doc na SDD + nota no ADR-0001 (Checkpoint 2)

---

## Visão geral da solução

Fazer o `scripts/publish-template.js` injetar a **versão do template**
(`template.json.version`, já em escopo como `version`) no empacotamento do
electron-builder, em dois campos de `extraMetadata`: `version` (para
`app.getVersion()` / linha "versao") e `nestApp.{name,version}` (para a linha
"Empacotado pelo nestapp-template"). Assim o app publicado via OCI reporta a
mesma versão da tag OCI/ctv, eliminando a divergência com o `package.json` de
framework (3.0.0). Sem mexer em `package.json.version` (namespace de framework
preservado, CONSTITUTION §7) nem no `nest-build-app-api` (asar intacto).

## Decisões técnicas e trade-offs

### Decisão 1 — `extraMetadata.version` = versão do template
- **O que:** em `writePublishConfig`, adicionar `version: <templateVersion>`
  ao `extraMetadata`. O electron-builder usa esse valor para
  `app.getVersion()` (em vez do `package.json` = 3.0.0).
- **Por quê:** a versão visível do app deve ser a do template (= tag OCI/ctv).
  Espelha o que `build-app.js` já faz no fluxo multi-app
  (`extraMetadata.version = <app version>`).
- **Trade-off:** nenhum relevante; alinha o publish ao padrão do build-app.
- **Padrão seguido:** `build-app.js` injeta `extraMetadata.version` (CLAUDE.md
  "App-level version vs. packager version").
- **Override de constitution:** Não (mantém os dois namespaces; só decide qual
  o app publicado reporta).
- **Breaking change:** Não (só novos publishes; artefatos antigos inalterados).

### Decisão 2 — `extraMetadata.nestApp` = { name, version } do template
- **O que:** adicionar `nestApp: { name: 'nestapp-template', version:
  <templateVersion> }` ao `extraMetadata`.
- **Por quê:** a linha "Empacotado pelo nestapp-template Y" do About é lida de
  `extraMetadata.nestApp.version` por `app-info.js` (prefere
  `rootPkg.nestApp.{name,version}`). Sem isso, cai no `package.json` (3.0.0).
- **Trade-off:** nenhum; completa o fix (senão "versao" corrige mas "Empacotado
  por" continua 3.0.0).
- **Padrão seguido:** `build-app.js` usa `extraMetadata.nestApp` para o
  "Packaged by" string.
- **Override de constitution:** Não.
- **Breaking change:** Não.

### Decisão 3 — Propagar `version` por `runElectronBuilderDir`
- **O que:** `runElectronBuilderDir(platform, arch)` →
  `runElectronBuilderDir(platform, arch, version)`; passa `version` a
  `writePublishConfig(ociMainRelative, version)`. O `version` já existe no
  `run()` (`const version = args.version || tplInfo.version`).
- **Por quê:** `writePublishConfig` precisa da versão; hoje não a recebe.
- **Override de constitution:** Não.

### Decisão 4 — NÃO tocar `extraMetadata.name`
- **O que:** manter `name: 'nestapp-template'` como está; não setar
  `name = appName`.
- **Por quê:** o nome do app é definido em runtime via `app.setName()`
  (ADR-0001, prebuilt template); o trap do CLAUDE.md (`name=appName` quebra
  userData) é do `build-app.js`, não se aplica aqui. Mexer em `name` é fora de
  escopo e arriscado.
- **Override de constitution:** Não (respeita §5 forbidden).

## Mudanças no domínio

Nenhuma.

## Mudanças no banco

Nenhuma (sem banco).

## Mudanças nos contratos

Nenhum contrato HTTP/IPC. Muda apenas o metadata embutido no artefato OCI
publicado (`app.getVersion()` e `nestApp` do app empacotado).

## Eventos

Nenhum.

## Integrações externas

O artefato OCI publicado em `ghcr.io/nestapp-io/nestapp-template` passa a ter
a versão correta assada. Consumido por `nest-build-app-api/runOciBuild`
(inalterado). **Efeito só após republicar** o template.

## Mudanças de configuração

`.electron-builder-publish.json` (gerado por `writePublishConfig`) passa a
incluir `extraMetadata.version` e `extraMetadata.nestApp`. Sem env nova.

## Impacto em testes

- Cobertura de testes do nest-forge: scripts sem testes automatizados;
  validação manual (CONSTITUTION §2 "teste manual").
- **Validação (sem publicar no GHCR):** rodar `node scripts/publish-template.js
  --dry-run` (ou só o passo electron-builder `--dir`) e inspecionar o
  `dist/{platform}-unpacked` → ler `resources/app.asar` → `package.json`
  `version` (ou rodar o binário e checar `app.getVersion()`). Confirmar ==
  `template.json.version`.
- Confirmar empiricamente que o electron-builder respeita
  `extraMetadata.version`/`nestApp` no fluxo `--config .electron-builder-publish.json`.

## Critérios de aceitação testáveis

- [ ] `writePublishConfig` inclui `extraMetadata.version = version` e
      `extraMetadata.nestApp = { name: 'nestapp-template', version }`.
- [ ] `runElectronBuilderDir` recebe/propaga `version`.
- [ ] `extraMetadata.name` inalterado (`nestapp-template`).
- [ ] Build local (`--dir`) → `app.asar/package.json.version` ==
      `template.json.version`.
- [ ] `node scripts/export-template.js --check` e `build:gchat` não quebram.
- [ ] Sem emojis; `package.json.version` (framework) inalterado.

## Riscos identificados

- **Risco:** electron-builder ignorar `extraMetadata.nestApp` (objeto
  aninhado). **Mitigação:** `build-app.js` já usa esse padrão com sucesso;
  validar no build local.
- **Risco:** efeito só após republicar (artefato 3.1.0 atual segue com 3.0.0
  assado). **Mitigação:** documentar; republicar quando for o caso (fora do
  escopo de código).
- **Risco:** mexer no publish quebrar multi-arch. **Mitigação:** `version`
  por plataforma já é o mesmo; mudança é aditiva no config.

## Itens a definir antes do plano

- [ ] Criar ADR? Ver §3a (Checkpoint 2).

## Detecção de mudança arquitetural (§3a)

- **#1 (modifica/clarifica convenção da CONSTITUTION):** sim, levemente —
  define que o app publicado reporta a versão do **template** (CONSTITUTION §7
  declara os dois namespaces; a spec decide qual é exposto no artefato).
- **#4 (decisão entre alternativas com trade-offs):** sim — injetar
  `extraMetadata.version` (escolhido) vs sincronizar `package.json.version`
  (rejeitado, D2).
- Relaciona **ADR-0001** (publicação OCI do template).
- Demais critérios: não (sem tech/camada/contrato novo).

Avaliação: ADR **opcional**. Por ser correção de proveniência num fluxo já
coberto pelo ADR-0001, recomendo **documentar na SDD + nota no ADR-0001** em
vez de ADR novo; mas fica a critério no Checkpoint 2.

---

> **Checkpoint 2:** requer aprovação explícita antes do plano.
