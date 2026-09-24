#!/bin/sh
set -eu

# Smoke test del contrato HTTP expuesto a sistemas externos.
# El modo predeterminado evita escrituras persistentes, envíos a Meta y ejecución
# de cron: las rutas con efectos se ejercitan con entradas que deben rechazarse.

BASE_URL=${BASE_URL:-http://localhost:3000}
BASE_URL=${BASE_URL%/}
API_KEY=${API_KEY:-}
CURL_TIMEOUT_SECONDS=${CURL_TIMEOUT_SECONDS:-15}
FAKE_UUID=00000000-0000-4000-8000-000000000000
INVALID_CRON_SECRET="furyleeds-smoke-intentionally-invalid-$$"

if [ -z "$API_KEY" ]; then
  printf '%s\n' 'ERROR: API_KEY es obligatoria y debe pertenecer a una cuenta de pruebas.' >&2
  exit 2
fi

case "$API_KEY" in
  furyleeds_live_*) ;;
  *)
    printf '%s\n' 'ERROR: API_KEY no tiene el prefijo público esperado furyleeds_live_.' >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'ERROR: curl es obligatorio para ejecutar este smoke test.' >&2
  exit 2
fi

umask 077
AUTH_HEADER_FILE=$(mktemp)
chmod 600 "$AUTH_HEADER_FILE"
cleanup() {
  rm -f "$AUTH_HEADER_FILE"
}
trap cleanup EXIT HUP INT TERM
printf 'Authorization: Bearer %s\n' "$API_KEY" >"$AUTH_HEADER_FILE"
unset API_KEY

PASSED=0
FAILED=0

run_test() {
  label=$1
  expected=$2
  method=$3
  path=$4
  auth_mode=${5:-none}
  body=${6:-}

  set -- \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --connect-timeout "$CURL_TIMEOUT_SECONDS" \
    --max-time "$CURL_TIMEOUT_SECONDS"

  if [ "$method" = 'HEAD' ]; then
    set -- "$@" --head
  else
    set -- "$@" --request "$method"
  fi

  if [ "$auth_mode" = 'api' ]; then
    set -- "$@" --header "@$AUTH_HEADER_FILE"
  elif [ "$auth_mode" = 'invalid-cron' ]; then
    set -- "$@" --header "x-cron-secret: $INVALID_CRON_SECRET"
  fi

  if [ -n "$body" ]; then
    set -- "$@" --header 'Content-Type: application/json' --data "$body"
  fi

  if status=$(curl "$@" "${BASE_URL}${path}"); then
    case " $expected " in
      *" $status "*)
        PASSED=$((PASSED + 1))
        printf 'PASS  %-58s HTTP %s\n' "$label" "$status"
        ;;
      *)
        FAILED=$((FAILED + 1))
        printf 'FAIL  %-58s HTTP %s (esperado: %s)\n' "$label" "$status" "$expected" >&2
        ;;
    esac
  else
    FAILED=$((FAILED + 1))
    printf 'FAIL  %-58s error de red/conexión\n' "$label" >&2
  fi
}

printf 'FuryLeeds external API smoke: %s\n\n' "$BASE_URL"

run_test 'GET /health' '200' GET '/health'
run_test 'HEAD /health' '204' HEAD '/health'

run_test 'GET /api/v1/me' '200' GET '/api/v1/me' api
run_test 'GET /api/v1/contacts' '200' GET '/api/v1/contacts?limit=1' api
run_test 'POST /api/v1/contacts (validación segura)' '400' POST '/api/v1/contacts' api '{}'
run_test 'GET /api/v1/contacts/{id} inexistente' '404' GET "/api/v1/contacts/$FAKE_UUID" api
run_test 'PATCH /api/v1/contacts/{id} inexistente' '404' PATCH "/api/v1/contacts/$FAKE_UUID" api '{"name":"FuryLeeds smoke test"}'

run_test 'GET /api/v1/conversations' '200' GET '/api/v1/conversations?limit=1' api
run_test 'GET /api/v1/conversations/{id} inexistente' '404' GET "/api/v1/conversations/$FAKE_UUID" api
run_test 'GET /api/v1/conversations/{id}/messages inexistente' '404' GET "/api/v1/conversations/$FAKE_UUID/messages?limit=1" api

run_test 'POST /api/v1/messages (validación segura)' '400' POST '/api/v1/messages' api '{}'
run_test 'POST /api/v1/broadcasts (validación segura)' '400' POST '/api/v1/broadcasts' api '{}'
run_test 'GET /api/v1/broadcasts/{id} inexistente' '404' GET "/api/v1/broadcasts/$FAKE_UUID" api

run_test 'GET /api/v1/webhooks' '200' GET '/api/v1/webhooks' api
run_test 'POST /api/v1/webhooks (URL privada rechazada)' '400' POST '/api/v1/webhooks' api '{"url":"http://127.0.0.1/furyleeds","events":["message.received"]}'
run_test 'GET /api/v1/webhooks/{id} inexistente' '404' GET "/api/v1/webhooks/$FAKE_UUID" api
run_test 'PATCH /api/v1/webhooks/{id} inexistente' '404' PATCH "/api/v1/webhooks/$FAKE_UUID" api '{"is_active":false}'
run_test 'DELETE /api/v1/webhooks/{id} inexistente' '404' DELETE "/api/v1/webhooks/$FAKE_UUID" api

run_test 'GET /api/whatsapp/webhook sin desafío' '400' GET '/api/whatsapp/webhook'
run_test 'POST /api/whatsapp/webhook sin firma' '401' POST '/api/whatsapp/webhook' none '{}'
run_test 'GET /api/automations/cron con secreto inválido' '401 503' GET '/api/automations/cron' invalid-cron
run_test 'GET /api/flows/cron con secreto inválido' '401 503' GET '/api/flows/cron' invalid-cron

printf '\nResultado: %s aprobadas, %s fallidas.\n' "$PASSED" "$FAILED"

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi
