# motion-primitives 组件目录

本目录存放 motion-primitives（github.com/ibelick/motion-primitives，MIT 许可证）风格的动效组件。
按照 readme.md 8.3 的约定，这类组件独立放在 `src/components/motion/`，不与 `src/components/ui/`
（shadcn/ui）混放，避免同名文件互相覆盖。

## 当前状态：手写降级实现

开发时本机沙箱环境无法访问 `motion-primitives.com`（DNS/SSL 连接失败），因此下面的组件都不是
通过 `npx shadcn@latest add "https://motion-primitives.com/c/<name>.json" --path src/components/motion`
拉取的，而是手写的等价实现：API 形状尽量对齐上游，动画机制上能用 `motion` 库原生能力
（`useSpring`/`layoutId`/`AnimatePresence`）的都用了，只有个别组件做了简化。等网络可用时
可以用上面的命令逐个覆盖对应文件，调用方代码不需要改动。

## 组件清单（对应 readme.md 8.5 表格）

| 组件 | 文件 | 实现方式 | 用在哪里 |
|---|---|---|---|
| TextShimmer | text-shimmer.tsx | CSS 渐变扫光 | 任务状态"进行中"文字（全站唯一用法） |
| AnimatedNumber | animated-number.tsx | `useSpring`+`useTransform` | 进度百分比、已完成条目数 |
| SlidingNumber | sliding-number.tsx | 同上，语义上专用于整数计数 | 任务列表顶部统计 |
| BorderTrail | border-trail.tsx | CSS `@property --angle` + conic-gradient | 运行中任务卡片边框流光 |
| AnimatedBackground | animated-background.tsx | `layoutId` 共享布局动画 | 顶部导航高亮、校对页筛选分段控件 |
| TransitionPanel | transition-panel.tsx | `AnimatePresence mode="wait"` | 服务设置页切换服务商时的表单面板 |
| AnimatedGroup | animated-group.tsx | `staggerChildren` | 任务列表、项目列表首次加载 |
| MorphingDialog | morphing-dialog.tsx | **简化**：缩放淡入弹层，见下 | 术语条目点击展开编辑 |
| Disclosure | disclosure.tsx | `AnimatePresence` 高度展开 | 新建任务高级参数、翻译方案高级参数 |
| TextMorph | text-morph.tsx | **简化**：整体淡入淡出，见下 | 暂停/继续、复制/已复制、测试连接按钮 |
| ToolbarExpandable | toolbar-expandable.tsx | `AnimatePresence` | 校对页底部浮动工具栏 |
| TextScramble | text-scramble.tsx | `requestAnimationFrame` 逐字解码 | 登录页标题"字渡 SubFerry" |
| GlowEffect | glow-effect.tsx | `boxShadow` 动画 | 新建任务拖拽区域 |
| ScrollProgress | scroll-progress.tsx | `useSpring` 驱动 `scaleX` | 校对页顶部阅读进度 |
| TextEffect | text-effect.tsx | 淡入+位移 | 空状态提示文字 |

## 已知简化

- **MorphingDialog**：真正的实现用共享 `layoutId` 让弹层从触发元素的原始位置"长出来"
  （FLIP 动画）；这里简化成从屏幕中心缩放淡入，没有做位置续接。
- **TextMorph**：上游对每个字符做独立的形变动画；这里简化成整体内容的淡入淡出，视觉效果
  接近（按钮本身不跳动），但不是逐字符 morph。
- **TextScramble 的第二处用法未接入**：readme.md 8.5 还提到"校对页当前可见行收到新译文时
  播放一次解码动画"，这需要把 SSE 批次完成事件精确对应到虚拟列表当前可见的行，属于锦上添花
  的细节，M2 没有实现，只接了登录页标题这一处。
- **TransitionPanel 只接了一处**：readme.md 8.5 的另一处用法"新建任务向导的三步切换"要求
  先有一个多步向导，M1/M2 的新建任务页是单页表单，没有这个向导，所以只在服务设置页的
  表单切换上用了它。

## 同步记录

| 组件 | 来源 | 上游提交号 | 日期 |
|---|---|---|---|
| 以上全部 15 个组件 | 手写（网络不可达，未拉取上游源码） | — | M1/M2 开发时 |
