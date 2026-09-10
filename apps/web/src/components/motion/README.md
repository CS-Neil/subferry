# motion-primitives 组件目录

本目录存放 motion-primitives（github.com/ibelick/motion-primitives，MIT 许可证）风格的动效组件。
按照 readme.md 8.3 的约定，这类组件独立放在 `src/components/motion/`，不与 `src/components/ui/`
（shadcn/ui）混放，避免同名文件互相覆盖。

## 当前状态：手写降级实现

M1 开发时，本机沙箱环境无法访问 `motion-primitives.com`（DNS/SSL 连接失败），因此
`text-shimmer.tsx`、`animated-number.tsx` 不是通过

```bash
npx shadcn@latest add "https://motion-primitives.com/c/text-shimmer.json" --path src/components/motion
npx shadcn@latest add "https://motion-primitives.com/c/animated-number.json" --path src/components/motion
```

拉取的，而是手写的等价实现：

| 组件 | 实现方式 | 与上游的差异 |
|---|---|---|
| `TextShimmer` | 纯 CSS 渐变文字 + `@keyframes shimmer`（定义在 `src/index.css`） | 视觉效果接近，但不支持上游全部的 spread/duration 细节参数组合 |
| `AnimatedNumber` | 用 `motion` 包的 `useSpring` + `useTransform`，机制与上游一致 | 只实现了 M1 用到的 `value`/`className`/`springOptions` 几个 props |

两者对外的 props 接口都尽量和上游保持一致，等网络可用时可以直接用上面的命令覆盖这两个文件，
调用方（`components/app/*`）代码不需要改动。

## 同步记录

| 组件 | 来源 | 上游提交号 | 日期 |
|---|---|---|---|
| TextShimmer | 手写（网络不可达，未拉取上游源码） | — | M1 开发时 |
| AnimatedNumber | 手写（网络不可达，未拉取上游源码） | — | M1 开发时 |

M2/M3 若需要接入更多 motion-primitives 组件（BorderTrail、AnimatedBackground、TransitionPanel、
AnimatedGroup、MorphingDialog、Disclosure、TextMorph、ToolbarExpandable、TextScramble、
GlowEffect、ScrollProgress、TextEffect，见 readme.md 8.5），在网络可用的环境下按上面的命令拉取，
并在这张表里补充记录来源与上游提交号，同时保留 MIT 许可声明。
