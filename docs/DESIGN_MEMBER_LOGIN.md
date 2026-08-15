# Theme Name: 白色极简
# Vibe & Description: 以空气感为先，通过大量留白和清晰的字号、字重与间距构建信息层级，整体保持绝对克制，几乎不使用阴影与装饰色，并以温和对比和不锐利的细线字体确保长时间阅读的舒适性。

# Color
- 主背景：#FFFFFF；
- 次背景：#F8F9FB→ 仅用极细微色差区分层级
- 主文字：#111827（深灰而非纯黑）
- 次文字：#6B7280
- 边界：#E5E7EB（1px）
- 唯一信号色（可根据用户需求进行选择）：使用场景：选中态，主按钮，当前状态指示

# Font
- Heading & Body: Glow Sans SC (url: https://resource-static.cdn.bcebos.com/fonts/GlowSansSC-Normal-Regular.woff2)
# Animation
## 元素动画
- 动画极简且线性。元素沿着网格线滑入到位；
## 入场动画
- 没有弹跳或弹性效果，页面滚动像文档一样自然，有缓动效果（ease-out）；
## 过渡动画
- 内容加载时采用淡入或轻微位移；
## 动画实现
- 项目中集成了 tailwindcss-intersect 插件，可以使用类似下述的方式来实现元素进入视口时的动画效果：
opacity-0 intersect:opacity-100 transition duration-700
- 同时可使用 motion/react 配合实现动画。

# Layout
- 内容被组织在清晰的模块中。大量留白用于区分不同区块，
- 偏好左对齐文本和结构化的图像排布，不做装饰性错位。

# Elements
- 偏好使用极简线性图表，统一笔画粗细，无填充
- 阴影 ≈ 0，边框 ≤ 1px，弱化按钮感，主按钮 ≠ 大色块，更多强调文字