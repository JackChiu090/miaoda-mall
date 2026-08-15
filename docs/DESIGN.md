## Vibe
- Dieter Rams functionalism × blueprint grid — 以印刷网格、数据线条、精密仪表为灵感，功能优先，数据可读性第一

## Color
- Primary: #F46800
- On Primary: #0F172A
- Accent: #3D71D9
- On Accent: #FFFFFF
- Background: #181B1F
- Foreground: #D9D9D9
- Muted: #242629
- Border: #34373B
- Secondary: #DC5C00

## Typography
- Heading: KingsoftCloudFont (family: KingsoftCloudFont, weight: Regular, url: https://resource-static.bj.bcebos.com/fonts-skill/KingsoftCloudFont_Regular.ttf)
- Body: JiangChengHei (family: JiangChengHei, weight: Regular, url: https://resource-static.bj.bcebos.com/fonts-skill/JiangChengHei_Regular.ttf)

## Visual Language
- 核心视觉签名：blueprint-grid — 深色背景上用 Border 色绘制 1px 网格线作为表格分割，数据行交替用 Muted 底色区分，无圆角卡片，仅用 border-radius: 2px 的极小圆角
- 材质与深度：无 box-shadow，用 border 区分层级；侧边栏比内容区深一档（#13161A）；Muted 作为卡片/面板底色，Background 作为页面底色
- 容器与按钮：卡片无描边阴影，用背景色差异分层；主操作按钮 Primary 填充 + On Primary 字色；次操作 Muted 底 + Foreground 字；危险操作细描边红色；表格行 hover 用 Border 色高亮
- 布局节奏：左侧固定 220px 侧边栏，顶部 56px header；内容区三列 KPI 数字卡 + 图表区 + 列表区；数字用超大字号（3xl+）做视觉锚点；留白集中在分区间距

## Animation
- 交互：按钮 hover 亮度 +10%，150ms ease；侧边栏折叠 200ms ease-in-out
- 入场：数据卡数字 countUp 动画，600ms；禁止页面级入场动效

## Forbidden
- 禁止大面积 Primary/Accent 色块铺底（含 sidebar/header/卡片背景）
- 禁止毛玻璃/光晕/粒子等装饰性视觉效果
- 禁止圆角卡片+细描边+通用投影组合充当视觉签名

## Additional Notes
- 登录页：全幅深色背景，左侧品牌信息区（占60%），右侧表单卡片居中，非纯白底孤立表单
- 所有用户可见文案使用中文
- 图表配色从 Primary #F46800 与 Accent #3D71D9 衍生，不用 Tailwind 默认色板
- 表格必须包裹在 overflow-x-auto 容器中，所有单元格 whitespace-nowrap
