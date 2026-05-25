#!/usr/bin/env bash
# smoke-navigation.sh — smoke test E2E para a feature nestapp-navigation-fix.
#
# Pre-requisitos:
#   - nest-build-app-api/ rodando em :8080 (cd ../nest-build-app-api && mvn spring-boot:run)
#   - regctl no PATH (template OCI 3.0.11 publicado em ghcr.io/nestapp-io/nestapp-template)
#   - electron-builder via npx (transitiva via nest-forge package)
#   - jq, curl
#
# Uso:
#   bash scripts/smoke-navigation.sh           # ciclo completo
#   bash scripts/smoke-navigation.sh --help    # ajuda
#
# Saida (exit codes):
#   0  ok
#   1  pre-requisitos ausentes
#   2  falha no setup (api/ nao responde, build nao completa)
#   3  app morreu apos clique externo (AC-N1 falhou)

set -u

API_URL="${API_URL:-http://localhost:8080}"
API_TOKEN="${API_TOKEN:-changeme}"
APP_NAME="${APP_NAME:-Slack}"
APP_URL="${APP_URL:-https://app.slack.com}"
TIMEOUT_BUILD="${TIMEOUT_BUILD:-300}"
WAIT_AFTER_CLICK="${WAIT_AFTER_CLICK:-15}"
WORKDIR="${WORKDIR:-/tmp/smoke-navigation}"

# === colors ===
if [ -t 1 ]; then
    R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'; B='\033[0;34m'; N='\033[0m'
else
    R=''; G=''; Y=''; B=''; N=''
fi

log()  { echo -e "${B}[smoke]${N} $*"; }
ok()   { echo -e "${G}[ ok ]${N} $*"; }
warn() { echo -e "${Y}[warn]${N} $*"; }
err()  { echo -e "${R}[err ]${N} $*" >&2; }

cleanup() {
    if [ -n "${APP_PID:-}" ] && kill -0 "$APP_PID" 2>/dev/null; then
        log "Encerrando AppImage (pid=$APP_PID)..."
        kill "$APP_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$APP_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    sed -n '2,20p' "$0"
    exit 0
fi

# === 1. Pre-checks ===
log "Etapa 1/5 — Pre-checks"
for cmd in curl jq; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "$cmd nao encontrado no PATH."
        exit 1
    fi
done
ok "curl, jq disponiveis"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/apps")
if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "200" ]; then
    err "nest-build-app-api/ nao responde em ${API_URL} (HTTP ${HTTP_CODE}). Suba via: cd ../nest-build-app-api && mvn spring-boot:run"
    exit 2
fi
ok "nest-build-app-api/ ativo em ${API_URL} (HTTP ${HTTP_CODE})"

mkdir -p "$WORKDIR"

# === 2. POST /apps ===
log "Etapa 2/5 — Criando app '${APP_NAME}' via POST /apps"
CREATE_RESP="$(curl -sS -X POST "${API_URL}/apps" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${APP_NAME}\",\"url\":\"${APP_URL}\"}")"
APP_ID="$(echo "$CREATE_RESP" | jq -r '.appId // .id // empty')"
if [ -z "$APP_ID" ]; then
    err "Resposta inesperada de POST /apps: $CREATE_RESP"
    exit 2
fi
ok "App criado: appId=${APP_ID}"

# === 3. Poll status ===
log "Etapa 3/5 — Aguardando build (timeout=${TIMEOUT_BUILD}s)"
START=$SECONDS
while true; do
    STATUS="$(curl -sS -H "Authorization: Bearer ${API_TOKEN}" \
        "${API_URL}/apps/${APP_ID}/latest-version?target=linux" \
        | jq -r '.status // "UNKNOWN"')"
    ELAPSED=$((SECONDS - START))
    case "$STATUS" in
        READY)
            ok "Build READY (${ELAPSED}s)"
            break
            ;;
        FAILED)
            err "Build FAILED apos ${ELAPSED}s"
            exit 2
            ;;
        INITIALIZING|BUILDING|UNKNOWN)
            if [ $ELAPSED -gt $TIMEOUT_BUILD ]; then
                err "Timeout esperando build (status=$STATUS apos ${ELAPSED}s)"
                exit 2
            fi
            echo -n "."
            sleep 4
            ;;
        *)
            err "Status inesperado: $STATUS"
            exit 2
            ;;
    esac
done
echo

# === 4. Download AppImage ===
APPIMAGE="${WORKDIR}/${APP_ID}.AppImage"
log "Etapa 4/5 — Baixando AppImage para ${APPIMAGE}"
curl -sS -fL -H "Authorization: Bearer ${API_TOKEN}" \
    "${API_URL}/apps/${APP_ID}/installer?target=linux" -o "$APPIMAGE"
chmod +x "$APPIMAGE"
SIZE_KB=$(du -k "$APPIMAGE" | awk '{print $1}')
if [ "$SIZE_KB" -lt 1000 ]; then
    err "AppImage suspeitamente pequeno (${SIZE_KB}KB) — pode ser stub."
    exit 2
fi
ok "AppImage baixado (${SIZE_KB}KB)"

# === 5. Run + validate ===
log "Etapa 5/5 — Rodando AppImage em background"
"$APPIMAGE" --no-sandbox >"${WORKDIR}/${APP_ID}.log" 2>&1 &
APP_PID=$!
sleep 10

if ! kill -0 "$APP_PID" 2>/dev/null; then
    err "Processo morreu antes do clique. Log: ${WORKDIR}/${APP_ID}.log"
    tail -20 "${WORKDIR}/${APP_ID}.log" >&2
    exit 2
fi
ok "AppImage ativo (pid=$APP_PID)"

cat <<EOF

============================================================
 VALIDACAO MANUAL — Janela do '${APP_NAME}' deve estar aberta
============================================================

 Faca os passos abaixo e digite 'ok' quando concluir:
   1. Faca login no ${APP_NAME} (se nao estiver logado)
   2. Clique em UM LINK EXTERNO (qualquer link que aponte
      para dominio fora do root domain de ${APP_URL})
   3. Verifique se o navegador padrao do SO abriu o link
   4. Verifique se a janela do app permanece ativa
   5. Aguarde ${WAIT_AFTER_CLICK}s e digite 'ok'

============================================================

EOF

read -r -p "Digite 'ok' apos clicar no link externo: " RESP
if [ "$RESP" != "ok" ]; then
    warn "Resposta diferente de 'ok'. Encerrando sem validacao."
    exit 0
fi

sleep "$WAIT_AFTER_CLICK"

if kill -0 "$APP_PID" 2>/dev/null; then
    ok "AC-N1 OK — App permanece vivo apos clique externo (pid=$APP_PID)"
    exit 0
else
    err "AC-N1 FALHOU — App morreu apos clique externo."
    err "Log: ${WORKDIR}/${APP_ID}.log"
    tail -30 "${WORKDIR}/${APP_ID}.log" >&2
    exit 3
fi
