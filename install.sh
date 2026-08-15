#!/bin/bash
# ============================================================
#  众泰成商城（拍卖分销商城）一键安装脚本
#  适用系统：Ubuntu 20.04+ / Debian 11+
#  功能：全新服务器上自动完成依赖安装、本地数据库(Supabase)部署、
#        数据初始化、前端构建、Nginx + HTTPS 配置、管理员创建。
#
#  用法：  bash install.sh
#
#  安装前请确认：
#   1. 域名已解析到本服务器 IP（A 记录）
#   2. 服务器安全组已放行 80 / 443 端口
#   3. 以 root 用户运行
# ============================================================

set -euo pipefail

# ---------- 颜色 ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[信息]${NC} $*"; }
ok()    { echo -e "${GREEN}[成功]${NC} $*"; }
warn()  { echo -e "${YELLOW}[警告]${NC} $*"; }
err()   { echo -e "${RED}[错误]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/var/www/mall"
SUPABASE_DIR="/opt/supabase"

# ---------- 1. 前置检查 ----------
if [ "$(id -u)" -ne 0 ]; then
  err "请以 root 用户运行本脚本：sudo bash install.sh"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  err "本脚本仅支持 Ubuntu/Debian 系统"
  exit 1
fi

MEM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM" -lt 3800 ]; then
  warn "内存仅 ${MEM}MB，建议至少 4GB（推荐 8GB），否则 Supabase 可能运行缓慢"
fi

# ---------- 2. 交互式提问 ----------
echo ""
echo -e "${BLUE}=======================================================${NC}"
echo -e "${BLUE}      众泰成商城 · 一键安装向导${NC}"
echo -e "${BLUE}=======================================================${NC}"
echo ""

ask() {
  local prompt="$1" var="$2" default="$3"
  local val=""
  if [ -n "$default" ]; then
    read -r -p "$(echo -e "${GREEN}${prompt}${NC} [默认: ${default}]：")" val
    val="${val:-$default}"
  else
    read -r -p "$(echo -e "${GREEN}${prompt}${NC}：")" val
    while [ -z "$val" ]; do
      read -r -p "$(echo -e "${RED}此项不能为空，请重新输入：${NC}")" val
    done
  fi
  eval "$var='$val'"
}

ask "请输入你的网站域名（例如 mall.example.com）" DOMAIN ""
ask "管理员邮箱（后台登录账号）" ADMIN_EMAIL "admin@example.com"
ask "管理员密码（后台登录密码，至少 6 位）" ADMIN_PASSWORD "123456"
ask "用于 HTTPS 证书通知的邮箱" CERT_EMAIL "admin@example.com"
ask "是否启用 HTTPS (https://)？输入 y 或 n" ENABLE_HTTPS "y"

# 数据库密码（自动生成，也允许用户自定义）
DB_PWD="$(openssl rand -hex 16 2>/dev/null || head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
ask "本地数据库密码（留空自动生成）" DB_PWD_INPUT "$DB_PWD"
if [ -n "$DB_PWD_INPUT" ]; then DB_PWD="$DB_PWD_INPUT"; fi

DASH_PWD="$(openssl rand -hex 16 2>/dev/null || echo 'change-me-please')"

echo ""
info "配置确认："
echo "  域名:          ${DOMAIN}"
echo "  管理员邮箱:    ${ADMIN_EMAIL}"
echo "  启用 HTTPS:    ${ENABLE_HTTPS}"
echo "  部署目录:      ${APP_DIR}"
echo "  Supabase 目录: ${SUPABASE_DIR}"
echo ""

read -r -p "$(echo -e "${YELLOW}确认开始安装？(y/n)：${NC}")" CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  err "已取消安装"
  exit 1
fi

echo ""
info "开始安装，整个过程约需 10-20 分钟，请耐心等待..."

# ---------- 3. 安装 Docker（使用国内镜像源） ----------
install_docker() {
  if command -v docker >/dev/null 2>&1; then
    ok "Docker 已安装：$(docker --version)"
    return 0
  fi
  info "安装 Docker..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null
  apt-get install -y ca-certificates curl gnupg >/dev/null
  CODE_NAME=$(lsb_release -cs)
  # 尝试阿里云 docker-ce 镜像源
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || \
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | apt-key add - 2>/dev/null
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu ${CODE_NAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y >/dev/null
  if ! apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1; then
    warn "阿里云 docker-ce 源不可用，改用系统自带 docker.io"
    apt-get install -y docker.io docker-compose-v2 >/dev/null
  fi
  # 配置国内镜像加速
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://docker.nju.edu.cn",
    "https://mirror.ccs.tencentyun.com"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
  systemctl enable docker >/dev/null 2>&1 || true
  systemctl restart docker >/dev/null 2>&1 || true
  ok "Docker 安装完成"
}

# ---------- 4. 安装 Node.js（使用国内镜像） ----------
install_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -ge 18 ]; then
    ok "Node.js 已安装：$(node -v)"
    return 0
  fi
  info "安装 Node.js 22..."
  NODE_VER="22.22.2"
  cd /opt
  if [ ! -d "/opt/node22" ]; then
    curl -fsSL "https://npmmirror.com/mirrors/node/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz" -o node.tar.xz || \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz" -o node.tar.xz
    tar -xf node.tar.xz
    mv "node-v${NODE_VER}-linux-x64" node22
    rm -f node.tar.xz
  fi
  ln -sf /opt/node22/bin/node /usr/local/bin/node
  ln -sf /opt/node22/bin/npm /usr/local/bin/npm
  ln -sf /opt/node22/bin/npx /usr/local/bin/npx
  npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
  ok "Node.js 安装完成：$(node -v)"
}

# ---------- 5. 部署自托管 Supabase（本地数据库） ----------
deploy_supabase() {
  info "部署本地 Supabase（数据库 + 认证 + 存储 + 实时 + 边缘函数）..."
  rm -rf "$SUPABASE_DIR"
  mkdir -p "$SUPABASE_DIR"
  cp -r "$SCRIPT_DIR/deploy/supabase/." "$SUPABASE_DIR/"
  cd "$SUPABASE_DIR"

  # 生成密钥
  if [ -f utils/generate-keys.sh ]; then
    cp .env.example .env 2>/dev/null || cp "$SCRIPT_DIR/deploy/supabase/.env.example" .env
    sh utils/generate-keys.sh --update-env >/dev/null 2>&1 || true
  fi

  # 覆盖数据库密码与 URL
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PWD}|" .env
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${DASH_PWD}|" .env

  PROTO="https"
  [ "$ENABLE_HTTPS" = "n" ] && PROTO="http"
  sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=${PROTO}://${DOMAIN}|" .env
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=${PROTO}://${DOMAIN}/auth/v1|" .env
  sed -i "s|^SITE_URL=.*|SITE_URL=${PROTO}://${DOMAIN}|" .env
  sed -i "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=${PROTO}://${DOMAIN}|" .env
  sed -i "s|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|" .env
  sed -i "s|^DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=admin|" .env

  info "拉取 Supabase 镜像（首次约需几分钟）..."
  docker compose pull >/dev/null 2>&1
  docker compose up -d

  # 等待数据库就绪
  info "等待数据库就绪..."
  for i in $(seq 1 60); do
    if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
      ok "数据库已就绪"
      break
    fi
    sleep 5
  done
}

# ---------- 6. 应用 schema + 种子数据 ----------
apply_schema_and_seed() {
  info "应用数据库结构与初始化数据..."
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=0 < "$SCRIPT_DIR/supabase/schema.sql" >/dev/null 2>&1 || true

  # 替换种子数据中的域名占位符
  SUPABASE_URL="${PROTO:-https}://${DOMAIN}"
  sed "s|__SUPABASE_URL__|${SUPABASE_URL}|g" "$SCRIPT_DIR/deploy/seed.sql" > /tmp/seed_final.sql
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/seed_final.sql
  rm -f /tmp/seed_final.sql
  ok "数据库初始化完成"
}

# ---------- 7. 部署边缘函数 ----------
deploy_functions() {
  info "部署边缘函数..."
  FUNC_DIR="$SUPABASE_DIR/volumes/functions"
  for f in "$SCRIPT_DIR"/supabase/functions/*/; do
    name=$(basename "$f")
    [ "$name" = "main" ] && continue
    mkdir -p "$FUNC_DIR/$name"
    cp "$f/index.ts" "$FUNC_DIR/$name/index.ts" 2>/dev/null || true
  done
  cd "$SUPABASE_DIR" && docker compose restart functions >/dev/null 2>&1 || true
  ok "边缘函数部署完成"
}

# ---------- 8. 构建前端 ----------
build_frontend() {
  info "构建前端..."
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"

  # 复制前端源码（排除无需文件）
  (cd "$SCRIPT_DIR" && tar --exclude='./node_modules' --exclude='./deploy' --exclude='./.git' --exclude='./supabase' --exclude='./*.tar.gz' -cf - .) | (cd "$APP_DIR" && tar -xf -)

  # 生成前端环境变量（匿名 key 由 Supabase 自动生成）
  ANON_KEY=$(grep '^ANON_KEY=' "$SUPABASE_DIR/.env" | cut -d= -f2- | tr -d '\r')
  SUPABASE_URL="${PROTO:-https}://${DOMAIN}"
  cat > "$APP_DIR/.env" << EOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
EOF

  cd "$APP_DIR"
  npm install --registry=https://registry.npmmirror.com >/dev/null 2>&1
  npx vite build >/dev/null 2>&1
  ok "前端构建完成"
}

# ---------- 9. 配置 Nginx + HTTPS ----------
configure_nginx() {
  info "配置 Nginx..."
  apt-get install -y nginx >/dev/null 2>&1

  SUPABASE_UPSTREAM="http://127.0.0.1:8000"
  cat > /etc/nginx/sites-available/mall << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    root ${APP_DIR}/dist;
    index index.html;
    client_max_body_size 50m;

    location /rest/ { proxy_pass ${SUPABASE_UPSTREAM}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /auth/ { proxy_pass ${SUPABASE_UPSTREAM}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /storage/ { proxy_pass ${SUPABASE_UPSTREAM}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; client_max_body_size 50m; }
    location /realtime/ { proxy_pass ${SUPABASE_UPSTREAM}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 3600s; }
    location /functions/ { proxy_pass ${SUPABASE_UPSTREAM}; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
  ln -sf /etc/nginx/sites-available/mall /etc/nginx/sites-enabled/mall
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx

  if [ "$ENABLE_HTTPS" = "y" ] || [ "$ENABLE_HTTPS" = "Y" ]; then
    info "申请 HTTPS 证书（Let's Encrypt）..."
    apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERT_EMAIL}" --redirect || \
      warn "HTTPS 证书申请失败，请检查域名解析与 80 端口是否放行；已回退为 HTTP"
  fi
  ok "Nginx 配置完成"
}

# ---------- 10. 创建管理员账号 ----------
create_admin() {
  info "创建管理员账号..."
  SERVICE_KEY=$(grep '^SERVICE_ROLE_KEY=' "$SUPABASE_DIR/.env" | cut -d= -f2- | tr -d '\r')
  RESP=$(curl -s -X POST "http://localhost:8000/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"email_confirm\":true}")
  ADMIN_ID=$(echo "$RESP" | grep -oP '"id":"\K[^"]+' | head -1)
  if [ -n "$ADMIN_ID" ]; then
    docker exec -i supabase-db psql -U postgres -d postgres >/dev/null 2>&1 << EOF
INSERT INTO "public"."admin_profiles" (id, email, display_name, role, is_active)
VALUES ('${ADMIN_ID}', '${ADMIN_EMAIL}', '超级管理员', 'super_admin', true)
ON CONFLICT (id) DO UPDATE SET role='super_admin', is_active=true;
EOF
    ok "管理员账号已创建：${ADMIN_EMAIL}"
  else
    warn "管理员可能已存在：$(echo "$RESP" | head -c 200)"
  fi
}

# ---------- 11. 上传演示图片 ----------
upload_images() {
  info "上传演示图片到存储..."
  SERVICE_KEY=$(grep '^SERVICE_ROLE_KEY=' "$SUPABASE_DIR/.env" | cut -d= -f2- | tr -d '\r')
  BASE="http://localhost:8000/storage/v1/object"
  find "$SCRIPT_DIR/deploy/storage" -type f 2>/dev/null | sort | while read -r f; do
    rel="${f#${SCRIPT_DIR}/deploy/storage/}"
    bucket="${rel%%/*}"
    obj="${rel#*/}"
    curl -s -o /dev/null -X POST "$BASE/$bucket/$obj" \
      -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/octet-stream" --data-binary "@$f"
  done
  ok "演示图片上传完成"
}

# ---------- 执行安装 ----------
install_docker
install_node
deploy_supabase
apply_schema_and_seed
deploy_functions
build_frontend
configure_nginx
create_admin
upload_images

echo ""
echo -e "${GREEN}=======================================================${NC}"
echo -e "${GREEN}  安装完成！🎉${NC}"
echo -e "${GREEN}=======================================================${NC}"
echo ""
PROTO="https"; [ "$ENABLE_HTTPS" = "n" ] && PROTO="http"
echo "  前台商城:   ${PROTO}://${DOMAIN}/m/home"
echo "  后台管理:   ${PROTO}://${DOMAIN}/login"
echo "  管理员账号: ${ADMIN_EMAIL}"
echo "  管理员密码: ${ADMIN_PASSWORD}"
echo "  Supabase 控制台: ${PROTO}://${DOMAIN} （用户 admin / ${DASH_PWD}，需在 Nginx 暴露 8000 端口时可用）"
echo ""
warn "重要：请立即修改管理员密码，并妥善保管服务器上的数据库密码。"
warn "建议：在阿里云安全组中仅放行 80/443 端口，不要暴露 5432/8000 等内部端口。"
echo ""
ok "部署完成，祝生意兴隆！"
