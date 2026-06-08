# 02 — Product Requirements Document

> O "O QUÊ" e "POR QUÊ". Sem decisões técnicas.

**Slug:** nestforge-template-version-sync
**Subprojeto:** nest-forge
**Status:** Draft
**Última revisão:** 2026-06-08

---

## Contexto e motivação

O `nest-forge` publica o template Electron como artefato OCI etiquetado por
`templates/api-overlay/template.json.version` (ex.: 3.1.0). Esse mesmo número
vira o `ctv` que o `nest-build-app-api` rastreia e usa para nomear o
instalador (`X-AppImage-Version`). Porém o app empacotado dentro do template
reporta, via `app.getVersion()` (tela "Sobre"), o `nest-forge/package.json`
version (a versão de **framework**, 3.0.0) — porque o publish não injeta a
versão do template no empacotamento.

Resultado: a tela "Sobre" do app instalado mostra um número (3.0.0) que **não
bate** com a versão que todo o resto do sistema (tag OCI, ctv, nome do
artefato, nestapp) usa (3.1.0). Isso confunde o usuário (parece que a loja
entregou uma versão antiga) e quebra a consistência de proveniência — a
versão visível ao usuário deveria ser a versão sob a qual o template foi
publicado.

## Objetivo

O app empacotado a partir de um template publicado reporta, na tela "Sobre" e
em `app.getVersion()`, a **versão do template** (a mesma da tag OCI/ctv), de
forma consistente com o resto do sistema.

## Casos de uso

### Caso 1 — Versão consistente na tela "Sobre"
- **Ator:** usuário final do app instalado.
- **Pré-condição:** template publicado na versão X (ex.: 3.1.0).
- **Fluxo:** abre o app → tela "Sobre".
- **Pós-condição:** mostra a versão X (3.1.0), igual à tag OCI / ao que o
  nestapp exibe.
- **Critério de sucesso:** "Sobre" == tag OCI == ctv == `X-AppImage-Version`.

### Caso 2 — Bump de template reflete no app
- **Ator:** mantenedor, ao bumpar `template.json.version` e republicar.
- **Fluxo:** publica o template na nova versão.
- **Critério de sucesso:** apps construídos a partir do novo template
  reportam a nova versão; sem editar `package.json` do framework.

### Caso 3 — Versão de framework permanece independente
- **Ator:** mantenedor, ao alterar o framework (sem mudar o template).
- **Critério de sucesso:** `nest-forge/package.json.version` continua sendo a
  versão de framework, não exposta como a versão do app publicado.

## Regras de negócio

- A versão **visível ao usuário** do app publicado = versão do **template**
  (`template.json.version`) = tag OCI/ctv.
- Os dois namespaces (template vs framework) permanecem distintos
  (CONSTITUTION §7).
- O fix não pode alterar o `app.asar` em build-time no `nest-build-app-api`
  (integridade preservada) — a versão correta tem de ser assada no publish.

## Restrições

- **Técnica:** correção no `nest-forge` (publish), não no `nest-build-app-api`.
- **Técnica:** não setar `extraMetadata.name = appName` (trap da CONSTITUTION).
- **Operacional:** só vale para templates publicados após o fix → exige
  **republicar** o template OCI.
- **Compatibilidade:** não quebrar `export-template`/`build-app` existentes.

## Fora de escopo (explícito)

- Re-etiquetar / corrigir o artefato OCI 3.1.0 já publicado (com 3.0.0 assado)
  — só novos publishes ficam corretos.
- Mudança no `nest-build-app-api` (customizer continua preservando o asar).
- Mudança no `nestapp` (já consome a versão do template via X-AppImage/GET /apps).
- Unificar/abolir o namespace de versão de framework.

## Métricas de sucesso

- Após republicar, um app instalado mostra na "Sobre" a versão do template
  (ex.: 3.1.0), não a do framework.
- `app.getVersion()` do app empacotado == `template.json.version` usado no
  publish.
- `nest-forge/package.json.version` permanece independente.

## Stakeholders impactados

- **Usuário final** — passa a ver a versão correta/consistente.
- **Mantenedor do template** — precisa republicar para efetivar; bump de
  template passa a refletir no app sem tocar no framework.
- **SDD** — `07-operations.md`/`08-glossary.md` (publish/versão) atualizadas
  na Fase 6.

## Itens a definir antes da spec

- [ ] Confirmar que o electron-builder respeita `extraMetadata.version` no
  fluxo de publish (validar empiricamente).
- [ ] Como validar sem necessariamente publicar no GHCR (build local +
  inspeção de `app.getVersion()`/`package.json` do empacotado).

---

> **Checkpoint 1:** requer aprovação explícita antes da spec técnica.
