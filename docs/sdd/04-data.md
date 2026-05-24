# 04 — Data

## Bancos de dados

Nenhum. nest-forge não usa SGBD. Persistência é JSON local + sessão
Electron isolada por app.

## Locais de dados

Todos relativos a `~/.config/NestApp/` (porque `app.getName() === "NestApp"`):

| Caminho | Conteúdo | Módulo responsável |
|---|---|---|
| `~/.config/NestApp/corebox/{appName}/notifications.json` | Notificações persistidas (array de objetos) | `notification-store.js` |
| `~/.config/NestApp/Partitions/{appName}/` | Sessão Electron isolada (cookies, storage, IndexedDB, extensões) | `session-manager.js` |
| `~/.config/NestApp/Settings/...` (JSON) | Settings (proxy, language, keep-active, logger) | `settings-store.js` |
| `~/.config/NestApp/logs/` ou `userData/logs/` | Logs winston | `logger-manager.js` ([A CONFIRMAR] caminho exato) |

## Modelo lógico (JSON shape)

### `notifications.json`

```json
[
  {
    "tag": "string",
    "title": "string",
    "body": "string",
    "timestamp": 1234567890,
    "read": false,
    "pinned": false,
    "url": "https://..."
  }
]
```

> Schema explícito não está em código fonte lido — inferido do uso
> descrito em nest-forge/CLAUDE.md "Notification flow" e changelog
> template.json v3.0.2 (url extraída de `options.data.url`).

### Settings store

Estrutura key-value. Chaves conhecidas:

- `proxy` — `{ mode, host, port, ... }` (passado a `applyProxy`)
- `language` — código de locale (ex: `pt-BR`)
- `keepActive` — boolean opt-in
- `logger.enabled` — boolean
- Possíveis: `extensions`, ... [A CONFIRMAR]

## Padrões de persistência

- **JSON files** com leitura/escrita síncrona simples (módulos
  store-*.js). Sem ORM, sem transações.
- **Sessão Electron** persistida automaticamente em `Partitions/{appName}/`.
- **`extraMetadata.version`** injetado pelo build-app.js — não é
  persistência mas é dado durável no AppImage/.exe empacotado.

## Migrations / versionamento de dados

Nenhuma estratégia formal. Mudanças de schema de `notifications.json`
ou settings dependem de coerção/default em código quando ler.

## Volumes e crescimento

- **Notifications** crescem indefinidamente até user limpar manualmente
  via janela de notificações.
- **Logs winston** [A CONFIRMAR] tem rotação/retenção configurada em
  v3.0.0+ (changelog menciona "Logs com rotacao/retencao/scopes").

## Dados sensíveis

- **Cookies de sessão** ficam em `Partitions/{appName}/` — login do
  usuário no site web. Sensível.
- **Settings** podem conter proxy auth — [A CONFIRMAR] criptografia.
- **Notifications** podem conter conteúdo de mensagens privadas
  (Google Chat, etc.) — armazenados em plaintext JSON.

> **Lembrete (CONSTITUTION.md):** não setar `extraMetadata.name = appName`
> — quebra path do userData, perde sessão e store.
