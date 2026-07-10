#!/usr/bin/env bash
# BFF smoke tests — requiere el stack levantado (docker compose up).
#
# Lee ADMIN_EMAIL, ADMIN_PASSWORD y GATEWAY_PORT desde el .env de la raíz
# del monorepo, o desde el entorno. Se pueden sobreescribir por CLI:
#
#   ./test-bff.sh [--gateway <url>] [--email <addr>] [--password <pass>] [--verbose]
#
# Salida: exit 0 si todos los tests pasan; exit 1 si alguno falla.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Cargar .env del monorepo si existe ────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

# ── Valores por defecto ───────────────────────────────────────────────────────
GATEWAY_URL="${GATEWAY_URL:-http://localhost:${GATEWAY_PORT:-8080}}"
EMAIL="${ADMIN_EMAIL:-}"
PASSWORD="${ADMIN_PASSWORD:-}"
VERBOSE=0

# ── Overrides por CLI ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway)  GATEWAY_URL="$2"; shift 2 ;;
    --email)    EMAIL="$2";        shift 2 ;;
    --password) PASSWORD="$2";     shift 2 ;;
    --verbose)  VERBOSE=1;         shift   ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
done

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'

PASS=0; FAIL=0
RESP_FILE="$(mktemp)"
trap 'rm -f "$RESP_FILE"' EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────

# check <desc> <expected_http_code> <method> <url> [extra curl args...]
check() {
  local desc="$1" expected="$2" method="$3" url="$4"
  shift 4
  local code
  code=$(curl -s -o "$RESP_FILE" -w "%{http_code}" -X "$method" "$url" "$@")
  local body; body=$(cat "$RESP_FILE")

  if [[ "$code" == "$expected" ]]; then
    echo -e "  ${GREEN}✓${NC} [${code}] ${desc}"
    PASS=$((PASS+1))
    if [[ "$VERBOSE" == "1" ]]; then
      echo -e "    ${DIM}$(echo "$body" | head -c 200 | tr '\n' ' ')${NC}"
    fi
  else
    echo -e "  ${RED}✗${NC} [${code} ≠ ${expected}] ${desc}"
    echo -e "    ${DIM}$(echo "$body" | head -c 300 | tr '\n' ' ')${NC}"
    FAIL=$((FAIL+1))
  fi
}

# check_5xx <desc> <url> [extra curl args...]
# Pasa si el status es 5xx (MS downstream ausente — comportamiento esperado).
check_5xx() {
  local desc="$1" url="$2"
  shift 2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" "$@")
  if [[ "$code" =~ ^5 ]]; then
    echo -e "  ${GREEN}✓${NC} [${code}] ${desc} ${DIM}(5xx esperado — MS no disponible)${NC}"
    PASS=$((PASS+1))
  else
    echo -e "  ${YELLOW}?${NC} [${code}] ${desc} ${DIM}(esperaba 5xx)${NC}"
    # No cuenta como fallo — podría estar levantado en otro contexto
  fi
}

# ── BFF direct URL (exposed on host, bypasses the gateway) ───────────────────
BFF_URL="${BFF_URL:-http://localhost:${BFF_PORT:-8090}}"

# ── Inicio ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     EduTrack BFF — smoke tests           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo -e "  Gateway : ${GATEWAY_URL}"
echo -e "  BFF     : ${BFF_URL} ${DIM}(direct — bypasses gateway)${NC}"
echo -e "  Email   : ${EMAIL:-${RED}(no definido)${NC}}"
echo ""

# ── 1. BFF health — direct (gateway requires JWT; /health is container-only) ─
echo -e "${YELLOW}▸ BFF health (direct, no gateway)${NC}"
check "GET /health" "200" "GET" "$BFF_URL/health"

# ── 2. Login → obtener token ──────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}▸ Login (POST /auth/login)${NC}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo -e "  ${RED}✗${NC} ADMIN_EMAIL o ADMIN_PASSWORD no están definidos."
  echo -e "  Define las variables en ${ROOT_DIR}/.env o pásalas con --email/--password."
  exit 1
fi

LOGIN_JSON="{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_JSON")

LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | head -n -1)

if [[ "$LOGIN_CODE" != "200" ]]; then
  echo -e "  ${RED}✗${NC} [${LOGIN_CODE}] Login falló — ${LOGIN_BODY:0:200}"
  exit 1
fi

TOKEN=$(echo "$LOGIN_BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [[ -z "$TOKEN" ]]; then
  echo -e "  ${RED}✗${NC} Respuesta de login no contiene accessToken — ${LOGIN_BODY:0:200}"
  exit 1
fi

echo -e "  ${GREEN}✓${NC} [200] Token obtenido ${DIM}(${TOKEN:0:30}…)${NC}"
AUTH=(-H "Authorization: Bearer $TOKEN")

# ── 3. Estudiantes (student MS + course MS ya existen) ───────────────────────
echo ""
echo -e "${YELLOW}▸ Estudiantes — composite + CRUD proxies${NC}"
check "GET /bff/estudiantes (fan-out: students + courses)" "200" \
  "GET" "$GATEWAY_URL/bff/estudiantes" "${AUTH[@]}"
check "GET /bff/estudiantes/students" "200" \
  "GET" "$GATEWAY_URL/bff/estudiantes/students" "${AUTH[@]}"
check "GET /bff/estudiantes/courses" "200" \
  "GET" "$GATEWAY_URL/bff/estudiantes/courses" "${AUTH[@]}"

# ── 4. Configuración (Auth MS) ────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}▸ Configuración — proxies Auth MS${NC}"
check "GET /bff/configuracion/users" "200" \
  "GET" "$GATEWAY_URL/bff/configuracion/users" "${AUTH[@]}"
check "GET /bff/configuracion/roles" "200" \
  "GET" "$GATEWAY_URL/bff/configuracion/roles" "${AUTH[@]}"
check "GET /bff/configuracion/resources (fan-out todos los MS)" "200" \
  "GET" "$GATEWAY_URL/bff/configuracion/resources" "${AUTH[@]}"

# ── 5. Auth MS directo (sin BFF, para comparar) ───────────────────────────────
echo ""
echo -e "${YELLOW}▸ Auth MS directo — /auth/meta/resources${NC}"
check "GET /auth/meta/resources" "200" \
  "GET" "$GATEWAY_URL/auth/meta/resources" "${AUTH[@]}"

# ── 6. MSes aún no levantados (esperamos 5xx) ────────────────────────────────
echo ""
echo -e "${YELLOW}▸ MSes downstream no disponibles (5xx esperado)${NC}"
check_5xx "GET /bff/asistencia/00000000-0000-0000-0000-000000000001" \
  "$GATEWAY_URL/bff/asistencia/00000000-0000-0000-0000-000000000001" "${AUTH[@]}"
check_5xx "GET /bff/anotaciones/00000000-0000-0000-0000-000000000001" \
  "$GATEWAY_URL/bff/anotaciones/00000000-0000-0000-0000-000000000001" "${AUTH[@]}"
check_5xx "GET /bff/calificaciones/00000000-0000-0000-0000-000000000001" \
  "$GATEWAY_URL/bff/calificaciones/00000000-0000-0000-0000-000000000001" "${AUTH[@]}"
check_5xx "GET /bff/reportes/definitions" \
  "$GATEWAY_URL/bff/reportes/definitions" "${AUTH[@]}"

# ── Resumen ───────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo ""
echo -e "────────────────────────────────────────────"
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}Todos los tests pasaron ($PASS/$TOTAL)${NC}"
else
  echo -e "${RED}$FAIL test(s) fallaron${NC} de $TOTAL"
  exit 1
fi
