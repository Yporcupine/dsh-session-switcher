# Session Switcher

English overview below · 完整详细文档为简体中文，见 [中文说明](#中文说明)

Session Switcher (`dsh-session-switcher`) is a plugin for **DSH Desktop** that brings hold-to-switch navigation to your recently viewed sessions. Hold `Ctrl` and tap `Tab` to open a floating list of recent sessions with the next target highlighted; tap `Tab` again to move down, then release the modifier(s) to open the highlighted session (`Ctrl+Shift+Tab` moves backwards and `Esc` cancels). The highlight moves while the modifier is held, so you can skip past sessions before committing on release. It is built for DSH Desktop: in a browser tab `Ctrl+Tab` belongs to the browser, so the plugin won't fire there.

| Keys | Action |
| --- | --- |
| Hold `Ctrl`, tap `Tab` | Open the list and highlight the next recently viewed session; tap again to move down |
| `Ctrl` + `Shift` + `Tab` | Move the highlight backwards |
| Release the modifier(s) | Open the highlighted session and close the list |
| `Esc` | Cancel without switching |
| `Enter` / click a row | Open that session immediately |
| `↑` / `↓` | Move the highlight while the list is open |
| Click outside / window blur | Cancel |

## 安装 / Installation

### 从插件管理器安装（推荐）/ Install from the plugin manager

The plugin is a normal DSH bundle, so DSH's own plugin manager can install and enable it:

1. Open the **Plugins** page in DSH (the plugin manager page in the sidebar; 中文界面为「插件」).
2. Select **Add plugin** → **Install a third-party plugin**（「添加插件」→「安装第三方插件」）.
3. Enter the repository address and select **Install**:

   ```text
   https://github.com/Yporcupine/dsh-session-switcher
   ```

4. If DSH asks for a restart, restart DSH Desktop. The installer adds the dependency to your profile and enables the bundle for you; no manual configuration is needed.

To disable or uninstall the plugin later, use the same **Plugins** page.

### 命令行安装 / Install with the CLI

The same installation is available from the `dsh` CLI:

```bash
dsh plugin add https://github.com/Yporcupine/dsh-session-switcher
```

Use `--profile <name>` to target a specific profile (for example `dsh plugin --profile desktop add ...`). The CLI may ask you to restart DSH afterwards. You can also install the release tarball — paste the download link of the `dsh-session-switcher-1.3.0.tgz` asset from the [Releases page](https://github.com/Yporcupine/dsh-session-switcher/releases) into the same dialog or command.

### 本地开发安装 / Local checkout (development)

To hack on the plugin, run a checkout as a linked bundle. Prefer DSH's own installer — it writes the `link:` dependency **and** runs the profile's package install, so the checkout is linked into the profile; editing the manifest by hand alone skips that step and the bundle is skipped at startup.

1. Clone the repository into your DSH bundles directory (`~/.dsh/bundles/`; Windows: `%USERPROFILE%\.dsh\bundles\`):

   ```bash
   # macOS / Linux
   git clone https://github.com/Yporcupine/dsh-session-switcher.git ~/.dsh/bundles/session-switcher
   ```

   ```powershell
   # Windows (PowerShell)
   git clone https://github.com/Yporcupine/dsh-session-switcher.git "$env:USERPROFILE\.dsh\bundles\session-switcher"
   ```

2. Install the checkout through the same add-plugin flow, pointing it at the local directory: **Plugins** page → **Add plugin** → **Install a third-party plugin** → enter the absolute path of the checkout (`/home/<you>/.dsh/bundles/session-switcher`, `/Users/<you>/.dsh/bundles/session-switcher`, or `C:/Users/<you>/.dsh/bundles/session-switcher`). Or use the CLI:

   ```bash
   dsh plugin --profile desktop add /home/<you>/.dsh/bundles/session-switcher
   ```

   DSH records a `link:` dependency, installs it into the profile, and enables the bundle.

3. Restart DSH Desktop. After later edits to the checkout, restart DSH Desktop (or disable and re-enable the bundle on the **Plugins** page) to remount the client module.

#### 手动回退 / Fallback: edit the profile manifest by hand

Only if the installer cannot be used. Edit the DSH Desktop profile manifest, `~/.dsh/profiles/desktop/package.json` (Windows: `%USERPROFILE%\.dsh\profiles\desktop\package.json`), to add the dependency and the bundle selection:

```json
{
  "dependencies": {
    "dsh-session-switcher": "link:/home/<you>/.dsh/bundles/session-switcher"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-session-switcher"]
    }
  }
}
```

Use the absolute path of your clone: `/home/<you>/...` on Linux, `/Users/<you>/...` on macOS, `C:/Users/<you>/...` on Windows (JSON paths use forward slashes on every OS); from the profile directory the relative form `link:../../bundles/session-switcher` resolves to the same location. Then relink and reinstall the profile — without this the linked package never reaches `node_modules` and the bundle is skipped:

```bash
dsh plugin --profile desktop install
```

Restart DSH Desktop afterwards.

> **浏览器 / Browser:** the shortcuts target DSH Desktop. In a browser tab `Ctrl+Tab` belongs to the browser, so the plugin won't fire there.

## 中文说明

DSH Desktop 插件：按住 `Ctrl` 敲 `Tab`，弹出「最近会话」浮动小窗，高亮待切换的会话；
**松开修饰键即打开高亮会话**并收起小窗。

| 操作 | 效果 |
| --- | --- |
| `Ctrl+Tab`（按住 Ctrl 连按 Tab） | 打开浮动窗，高亮「下一个最近查看的会话」；继续按 Tab 依次下移 |
| `Ctrl+Shift+Tab` | 反向移动高亮 |
| 松开修饰键 | 打开高亮会话，关闭小窗 |
| `Esc` | 取消，不切换 |
| `Enter` / 鼠标点击某一行 | 立即打开该会话 |
| `↑` / `↓` | 移动高亮（小窗打开时） |
| 点击小窗外 / 窗口失焦 | 取消 |

- 插件按 DSH Desktop 设计：浏览器里 `Ctrl+Tab` 归浏览器所有，插件不会被触发。
- macOS 同样使用 `Ctrl+Tab` / `Ctrl+Shift+Tab`（`Cmd+Tab` 是系统应用切换，应用收不到）。

### 实现要点：为什么用 fixed 输入而不是可编辑快捷键

DSH Desktop 的**原生键盘桥**会先于页面拦截「可编辑快捷键」的按键组合，然后 Electron
会吞掉随后的**修饰键 keyup**（DSH 官方 shortcuts 文档的 “Understand the implementation” 一节
也说明：Electron 在原生拦截之后可能省略 keyup）。一旦 `Ctrl` 的 keyup 到不了页面，浮动窗就无法知道「Ctrl 已松开」，
只能等下一次按键——这正是早期版本「松开 Ctrl 无反应、要再按一次 Ctrl 才切换」的根因
（已用合成按键 + UI Automation 实测复现：`Ctrl+Tab`、`Ctrl+B` 等任何可编辑快捷键之后
都收不到 `keyup`）。

因此 `Ctrl+Tab` / `Ctrl+Shift+Tab` 注册为 **fixed 输入动作**（`ctx.shortcuts.registerFixed`
+ `ctx.shortcuts.observeFixedInput`）：fixed 动作不走原生桥拦截，留在正常的 DOM 输入路径，
修饰键 keyup 可以正常收到，于是「松手提交」可靠。代价是这两行在
**Settings → Keyboard shortcuts**（`Mod+/`）里显示为只读条目（Application 分组，键帽
`Ctrl + Tab` / `Ctrl + Shift + Tab`），不能改键；不想要时停用/卸载插件即可。

#### 为什么点击行曾「只关窗、不切换」（已修复）

DSH 的 shortcuts 服务在**每个 `pointerdown`** 上都会给 fixed 输入观察者发一次
`{ type: "reset" }`（用于中断多键序列）。早期版本把 reset 一律当作取消：鼠标按下瞬间
小窗就被卸载，行的 React `click` 永远来不及触发——于是「点一下小窗消失，但会话没切换」。
现在的做法是：在 **window 捕获阶段**（早于 shortcuts 服务的 document 捕获 reset）先判断
这次按下是否落在小窗内；**落在窗内的按下不算取消**，只吞掉紧接着的 reset，让行正常收到
click 并切换；点到窗外仍然立即取消。松开指针（`pointerup`/`pointercancel`）后恢复常规
reset 行为。

### 参考实现

当前 ChatGPT / Codex 桌面端（2026，版本 26）把 `Ctrl+Tab` 定义为 **“Next recently viewed chat”**，
`Ctrl+Shift+Tab` 为 **“Previous recently viewed chat”**（另有 `Ctrl+PageDown/PageUp`、
`Ctrl+Shift+]`/`[` 等别名）；Codex 应用更新日志也提到加入了「跳转到最近线程的键盘快捷键」。
本插件按这个语义实现：

- 列表 = **最近查看顺序（MRU）**：当前会话 → 查看历史（最近查看的在前）→ 其余会话按侧边栏
  最近更新排序；每次查看会话都会更新查看历史；
- 按住修饰键时只移动高亮，**松开才切换**（VS Code / Alt-Tab 式 hold-modifier switcher）；
- 列表跳过已归档会话和子代理（subagent）会话；当前未开始的新会话排在最前。

参考链接：

- <https://defkey.com/chatgpt-windows-app-2026-shortcuts>（ChatGPT Windows App 26.x 快捷键表）
- <https://learn.chatgpt.com/docs/changelog?type=codex-app>（Codex app 更新日志）

### 样式

面板沿用 DSH 菜单样式：`--dsw-specific-menu` 表面、`--dsw-elevation-prominent` 阴影、
`--dsw-radius-xl` 圆角、`--dsw-alias-state-business-primary` 选中强调色，跟随明暗主题；
行内显示会话标题、所属工作区与相对时间，当前会话带「当前」标记。

某一行的会话**正在运行**（active turn）时，行右侧显示一个 14px 的旋转圆圈，复用 DSH
侧边栏 `StateDot` 的 ongoing 外观：1.5s 线性旋转 + 1.5s 虚线弧动画，描边继承
`--dsw-alias-label-tertiary`；`prefers-reduced-motion` 下两段动画停止、弧固定。运行状态
来自 frame 槽作用域提供的 `useSessionStatus` 钩子（实时订阅），取不到时回退到会话列表
快照里的 `running` 提示；它会和「当前」标记并排显示，但始终位于最右侧。

### 文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包清单：`dsh.bundle.patch` 声明 bundle 补丁，`dsh.client` 声明浏览器半体 |
| `cordis.patch.yml` | 向 profile 配置树插入 Host 行 `session-switcher` |
| `index.js` | Host 半体（无需挂载任何服务，空 `apply`） |
| `client.js` | 浏览器半体：fixed 输入动作 + `shell.overlay` 浮动窗 + 页面级 keyup/keydown 负责「松手提交 / Esc 取消」，并订阅会话列表维护最近查看顺序；window 捕获阶段区分「点中面板」与「点外取消」；运行中的会话行右侧渲染 `useSessionStatus` 旋转圆圈；内置中英文运行时文案 |
| `locale/*.json` | 插件市场/设置页里的标题与描述（中英文） |
| `icon.svg` | 插件图标 |
| `verify-client.cjs` | 本地校验脚本（不参与运行时）：用桩 React/DOM/服务执行真实 `client.js`，验证 fixed 注册、最近查看排序、浮动窗状态机、松手提交、修饰键顺序、Esc/Enter/方向键、点击（含 shortcuts 服务 pointerdown reset 之后仍能点击）、运行中转圈及其回退、reset/失焦取消、过滤与样式令牌 |
| `LICENSE` | MIT 许可证（Copyright (c) 2026 Yporcupine） |
| `.gitignore` / `.gitattributes` | 仓库辅助文件：忽略依赖、日志与系统文件，统一文本换行为 LF |

运行校验（需要 Node.js；脚本只读取 `client.js`，不会创建任何文件）：

```bash
node verify-client.cjs
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Yporcupine.
