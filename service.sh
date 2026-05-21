#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"
LOG_DIR="$PROJECT_DIR/logs"

# Container runtime
COMPOSE="${COMPOSE:-nerdctl compose}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

mkdir -p "$LOG_DIR"

# ─── Backend ────────────────────────────────────────────────────────────────

backend_start() {
    if backend_status_check; then
        warn "Backend is already running (PID: $(cat "$BACKEND_PID_FILE"))"
        return 0
    fi
    info "Starting backend..."
    wait_port_free 8001 || return 1
    cd "$PROJECT_DIR/backend"
    nohup uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001 \
        > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    info "Backend started (PID: $!, log: logs/backend.log)"
}

backend_stop() {
    local stopped=false
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid
        pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            info "Stopping backend (PID: $pid)..."
            kill "$pid"
            local i=0
            while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
                sleep 0.5
                i=$((i + 1))
            done
            if kill -0 "$pid" 2>/dev/null; then
                warn "Backend did not stop gracefully, force killing..."
                kill -9 "$pid" 2>/dev/null || true
            fi
            stopped=true
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    # Also kill any process occupying port 8001
    local port_pid
    port_pid=$(lsof -ti :8001 -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$port_pid" ]; then
        warn "Port 8001 still occupied by PID $port_pid, killing..."
        kill "$port_pid" 2>/dev/null || true
        sleep 1
        kill -9 "$port_pid" 2>/dev/null || true
        stopped=true
    fi
    if [ "$stopped" = true ]; then
        info "Backend stopped"
    else
        warn "Backend is not running"
    fi
}

backend_restart() {
    info "Restarting backend..."
    backend_stop
    backend_start
}

backend_status_check() {
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        return 0
    fi
    return 1
}

backend_status() {
    if backend_status_check; then
        info "Backend is running (PID: $(cat "$BACKEND_PID_FILE"))"
    else
        warn "Backend is not running"
        rm -f "$BACKEND_PID_FILE"
    fi
}

# ─── Frontend ───────────────────────────────────────────────────────────────

frontend_start() {
    if frontend_status_check; then
        warn "Frontend is already running (PID: $(cat "$FRONTEND_PID_FILE"))"
        return 0
    fi
    info "Starting frontend..."
    cd "$PROJECT_DIR/frontend"
    nohup pnpm dev > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    info "Frontend started (PID: $!, log: logs/frontend.log)"
}

frontend_stop() {
    if [ ! -f "$FRONTEND_PID_FILE" ]; then
        warn "Frontend PID file not found, not running"
        return 0
    fi
    local pid
    pid=$(cat "$FRONTEND_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        info "Stopping frontend (PID: $pid)..."
        kill "$pid"
        local i=0
        while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
            sleep 0.5
            i=$((i + 1))
        done
        if kill -0 "$pid" 2>/dev/null; then
            warn "Frontend did not stop gracefully, force killing..."
            kill -9 "$pid" 2>/dev/null || true
        fi
        info "Frontend stopped"
    else
        warn "Frontend process (PID: $pid) not running"
    fi
    rm -f "$FRONTEND_PID_FILE"
}

frontend_restart() {
    info "Restarting frontend..."
    frontend_stop
    frontend_start
}

frontend_status_check() {
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        return 0
    fi
    return 1
}

frontend_status() {
    if frontend_status_check; then
        info "Frontend is running (PID: $(cat "$FRONTEND_PID_FILE"))"
    else
        warn "Frontend is not running"
        rm -f "$FRONTEND_PID_FILE"
    fi
}

# ─── Infrastructure ─────────────────────────────────────────────────────────

wait_port_free() {
    local port=$1
    local max_wait=${2:-15}
    local i=0
    while lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1 && [ $i -lt $max_wait ]; do
        if [ $i -eq 0 ]; then
            info "Waiting for port $port to be released..."
        fi
        sleep 1
        i=$((i + 1))
    done
    if lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        error "Port $port still in use after ${max_wait}s"
        return 1
    fi
}

infra_start() {
    info "Starting infrastructure (postgres, redis)..."
    # Ensure ports are free before starting
    wait_port_free 5432 || return 1
    wait_port_free 6380 || return 1
    cd "$PROJECT_DIR"
    $COMPOSE -f docker-compose.dev.yaml up -d
    info "Infrastructure started"
}

infra_stop() {
    info "Stopping infrastructure..."
    cd "$PROJECT_DIR"
    $COMPOSE -f docker-compose.dev.yaml down
    info "Infrastructure stopped"
}

# ─── All ────────────────────────────────────────────────────────────────────

all_start() {
    infra_start
    backend_start
    frontend_start
    echo ""
    info "All services started"
    all_status
}

all_stop() {
    frontend_stop
    backend_stop
    infra_stop
    echo ""
    info "All services stopped"
}

all_restart() {
    info "Restarting all services..."
    all_stop
    all_start
}

all_status() {
    echo ""
    echo "═══════════════════════════════════════"
    echo " Service Status"
    echo "═══════════════════════════════════════"
    backend_status
    frontend_status
    echo "───────────────────────────────────────"
    info "Infrastructure:"
    cd "$PROJECT_DIR"
    $COMPOSE -f docker-compose.dev.yaml ps 2>/dev/null || warn "Infrastructure not running"
    echo "═══════════════════════════════════════"
}

# ─── Logs ───────────────────────────────────────────────────────────────────

show_logs() {
    local service="${1:-all}"
    case "$service" in
        backend)  tail -f "$LOG_DIR/backend.log" ;;
        frontend) tail -f "$LOG_DIR/frontend.log" ;;
        all)      tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" ;;
        *)        error "Unknown service: $service"; exit 1 ;;
    esac
}

# ─── Usage ──────────────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: $0 <command> [service]

Commands:
  start   [backend|frontend|infra|all]   Start service(s), default: all
  stop    [backend|frontend|infra|all]   Stop service(s), default: all
  restart [backend|frontend|infra|all]   Restart service(s), default: all
  status                                 Show status of all services
  logs    [backend|frontend|all]         Tail service logs, default: all

Examples:
  $0 start                # Start all (infra + backend + frontend)
  $0 restart backend      # Restart backend only
  $0 restart frontend     # Restart frontend only
  $0 restart all          # Restart everything
  $0 stop                 # Stop all
  $0 status               # Check status
  $0 logs backend         # Follow backend logs
EOF
}

# ─── Main ───────────────────────────────────────────────────────────────────

command="${1:-}"
service="${2:-all}"

case "$command" in
    start)
        case "$service" in
            backend)  backend_start ;;
            frontend) frontend_start ;;
            infra)    infra_start ;;
            all)      all_start ;;
            *)        error "Unknown service: $service"; usage; exit 1 ;;
        esac
        ;;
    stop)
        case "$service" in
            backend)  backend_stop ;;
            frontend) frontend_stop ;;
            infra)    infra_stop ;;
            all)      all_stop ;;
            *)        error "Unknown service: $service"; usage; exit 1 ;;
        esac
        ;;
    restart)
        case "$service" in
            backend)  backend_restart ;;
            frontend) frontend_restart ;;
            infra)    infra_stop; infra_start ;;
            all)      all_restart ;;
            *)        error "Unknown service: $service"; usage; exit 1 ;;
        esac
        ;;
    status)
        all_status
        ;;
    logs)
        show_logs "$service"
        ;;
    *)
        usage
        exit 1
        ;;
esac
