# 众泰成商城系统（拍卖分销商城）

> 基于 Vite + React + TypeScript + Supabase 的复合型电商商城，整合 C2C 寄卖、限时竞拍抢单、多级分销裂变三大核心业务模式。

## 项目简介

众泰成商城是一套完整的电商管理系统，包含三大子系统：

| 子系统 | 路径 | 说明 |
|--------|------|------|
| 管理后台（Web） | `/login`、`/dashboard` 等 | 覆盖用户、商品、订单、资金、分销、运营、招商考核、吃土筛选、淘汰清理、拆人、权限、抢购时段、早市激励等 15 大业务域 |
| 用户端（移动 H5） | `/m/home`、`/m/market` 等 | 覆盖用户、商品、交易、资金、分销、运营 6 大业务域 |
| 会员系统 | `/member/*` | 独立的会员注册/登录/后台 |

管理后台默认管理员：`455277133@qq.com / 123456`（请部署后立即修改）。

## 技术栈

- **前端**：Vite 7 + React 18 + TypeScript + Tailwind CSS + shadcn/ui + Supabase JS
- **后端**：自托管 Supabase（PostgreSQL 17 + GoTrue + PostgREST + Storage + Realtime + Edge Functions）
- **反向代理**：Nginx + Let's Encrypt
- **包管理**：pnpm / npm

## 一键安装（推荐）

适用于全新 Ubuntu 20.04+ / Debian 11+ 服务器。

### 前置要求

1. **域名已解析到服务器 IP**（A 记录指向本机公网 IP）
2. **安全组已放行 80 / 443 端口**（阿里云/腾讯云控制台配置）
3. **以 root 用户执行**

### 安装命令

```bash
curl -fsSL https://raw.githubusercontent.com/JackChiu090/ztc1349-mall/main/install.sh | bash
```

或克隆本仓库后：

```bash
git clone https://github.com/JackChiu090/ztc1349-mall.git
cd ztc1349-mall
sudo bash install.sh
```

### 安装流程

安装脚本会引导你完成 6 步，全程约需 10–20 分钟：

1. **交互式提问**：域名、管理员邮箱/密码、SSL 邮箱、是否启用 HTTPS
2. **安装 Docker / Node.js**（使用阿里云、daocloud、npmmirror 等国内镜像源）
3. **部署自托管 Supabase**：生成 JWT 密钥、启动 PostgreSQL + GoTrue + PostgREST + Storage + Realtime + Edge Functions
4. **初始化数据库**：应用 schema、写入种子配置与演示数据（产品/分类/公告/Banner 等）
5. **构建前端**：npm install + vite build（使用 npmmirror 加速）
6. **配置 Nginx + HTTPS**：Let's Encrypt 证书自动签发
7. **创建管理员账号**：通过 GoTrue Admin API 创建超级管理员
8. **上传演示图片**：自动上传到 Supabase Storage

### 安装完成后

- 前台商城：`https://你的域名/m/home`
- 后台管理：`https://你的域名/login`
- 管理员账号：你安装时设置的邮箱 / 密码

## 手动安装（开发者）

如果你已经熟悉 Supabase 自托管，可按以下步骤手动操作：

```bash
# 1. 启动 Supabase
cd deploy/supabase
cp .env.example .env
# 编辑 .env：填入 JWT_SECRET、POSTGRES_PASSWORD、SUPABASE_PUBLIC_URL、API_EXTERNAL_URL 等
sh utils/generate-keys.sh --update-env
docker compose up -d

# 2. 应用 schema
docker exec -i supabase-db psql -U postgres -d postgres < supabase/schema.sql

# 3. 应用种子数据
docker exec -i supabase-db psql -U postgres -d postgres < deploy/seed.sql

# 4. 部署边缘函数（容器会自动加载 volumes/functions/ 目录）
# 只需把 supabase/functions/*/index.ts 复制到 deploy/supabase/volumes/functions/<name>/index.ts
for f in supabase/functions/*/; do
  name=$(basename "$f")
  mkdir -p deploy/supabase/volumes/functions/$name
  cp "$f/index.ts" deploy/supabase/volumes/functions/$name/index.ts
done
cd deploy/supabase && docker compose restart functions

# 5. 构建前端
cd ../..
npm install
cp .env.example .env  # 编辑填入 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY
npm run build  # 或 npx vite build

# 6. 配置 Nginx（参考 install.sh 中的 configure_nginx 函数）
```

## 项目结构

```
.
├── README.md                      本文档
├── install.sh                     一键安装脚本（国内镜像加速）
├── .env.example                   前端环境变量模板
├── package.json / vite.config.ts  前端构建配置
├── src/                           前端源码（React + TypeScript）
│   ├── pages/                     页面（admin / mobile / member）
│   ├── contexts/                  AuthContext / MobileUserContext / MemberContext
│   ├── components/                UI 组件
│   └── lib/                       工具库（结算 / 权限 / 密码策略）
├── supabase/                      后端
│   ├── schema.sql                 数据库结构（pg_dump）
│   ├── functions/                 13 个边缘函数（含 id-card-ocr 等）
│   └── migrations/                增量迁移历史
├── deploy/                        安装部署资源
│   ├── supabase/                  自托管 Supabase docker-compose
│   ├── seed.sql                   初始化种子数据（占位符替换）
│   └── storage/                   演示图片（Banner / 产品图）
└── docs/                          设计文档（PRD / 设计稿）
```

## 关键功能模块

- **管理后台**：数据仪表盘、用户管理、商品管理、订单管理、资金管理、分销管理、运营管理、招商考核、吃土筛选、淘汰清理、拆单拆人、权限体系、抢购时段管理、早市商家分级激励、测试数据清除工具
- **用户端**：注册（多步骤 KYC）、实名认证、进货市场、限时抢单、订单管理（待付款/待确认/已完成）、钱包、团队分销、邀请海报、平台公告、协议查看
- **会员系统**：会员注册/登录/后台（个人资料、会员信息、安全设置）

## OCR 自动识别说明

本项目原本依赖外部 OCR 网关（百度身份证 OCR + 二要素核验），需要 `INTEGRATIONS_API_KEY` 环境变量。
自托管部署默认没有该密钥。

**修复方案**：当边缘函数检测到未配置 `INTEGRATIONS_API_KEY` 时，会返回 `success: false / reason: "ocr_not_configured"`，前端会以柔和的蓝色提示告知用户「未启用自动识别，请手动填写」，**不会弹错误**。

如果你需要启用自动 OCR，可在部署完成后给边缘函数容器补上环境变量：
```bash
docker compose exec functions env INTEGRATIONS_API_KEY=你的密钥
```

## 常见问题

### 1. 域名未解析到服务器
访问域名会走旧 DNS。检查 `nslookup 你的域名` 应返回服务器 IP。

### 2. HTTPS 证书申请失败
通常是 80 端口被云服务商安全组拦截。先确认阿里云/腾讯云安全组已放行 80，然后重新执行：
```bash
certbot --nginx -d 你的域名 --non-interactive --agree-tos -m 你的邮箱
```

### 3. 忘记管理员密码
重新执行 install.sh 时选择"覆盖安装"或直接在 Supabase Studio 重置。

### 4. 前端构建很慢
脚本已默认使用 npmmirror 镜像源。如果仍慢，检查 `/opt/node22` 是否安装成功。

## 许可证

MIT