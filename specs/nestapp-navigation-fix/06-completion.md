# Completion — nestapp-navigation-fix

**Status:** Concluída.
**Data:** 2026-05-25.
**Versão template:** 3.0.11.
**Publicado em:** `ghcr.io/nestapp-io/nestapp-template:3.0.11-linux-x64`.

## Resumo do que foi feito

Feature `nestapp-navigation-fix` aplicada com sucesso. Hardening
completo dos handlers de navegação e ciclo de vida no `nest-forge/main.js`:

- `uncaughtException` não termina mais o app (apenas logger.error)
- `setWindowOpenHandler` e `will-navigate` envoltos em try/catch
  externo com fallback seguro
- Helper `openExternalSafe(url, context)` centraliza `shell.openExternal`
  com captura de Promise rejection
- Invariante de session em popups OAuth (`{action:'allow'}` só com
  session non-null)
- Listener `render-process-gone` com recovery throttled (1 reload/60s)
  para reason `crashed`/`oom`

Validação AC-N1 confirmada em 2 execuções consecutivas (Slack via
smoke-navigation.sh + execução standalone sem logging): **app não
fecha ao clicar em link externo**.

## Arquivos da SDD a atualizar (recomendado em sessão futura)

- `nest-forge/docs/sdd/CONSTITUTION.md` §3 — adicionar princípio
  "Handlers de navegação são defensivos: try/catch externo +
  helper safe + log obrigatório"
- `nest-forge/CLAUDE.md` "Caveats" — atualizar nota sobre
  `uncaughtException` (não termina app); adicionar nota sobre helper
  `openExternalSafe`

## ADRs criados

Nenhum. Avaliação em [03-spec.md §Avaliação de perfil arquitetural]
indicou apenas 2 critérios marginais; decidiu-se não formalizar agora.
Se em sessões futuras o padrão "defensive wrap" for replicado em
outros listeners (notification IPC, settings IPC), vale ADR retroativo.

## Testes adicionados

Nenhum teste automatizado (nest-forge não tem suite formal).
Adicionado `scripts/smoke-navigation.sh` como smoke test
interativo/manual para validação E2E recorrente.

## Notas para futuras evoluções

1. **Validar ACs restantes** (AC-N2, AC-N3, AC-N5, AC-N9, AC-N10) em
   sessão dedicada. AC-N5 (renderer crash) é testável via devtools
   `chrome://crash` no app real.
2. **Multi-arch** (`backlog-template-multiarch`): quando expandir OCI
   para Win/Mac, o fluxo `local-dir` torna-se obsoleto e o
   `export-template.js` pode ser removido (atualmente conserta drift
   entre `nest-forge/` e `nest-build-app-api/templates/electron-base/`).
3. **`allowedHosts` configurável** (débito histórico): heurística
   `isInternalNavigation` por hostname-suffix funciona mas falha em
   compound TLDs (`.co.uk`, `.com.br`). Spec separada quando
   onboardar app afetado.
4. **Hardening de IPC**: o mesmo padrão "defensive wrap" pode ser
   replicado em `notification-ipc`, `settings-ipc`. Se for, vale
   ADR retroativo formalizando o padrão.

## Débitos técnicos identificados

| ID | Descrição | Prioridade |
|---|---|---|
| D-1 | `publish-template.js` usa env `REGCLIENT_AUTH` inexistente; só funciona com `regctl registry login` persistente | Média |
| D-2 | `FaviconFetcher` hardened só para `.ico`; outros formatos exóticos podem causar problemas | Baixa |
| D-3 | Smoke E2E depende de api/ local rodando — não portável para CI | Baixa |
| D-4 | `cicd/DEV.env` local ainda referencia PAT revogado e registry antigo `ghcr.io/maurigre` | Baixa (gitignored, só afeta o desktop do dev) |
| D-5 | ACs AC-N2/N3/N5/N9/N10 não validados nesta execução | Média |

## Próximos passos

Esta feature deixa pronto para commit em **2 repositórios** (mudanças
nos respectivos working trees, não-commitadas):

### nest-forge (repo público)
```
M main.js
M main.oci.js
M scripts/export-template.js
M templates/api-overlay/template.json
?? scripts/smoke-navigation.sh
M specs/nestapp-navigation-fix/{01,02,03,04}.md  (pré-existentes)
A specs/nestapp-navigation-fix/{05,06}.md  (novos)
```

### nest-build-app-api (repo privado)
```
M src/main/java/com/example/appbuilder/utils/FaviconFetcher.java
M templates/electron-base/main.js
M templates/electron-base/modules/{icon-loader,index,window-manager}.js
M templates/electron-base/template.json
?? templates/electron-base/modules/config-runtime-loader.js
```

Mensagens sugeridas em [seção abaixo].
