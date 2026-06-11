#!/usr/bin/env bash
set -euo pipefail

# ─── TDX 量化选股系统 - Linux 一键部署脚本 ─────────────────────────────────────
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh          # 首次部署（构建 + 启动 + 迁移）
#   ./deploy.sh update   # 更新部署（拉取代码 + 重新构建）
#   ./deploy.sh stop     # 停止所有服务
#   ./deploy.sh status   # 查看服务状态
#   ./deploy.sh logs     # 查看日志
#   ./deploy.sh clean    # 停止并清除所有数据（危险）
#

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

# Detect compose command early (used by all subcommands)
if docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    COMPOSE="docker compose"  # fallback, will be validated in check_requirements
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "${CYAN}[STEP]${NC} $*"; }

# ─── Docker 自动安装 ───────────────────────────────────────────────────────────

install_docker() {
    step "自动安装 Docker..."

    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="${ID}"
        OS_ID_LIKE="${ID_LIKE:-}"
    else
        error "无法检测操作系统类型"
        exit 1
    fi

    info "检测到系统: ${PRETTY_NAME:-$OS_ID}"

    # Determine package manager and install
    if command -v dnf &>/dev/null; then
        # RHEL family: Rocky, AlmaLinux, CentOS, Fedora
        info "使用 dnf 安装 Docker..."
        dnf -y -q install dnf-plugins-core
        # Rocky/Alma/CentOS use centos repo path
        local repo_path="centos"
        if [ "$OS_ID" = "fedora" ]; then
            repo_path="fedora"
        fi
        dnf config-manager --add-repo "https://download.docker.com/linux/${repo_path}/docker-ce.repo" \
            || dnf config-manager --add-repo "https://mirrors.aliyun.com/docker-ce/linux/${repo_path}/docker-ce.repo" \
            || { error "添加 Docker 仓库失败"; exit 1; }
        dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    elif command -v apt-get &>/dev/null; then
        # Debian family: Ubuntu, Debian
        info "使用 apt 安装 Docker..."
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg

        install -m 0755 -d /etc/apt/keyrings
        local deb_id="$OS_ID"
        # Ubuntu derivatives may need ubuntu as base
        if [[ "$OS_ID_LIKE" == *"ubuntu"* ]]; then
            deb_id="ubuntu"
        elif [[ "$OS_ID_LIKE" == *"debian"* ]]; then
            deb_id="debian"
        fi

        curl -fsSL "https://download.docker.com/linux/${deb_id}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg

        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${deb_id} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list

        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

    else
        error "不支持的包管理器，请手动安装 Docker"
        echo "  参考: https://docs.docker.com/engine/install/"
        exit 1
    fi

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    info "Docker 安装完成: $(docker --version)"
}

# ─── Docker 镜像加速配置 ──────────────────────────────────────────────────────

setup_docker_mirror() {
    local daemon_json="/etc/docker/daemon.json"

    step "配置 Docker 镜像加速（国内源）..."
    mkdir -p /etc/docker

    # Always overwrite to ensure latest working mirrors
    cat > "$daemon_json" <<'MIRROR'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io",
    "https://mirror.ccs.tencentyun.com"
  ]
}
MIRROR
    systemctl daemon-reload
    systemctl restart docker
    sleep 2
    info "镜像加速已配置并生效"
}

# ─── 预拉取基础镜像（带重试 + 多源 fallback）────────────────────────────────────

pull_base_images() {
    step "拉取基础镜像..."

    # Mirror prefixes to try (in order)
    local mirrors=(
        "docker.m.daocloud.io/library"
        "docker.1ms.run/library"
        "docker.xuanyuan.me/library"
        ""  # direct pull (last resort)
    )

    local images=("postgres:16-alpine" "redis:7-alpine" "nginx:alpine" "node:22-alpine" "python:3.13-slim")

    for img in "${images[@]}"; do
        if docker image inspect "$img" &>/dev/null; then
            info "  $img (已存在)"
            continue
        fi

        local pulled=false
        for mirror in "${mirrors[@]}"; do
            local full_img
            if [ -n "$mirror" ]; then
                full_img="${mirror}/${img}"
            else
                full_img="$img"
            fi

            info "  尝试拉取: $full_img"
            if docker pull "$full_img" --quiet 2>/dev/null; then
                # Tag to standard name if pulled from mirror
                if [ -n "$mirror" ]; then
                    docker tag "$full_img" "$img"
                fi
                info "  $img ✓"
                pulled=true
                break
            fi
        done

        if [ "$pulled" = false ]; then
            error "  $img 拉取失败（所有源均超时）"
            error "请检查网络连接，或手动配置可用的 Docker 镜像源"
            exit 1
        fi
    done

    info "基础镜像准备完毕"
}

# ─── 环境检测 ──────────────────────────────────────────────────────────────────

check_requirements() {
    step "检查系统依赖..."

    # Install Docker if not present
    if ! command -v docker &>/dev/null; then
        warn "未检测到 Docker，开始自动安装..."
        install_docker
    fi

    # Always ensure mirror is configured (China network)
    setup_docker_mirror

    # Install docker-compose-plugin if compose not available
    if ! docker compose version &>/dev/null && ! command -v docker-compose &>/dev/null; then
        warn "未检测到 Docker Compose，尝试安装..."
        if command -v dnf &>/dev/null; then
            dnf install -y docker-compose-plugin
        elif command -v apt-get &>/dev/null; then
            apt-get install -y -qq docker-compose-plugin
        fi
    fi

    # Set COMPOSE command
    if docker compose version &>/dev/null; then
        COMPOSE="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE="docker-compose"
    else
        error "Docker Compose 安装失败"
        exit 1
    fi

    # Ensure Docker daemon is running
    if ! docker info &>/dev/null; then
        info "启动 Docker 服务..."
        systemctl start docker
        sleep 2
        if ! docker info &>/dev/null; then
            error "Docker 服务启动失败"
            exit 1
        fi
    fi

    info "环境检查通过 (Docker $(docker --version | grep -oP '\d+\.\d+\.\d+') + Compose)"
}

# ─── 环境配置 ──────────────────────────────────────────────────────────────────

is_port_used() {
    ss -tlnp 2>/dev/null | grep -q ":${1} " || \
    netstat -tlnp 2>/dev/null | grep -q ":${1} "
}

setup_env() {
    if [ -f "$ENV_FILE" ]; then
        info "使用已有配置: $ENV_FILE"
        return
    fi

    step "生成环境配置文件..."

    # Generate random password
    local db_password
    db_password=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)

    # Find available port starting from 3333, try 3 times
    local http_port=""
    for p in 3333 3334 3335; do
        if ! is_port_used "$p"; then
            http_port="$p"
            break
        fi
        warn "端口 $p 被占用"
    done
    if [ -z "$http_port" ]; then
        error "端口 3333-3335 均被占用，请手动在 .env 中指定 HTTP_PORT"
        exit 1
    fi
    info "使用端口: $http_port"

    cat > "$ENV_FILE" <<EOF
# TDX 量化选股系统 - 生产环境配置
# 首次部署自动生成，可按需修改后重新部署

# 数据库
POSTGRES_USER=tdx
POSTGRES_PASSWORD=${db_password}
POSTGRES_DB=tdx_quant

# 服务端口（宿主机映射）
HTTP_PORT=${http_port}

# 后端
DATABASE_URL=postgresql+asyncpg://tdx:${db_password}@postgres:5432/tdx_quant
REDIS_URL=redis://redis:6379/0
EOF

    info "已生成配置文件: $ENV_FILE"
    warn "数据库密码已随机生成，如需自定义请编辑 .env 后重新执行"
}

# ─── 部署 ──────────────────────────────────────────────────────────────────────

deploy() {
    pull_base_images

    step "构建并启动服务..."
    cd "$PROJECT_DIR"
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml build
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml up -d

    info "等待数据库就绪..."
    local i=0
    while ! $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml exec -T postgres pg_isready -U tdx -d tdx_quant &>/dev/null; do
        sleep 2
        i=$((i + 1))
        if [ $i -gt 30 ]; then
            error "数据库启动超时"
            exit 1
        fi
    done

    step "执行数据库迁移..."
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml exec -T backend alembic upgrade head

    echo ""
    info "========================================="
    info "  部署完成!"
    info "========================================="
    local port
    port=$(grep HTTP_PORT "$ENV_FILE" | cut -d= -f2 || echo "80")
    info "  访问地址: http://<服务器IP>:${port}"
    info "  查看状态: ./deploy.sh status"
    info "  查看日志: ./deploy.sh logs"
    info "========================================="
}

update() {
    step "更新部署..."
    cd "$PROJECT_DIR"

    # Pull latest code if in git repo
    if [ -d .git ]; then
        info "拉取最新代码..."
        git pull --ff-only || warn "代码拉取失败，使用当前版本继续"
    fi

    step "重新构建并滚动更新..."
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml build
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml up -d

    step "执行数据库迁移..."
    sleep 5  # Wait for backend to start
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml exec -T backend alembic upgrade head || warn "迁移执行失败（可能无新迁移）"

    info "更新完成!"
}

stop() {
    step "停止所有服务..."
    cd "$PROJECT_DIR"
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml down
    info "所有服务已停止"
}

status() {
    cd "$PROJECT_DIR"
    echo ""
    echo "═══════════════════════════════════════"
    echo " TDX 量化选股系统 - 服务状态"
    echo "═══════════════════════════════════════"
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml ps
    echo "═══════════════════════════════════════"
}

show_logs() {
    local service="${1:-}"
    cd "$PROJECT_DIR"
    if [ -n "$service" ]; then
        $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml logs -f "$service"
    else
        $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml logs -f
    fi
}

clean() {
    warn "此操作将停止所有服务并删除数据卷（包括数据库数据）！"
    read -rp "确认执行？(输入 yes 继续): " confirm
    if [ "$confirm" != "yes" ]; then
        info "已取消"
        return
    fi
    cd "$PROJECT_DIR"
    $COMPOSE --env-file "$ENV_FILE" -f docker-compose.prod.yaml down -v
    info "所有服务和数据已清除"
}

# ─── 用法 ──────────────────────────────────────────────────────────────────────

usage() {
    cat <<EOF
TDX 量化选股系统 - 部署脚本

用法: $0 [命令] [参数]

命令:
  (无参数)    首次部署（检查环境 + 生成配置 + 构建 + 启动 + 迁移）
  update      更新部署（拉取代码 + 重新构建 + 迁移）
  stop        停止所有服务
  status      查看服务状态
  logs [svc]  查看日志（可指定: backend, nginx, postgres, redis）
  clean       停止并清除所有数据（危险操作）

示例:
  ./deploy.sh              # 首次一键部署
  ./deploy.sh update       # 代码更新后重新部署
  ./deploy.sh logs backend # 查看后端日志
  ./deploy.sh stop         # 停止服务
EOF
}

# ─── 入口 ──────────────────────────────────────────────────────────────────────

command="${1:-deploy}"

case "$command" in
    deploy|"")
        check_requirements
        setup_env
        deploy
        ;;
    update)
        check_requirements
        deploy  # update uses same flow but with rebuild
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    logs)
        show_logs "${2:-}"
        ;;
    clean)
        clean
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        error "未知命令: $command"
        usage
        exit 1
        ;;
esac
