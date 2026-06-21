#!/usr/bin/env bash
# OrdPaw 一键安装/升级/卸载/回滚脚本
# 跨平台支持：macOS / Linux（Windows 通过 WSL/Git Bash）
# 关键设计：data/ 与代码完全隔离，升级只替换应用代码，备份自动保留在 data/backups/。

set -euo pipefail

# ============== 配置 ==============
readonly APP_NAME="ordpaw"
readonly REPO="${ORDPAW_REPO:-ordpaw/ordpaw}"
readonly BRANCH="${ORDPAW_BRANCH:-main}"
readonly INSTALL_DIR="${ORDPAW_INSTALL_DIR:-$HOME/.ordpaw}"
readonly DATA_DIR="${ORDPAW_DATA_DIR:-$HOME/.ordpaw/data}"
readonly VERSIONS_DIR="$INSTALL_DIR/versions"
readonly CURRENT_LINK="$INSTALL_DIR/current"
readonly LOG_FILE="$DATA_DIR/install.log"
readonly MIN_NODE_MAJOR=18

# ============== 工具函数 ==============
log() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts] $*" | tee -a "$LOG_FILE" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

# 跨平台 sed -i
sed_i() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少必要命令: $1"
}

# ============== 平台检查 ==============
check_node() {
  require_cmd node
  local major
  major=$(node -p "process.versions.node.split('.')[0]")
  if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    die "Node.js 版本过低 ($major)，需要 >= $MIN_NODE_MAJOR"
  fi
  log "Node.js $(node -v) ✓"
}

check_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "未检测到 pnpm，尝试安装..."
    if command -v npm >/dev/null 2>&1; then
      npm install -g pnpm@10
    else
      die "需要 pnpm 或 npm，请先安装 Node.js"
    fi
  fi
  log "pnpm $(pnpm -v) ✓"
}

# ============== 版本管理 ==============
current_version() {
  if [ -L "$CURRENT_LINK" ] && [ -e "$CURRENT_LINK" ]; then
    basename "$(readlink "$CURRENT_LINK")"
  else
    echo ""
  fi
}

list_versions() {
  [ -d "$VERSIONS_DIR" ] || return 0
  for d in "$VERSIONS_DIR"/*/; do
    [ -d "$d" ] || continue
    local v
    v=$(basename "$d")
    if [ "$v" = "$(current_version)" ]; then
      echo "  $v (active)"
    else
      echo "  $v"
    fi
  done
}

list_backups() {
  if [ -d "$DATA_DIR/backups" ]; then
    ls -1t "$DATA_DIR/backups" | head -20
  fi
}

# ============== 安装 ==============
install_version() {
  local version="$1"
  local target="$VERSIONS_DIR/$version"

  if [ -d "$target" ]; then
    log "版本 $version 已存在，跳过下载"
  else
    log "正在下载版本 $version..."
    mkdir -p "$VERSIONS_DIR"

    local tarball
    tarball=$(mktemp -t ordpaw.XXXXXX.tar.gz)

    if [ "$version" = "dev" ]; then
      # 开发模式：直接克隆仓库
      local clone_dir
      clone_dir=$(mktemp -d)
      log "克隆仓库 $REPO (branch: $BRANCH)..."
      git clone --depth 1 --branch "$BRANCH" "https://github.com/$REPO.git" "$clone_dir" || die "克隆失败"
      mkdir -p "$target"
      # 排除 data、node_modules、.turbo
      rsync -a --exclude='data' --exclude='node_modules' --exclude='.turbo' --exclude='.git' "$clone_dir/" "$target/"
      rm -rf "$clone_dir" "$tarball" 2>/dev/null || true
    else
      local url="https://github.com/$REPO/archive/refs/tags/v${version}.tar.gz"
      curl -fsSL "$url" -o "$tarball" || die "下载失败: $url"
      mkdir -p "$target"
      tar -xzf "$tarball" -C "$target" --strip-components=1
      rm -f "$tarball"
    fi

    log "安装依赖 (此过程可能需要几分钟)..."
    (cd "$target" && pnpm install --frozen-lockfile --prod=false 2>&1 | tail -20) || die "依赖安装失败"

    log "构建项目..."
    (cd "$target" && pnpm turbo run build 2>&1 | tail -20) || die "构建失败"

    log "✓ 版本 $version 安装完成"
  fi

  activate_version "$version"
}

activate_version() {
  local version="$1"
  local target="$VERSIONS_DIR/$version"
  [ -d "$target" ] || die "版本不存在: $version"

  ln -sfn "$target" "$CURRENT_LINK"
  log "✓ 已切换到版本 $version"
}

# ============== 数据备份 ==============
backup_data() {
  mkdir -p "$DATA_DIR/backups"
  if [ -f "$DATA_DIR/ordpaw.db" ]; then
    local stamp
    stamp=$(date '+%Y-%m-%dT%H-%M-%S')
    local dest="$DATA_DIR/backups/ordpaw-$stamp-pre-upgrade.db"
    cp "$DATA_DIR/ordpaw.db" "$dest"
    log "✓ 已创建升级前备份: $dest"
    echo "$dest"
  else
    log "无需备份（数据库不存在）"
  fi
}

# ============== 命令分发 ==============
cmd_install() {
  local version="${1:-latest}"
  log "=== 安装 OrdPaw ==="
  log "安装目录: $INSTALL_DIR"
  log "数据目录: $DATA_DIR"

  check_node
  check_pnpm

  mkdir -p "$DATA_DIR" "$DATA_DIR/backups" "$VERSIONS_DIR"

  if [ "$version" = "latest" ]; then
    version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep -o '"tag_name": "[^"]*"' | sed 's/"tag_name": "v\?\(.*\)"/\1/' || echo "")
    if [ -z "$version" ]; then
      log "无法获取 latest 版本，使用 dev 分支"
      version="dev"
    fi
  fi

  install_version "$version"

  # 写环境配置
  cat > "$INSTALL_DIR/.env" <<EOF
ORDPAW_DATA_DIR=$DATA_DIR
ORDPAW_PORT=3000
EOF

  log ""
  log "✅ 安装完成！"
  log ""
  log "启动服务:"
  log "  ordpaw start"
  log ""
  log "数据目录: $DATA_DIR （已独立于应用代码，升级不会丢失）"
}

cmd_upgrade() {
  local target_version="${1:-latest}"
  log "=== 升级 OrdPaw ==="

  local current
  current=$(current_version)
  if [ -z "$current" ]; then
    die "尚未安装任何版本，请先运行: ordpaw install"
  fi
  log "当前版本: $current"

  # 1. 强制备份
  backup_data >/dev/null

  # 2. 安装新版本（不影响 data/）
  install_version "$target_version"

  log ""
  log "✅ 升级完成！数据已保留在 $DATA_DIR"
  log "如遇问题可回滚: ordpaw rollback"
}

cmd_rollback() {
  local target_version="${1:-}"
  log "=== 回滚 OrdPaw ==="

  if [ -z "$target_version" ]; then
    target_version=$(current_version)
    # 找上一版本
    local versions
    versions=$(ls -1 "$VERSIONS_DIR" | sort -V | tac)
    for v in $versions; do
      if [ "$v" != "$target_version" ]; then
        target_version="$v"
        break
      fi
    done
  fi

  [ -d "$VERSIONS_DIR/$target_version" ] || die "目标版本不存在: $target_version"

  log "回滚到版本: $target_version"
  backup_data >/dev/null
  activate_version "$target_version"

  log "✅ 回滚完成"
}

cmd_uninstall() {
  log "=== 卸载 OrdPaw ==="
  read -rp "确认卸载？数据目录 ($DATA_DIR) 不会被删除 [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR/versions" "$CURRENT_LINK" "$INSTALL_DIR/.env"
    log "✓ 应用已卸载。数据保留在 $DATA_DIR"
  else
    log "已取消"
  fi
}

cmd_list() {
  echo "已安装的版本："
  list_versions
  echo ""
  echo "数据备份（最近 20 个）："
  list_backups
}

cmd_status() {
  echo "OrdPaw 状态"
  echo "==========="
  echo "安装目录: $INSTALL_DIR"
  echo "数据目录: $DATA_DIR"
  echo "当前版本: $(current_version || echo '未激活')"
  echo ""
  echo "已安装版本："
  list_versions
  echo ""
  echo "数据备份："
  list_backups
}

cmd_help() {
  cat <<EOF
OrdPaw CLI - 安装/升级/回滚/管理工具

用法:
  ordpaw <command> [args]

命令:
  install [version]    安装指定版本（默认 latest）
  upgrade [version]    升级到指定版本（默认 latest）
  rollback [version]   回滚到指定版本（默认上一版本）
  uninstall            卸载应用（保留数据）
  list                 列出已安装版本与备份
  status               显示安装状态
  help                 显示此帮助

环境变量:
  ORDPAW_REPO          仓库 (默认 ordpaw/ordpaw)
  ORDPAW_BRANCH        分支 (默认 main)
  ORDPAW_INSTALL_DIR   安装目录 (默认 ~/.ordpaw)
  ORDPAW_DATA_DIR      数据目录 (默认 ~/.ordpaw/data)

数据安全:
  - 数据目录与应用代码完全分离
  - 升级前自动备份到 \$DATA_DIR/backups/
  - 数据库使用原子写入（.tmp + rename）
  - 保留最近 10 个备份自动轮转
EOF
}

main() {
  mkdir -p "$DATA_DIR" "$(dirname "$LOG_FILE")" 2>/dev/null || true

  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    install) cmd_install "$@" ;;
    upgrade|update) cmd_upgrade "$@" ;;
    rollback) cmd_rollback "$@" ;;
    uninstall|remove) cmd_uninstall "$@" ;;
    list|ls) cmd_list ;;
    status) cmd_status ;;
    help|--help|-h) cmd_help ;;
    *) die "未知命令: $cmd（运行 'ordpaw help' 查看帮助）" ;;
  esac
}

main "$@"
