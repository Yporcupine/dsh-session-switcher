// Session Switcher — browser half of the bundle.
//
// Hold Ctrl and tap Tab: a small floating "recent sessions" panel appears with
// the pending target highlighted, in the ChatGPT/Codex app's "recently viewed
// chat" order. Each further Tab press moves the highlight; releasing Ctrl opens
// the highlighted session and hides the panel. Ctrl+Shift+Tab cycles backwards;
// Escape cancels; clicking a row opens it directly.
//
// Ctrl+Tab is registered as a FIXED input action, not an editable shortcut
// command, on purpose: Desktop's native keyboard bridge intercepts accepted
// editable bindings before the page and Electron then omits the following
// modifier keyup, so an editable command could never learn that Ctrl was
// released. Fixed actions stay on the DOM input path, where the keyup is
// delivered normally; they appear read-only in Settings → Keyboard shortcuts.
//
// The panel is a `shell.overlay` occupant, so it floats above every column and
// only opts into pointer events while visible.

window.__ModuleLoader__.load({
  id: "dsh-session-switcher",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    /** React runtime from the shared module table; the panel is a plain hook component. */
    const React = require("react")
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = "sessionSwitcher"

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      "next.label": "切换到下一个最近会话",
      "previous.label": "切换到上一个最近会话",
      "overlay.title": "最近会话",
      "overlay.hint": "松开修饰键打开 · Esc 取消",
      "overlay.current": "当前",
      "overlay.running": "运行中",
      "time.now": "刚刚",
      "time.minutes": "{n} 分钟前",
      "time.hours": "{n} 小时前",
      "time.days": "{n} 天前"
    }

    /** English dictionary (same key set). */
    const en = {
      "next.label": "Switch to next recent session",
      "previous.label": "Switch to previous recent session",
      "overlay.title": "Recent sessions",
      "overlay.hint": "Release the modifier to open · Esc to cancel",
      "overlay.current": "Current",
      "overlay.running": "Running",
      "time.now": "just now",
      "time.minutes": "{n}m ago",
      "time.hours": "{n}h ago",
      "time.days": "{n}d ago"
    }

    /**
     * Fixed input bindings. Control is used on every platform: Desktop's
     * Command+Tab is the macOS application switcher and never reaches a window.
     */
    const NEXT_BINDING = { code: "Tab", modifiers: ["control"] }
    const PREVIOUS_BINDING = { code: "Tab", modifiers: ["control", "shift"] }

    /** Normalized modifier name → DOM flag that stays true while it is held. */
    const MODIFIER_FLAGS = { control: "ctrlKey", alt: "altKey", shift: "shiftKey", meta: "metaKey" }

    /** Styles for the floating switcher; the colors/spacing follow host menu patterns. */
    const OVERLAY_CSS = `
.dshWs-root{position:fixed;top:15vh;left:50%;z-index:1100;box-sizing:border-box;width:min(380px,calc(100vw - 40px));padding:5px;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);transform:translateX(-50%);pointer-events:auto;animation:dshWsIn .12s ease-out}
@keyframes dshWsIn{from{opacity:0;transform:translateX(-50%) translateY(-6px) scale(.985)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
@media (prefers-reduced-motion:reduce){.dshWs-root{animation:none}}
.dshWs-header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:3px 9px 6px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
.dshWs-heading{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:.2px}
.dshWs-hint{flex:none;white-space:nowrap;opacity:.85}
.dshWs-list{display:flex;flex-direction:column;gap:1px;overflow-y:auto;max-height:min(420px,56vh);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--dsh-scrollbar-width:6px}
.dshWs-row{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:40px;margin:0;padding:6px 9px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dshWs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshWs-row:focus{outline:none}
.dshWs-row[data-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent)}
.dshWs-main{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.dshWs-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:510}
.dshWs-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dshWs-current{flex:none;padding:0 6px;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.dshWs-spinner{flex:none;color:var(--dsw-alias-label-tertiary)}
.dshWs-spinnerMotion{transform-origin:center;animation:dshWsSpin 1.5s linear infinite}
.dshWs-spinnerTrack,.dshWs-spinnerArc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.dshWs-spinnerTrack{opacity:.25}
.dshWs-spinnerArc{stroke-dasharray:12 150;animation:dshWsDash 1.5s ease-in-out infinite}
@keyframes dshWsSpin{to{transform:rotate(360deg)}}
@keyframes dshWsDash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}to{stroke-dasharray:12 150;stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.dshWs-spinnerMotion,.dshWs-spinnerArc{animation:none}.dshWs-spinnerArc{stroke-dasharray:18 150;stroke-dashoffset:-3}}
`

    /**
     * Read the session currently retained by the main view.
     * @param list - current Session list snapshot.
     * @returns the main view's Session id, or undefined when no Session is open.
     */
    function mainSessionId(list) {
      for (const id of list.ids) {
        const row = list.byId[id]
        if (row !== undefined && (row.retainedBy?.mainView ?? 0) > 0) return id
      }
      for (const row of Object.values(list.byId)) {
        if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
      }
      return undefined
    }

    /**
     * Visible sessions ordered by recency, mirroring the sidebar's default
     * order: most recently updated first, subagent children and archived
     * sessions excluded, and only the selected blank session shown. The
     * selected blank session stays first, as in the sidebar.
     * @param sessions - Client Sessions service.
     * @param workspaces - Client Workspaces service.
     * @returns ordered ids plus the current id, or undefined while the list is not ready.
     */
    function recentSessionIds(sessions, workspaces) {
      const list = sessions.list.getSnapshot()
      if (list.phase !== "ready") return undefined
      const workspace = workspaces.list.getSnapshot()
      const archived = new Set(workspace?.archivedSessionIds ?? [])
      const currentId = mainSessionId(list)
      const rows = []
      for (const id of list.ids) {
        const row = list.byId[id]
        if (row === undefined) continue
        if (row.origin === "subagent") continue
        if (archived.has(id)) continue
        if (row.blank === true && id !== currentId) continue
        rows.push({
          id,
          blank: row.blank === true,
          updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0
        })
      }
      rows.sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      })
      const currentRow = rows.find((row) => row.id === currentId)
      if (currentRow !== undefined && currentRow.blank) {
        rows.splice(rows.indexOf(currentRow), 1)
        rows.unshift(currentRow)
      }
      return { ids: rows.map((row) => row.id), currentId }
    }

    /**
     * Capture the panel rows in "recently viewed" order, matching the
     * ChatGPT/Codex desktop switcher ("Next recently viewed chat"): the current
     * Session first, then previously viewed Sessions, then never-viewed
     * Sessions in sidebar recency order. Each row keeps its title, owning
     * Workspace title, and durable activity time.
     * @param sessions - Client Sessions service.
     * @param workspaces - Client Workspaces service.
     * @returns captured switch list, or undefined while the Session list is not ready.
     */
    function switchItems(sessions, workspaces) {
      const state = recentSessionIds(sessions, workspaces)
      if (state === undefined) return undefined
      const list = sessions.list.getSnapshot()
      const workspaceTitles = new Map()
      for (const workspace of workspaces.list.getSnapshot().items ?? []) {
        for (const id of workspace.sessionIds ?? []) {
          if (!workspaceTitles.has(id)) workspaceTitles.set(id, workspace.title)
        }
      }
      const allowed = new Set(state.ids)
      const ordered = []
      const push = (id) => {
        if (typeof id !== "string" || !allowed.has(id) || ordered.includes(id)) return
        ordered.push(id)
      }
      push(state.currentId)
      for (const id of visitHistory) push(id)
      for (const id of state.ids) push(id)
      return {
        currentId: state.currentId,
        items: ordered.map((id) => {
          const row = list.byId[id]
          const displayTitle = row?.displayTitle
          return {
            id,
            title: typeof displayTitle === "string" && displayTitle !== "" ? displayTitle : id,
            workspace: workspaceTitles.get(id) ?? "",
            updatedAt: typeof row?.updatedAt === "number" ? row.updatedAt : 0,
            running: row?.running === true
          }
        })
      }
    }

    /** Compact age label for one row; unknown or missing timestamps render nothing. */
    function ageLabel(updatedAt, t) {
      if (typeof updatedAt !== "number" || updatedAt <= 0) return ""
      const delta = Date.now() - updatedAt
      if (!Number.isFinite(delta)) return ""
      if (delta < 60000) return t("time.now")
      const minutes = Math.floor(delta / 60000)
      if (minutes < 60) return t("time.minutes", { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t("time.hours", { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 7) return t("time.days", { n: days })
      try {
        return new Date(updatedAt).toLocaleDateString()
      } catch (error) {
        return ""
      }
    }

    /**
     * Recently viewed Sessions, most recent first. Mirrors the ChatGPT/Codex
     * desktop cycle semantics ("Next recently viewed chat"): the panel commits
     * to a visit-history order, seeded with the current Session and then with
     * never-viewed Sessions in recency order.
     */
    const visitHistory = []

    /** Move one Session to the front of the recently-viewed order. */
    function recordVisit(id) {
      if (typeof id !== "string" || id === "") return
      const index = visitHistory.indexOf(id)
      if (index !== -1) visitHistory.splice(index, 1)
      visitHistory.unshift(id)
      if (visitHistory.length > 30) visitHistory.length = 30
    }

    /**
     * Transient panel state shared by the fixed input, the key listeners, and
     * the `shell.overlay` component. `modifiers` names the binding in effect so
     * the panel commits on the modifier that opened it.
     */
    const overlay = {
      state: { visible: false, items: [], index: 0, currentId: undefined, modifiers: [] },
      listeners: new Set(),
      get() {
        return this.state
      },
      set(next) {
        this.state = next
        for (const listener of [...this.listeners]) {
          try {
            listener()
          } catch (error) {
            console.error("session-switcher: overlay listener failed", error)
          }
        }
      },
      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }
    }

    /**
     * True while the current pointer gesture started inside the panel. DSH
     * resets pending fixed sequences on every document `pointerdown`; a press on
     * the panel is a selection gesture, so that reset must not cancel the panel.
     */
    let pointerInPanel = false

    /** Hide the panel without switching, keeping the current Session. */
    function close() {
      const state = overlay.get()
      if (!state.visible) return
      overlay.set({ visible: false, items: [], index: 0, currentId: undefined, modifiers: [] })
    }

    /** Open a Session by id; every exit path funnels here so failures stay local. */
    function openSessionId(ctx, id) {
      try {
        ctx.uiWorkspace.openSession(id)
      } catch (error) {
        console.error("session-switcher: opening the target session failed", error)
      }
    }

    /** Open the panel with the pending target highlighted one step from the current Session. */
    function openSwitcher(ctx, direction, modifiers) {
      const snapshot = switchItems(ctx.sessions, ctx.workspaces)
      if (snapshot === undefined || snapshot.items.length <= 1) return false
      const length = snapshot.items.length
      const base = snapshot.currentId === undefined
        ? -1
        : snapshot.items.findIndex((item) => item.id === snapshot.currentId)
      const index = base === -1
        ? (direction > 0 ? 0 : length - 1)
        : (base + direction + length) % length
      overlay.set({
        visible: true,
        items: snapshot.items,
        index,
        currentId: snapshot.currentId,
        modifiers: [...modifiers]
      })
      return true
    }

    /** Move the highlight one entry in the given direction. */
    function advance(direction) {
      const state = overlay.get()
      if (!state.visible || state.items.length === 0) return
      const length = state.items.length
      overlay.set({ ...state, index: (state.index + direction + length) % length })
    }

    /** Open the highlighted Session and hide the panel. */
    function commit(ctx) {
      const state = overlay.get()
      if (!state.visible) return
      const item = state.items[state.index]
      close()
      if (item !== undefined) openSessionId(ctx, item.id)
    }

    /** Normalize a keyup event to the modifier it released, if any. */
    function releasedModifier(event) {
      if (event.key === "Control" || event.code === "ControlLeft" || event.code === "ControlRight") return "control"
      if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") return "shift"
      if (event.key === "Alt" || event.code === "AltLeft" || event.code === "AltRight") return "alt"
      if (event.key === "Meta" || event.code === "MetaLeft" || event.code === "MetaRight") return "meta"
      return undefined
    }

    /** Consume an event so the app underneath does not also react. */
    function consume(event) {
      event.preventDefault()
      if (typeof event.stopPropagation === "function") event.stopPropagation()
    }

    /**
     * Whether a pointer event targets the visible panel. The target check covers
     * normal DOM presses; the composed path covers targets wrapped by another
     * document boundary.
     * @param event - pointer event.
     * @returns true when the press belongs to the panel.
     */
    function pointerTargetsPanel(event) {
      const target = event.target
      if (typeof Element !== "undefined" && target instanceof Element) {
        return target.closest("[data-session-switcher-panel]") !== null
      }
      const path = typeof event.composedPath === "function" ? event.composedPath() : []
      return path.some((node) => node !== null && typeof node === "object" && typeof node.hasAttribute === "function" && node.hasAttribute("data-session-switcher-panel"))
    }

    /**
     * Build the fixed-input observer. Fixed actions receive DOM keyboard input
     * (the native bridge only intercepts editable bindings), which is what makes
     * the modifier keyup observable for the release-to-commit step.
     * @param ctx - this plugin's Client context.
     * @returns observer for `ctx.shortcuts.observeFixedInput`.
     */
    function fixedInputObserver(ctx) {
      return (input) => {
        if (input.type === "reset") {
          // Every pointerdown resets pending fixed sequences. A press inside the
          // panel starts a selection, so keep it mounted until its click runs;
          // only a press elsewhere (or a focus/blur reset) cancels the panel.
          if (!pointerInPanel) close()
          return
        }
        const gesture = input.gesture
        const context = input.context
        if (gesture === undefined || gesture.code !== "Tab") return
        if (gesture.repeat === true || gesture.composing === true || gesture.defaultPrevented === true) return
        if (gesture.control !== true || gesture.alt === true || gesture.meta === true) return
        // A modal (Settings, an approval, a question) owns the window; leave its keys alone.
        if (context !== undefined && context.modal !== null && context.modal !== undefined) return
        const direction = gesture.shift === true ? -1 : 1
        const modifiers = direction > 0 ? NEXT_BINDING.modifiers : PREVIOUS_BINDING.modifiers
        if (overlay.get().visible) {
          input.consume()
          advance(direction)
          return
        }
        const snapshot = switchItems(ctx.sessions, ctx.workspaces)
        if (snapshot === undefined || snapshot.items.length <= 1) return
        input.consume()
        openSwitcher(ctx, direction, modifiers)
      }
    }

    /**
     * Build the floating panel component for one plugin instance.
     * @param ctx - this plugin's Client context.
     * @param t - translate function bound to {@link NS}.
     * @returns a React component the `shell.overlay` slot can render.
     */
    function createOverlay(ctx, t) {
      function useOverlayState() {
        const [snapshot, setSnapshot] = React.useState(overlay.get())
        React.useEffect(() => overlay.subscribe(() => {
          setSnapshot(overlay.get())
        }), [])
        return snapshot
      }

      function choose(id) {
        close()
        openSessionId(ctx, id)
      }

      function rowOf(item, index, state, running) {
        const meta = [item.workspace, ageLabel(item.updatedAt, t)].filter((part) => part !== "").join(" · ")
        return h("button", {
          key: item.id,
          type: "button",
          role: "option",
          className: "dshWs-row",
          "aria-selected": index === state.index,
          "data-selected": index === state.index ? "true" : undefined,
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => choose(item.id)
        },
          h("span", { className: "dshWs-main" },
            h("span", { className: "dshWs-label" }, item.title),
            meta === "" ? null : h("span", { className: "dshWs-meta" }, meta)
          ),
          item.id === state.currentId ? h("span", { className: "dshWs-current" }, t("overlay.current")) : null,
          running
            ? h("svg", {
              className: "dshWs-spinner",
              width: 14,
              height: 14,
              viewBox: "0 0 24 24",
              role: "img",
              "aria-label": t("overlay.running"),
              "data-state": "ongoing"
            },
              h("g", { className: "dshWs-spinnerMotion" },
                h("circle", { className: "dshWs-spinnerTrack", cx: "12", cy: "12", r: "9.5" }),
                h("circle", { className: "dshWs-spinnerArc", cx: "12", cy: "12", r: "9.5" })
              )
            )
            : null
        )
      }

      return function SessionSwitcherOverlay(props) {
        const state = useOverlayState()
        // The frame's slot scope publishes live Session status; fall back to the
        // list snapshot's cached `running` hint when it is not provided.
        const statusHook = props !== null && typeof props === "object" ? props.useSessionStatus : undefined
        const statuses = typeof statusHook === "function" ? statusHook((snapshot) => snapshot) : undefined
        const isRunning = (item) => {
          const status = typeof statuses?.get === "function" ? statuses.get(item.id) : undefined
          if (status !== undefined) return status.running === true
          return item.running === true
        }
        const list = React.useRef(null)
        React.useEffect(() => {
          if (!state.visible || list.current === null) return
          const selected = list.current.querySelector("[data-selected='true']")
          if (selected !== null && typeof selected.scrollIntoView === "function") {
            selected.scrollIntoView({ block: "nearest" })
          }
        }, [state.visible, state.index])
        if (!state.visible) return null
        return h("div", {
          className: "dshWs-root",
          "data-session-switcher-panel": "true",
          role: "dialog",
          "aria-label": t("overlay.title")
        },
          h("style", { key: "style" }, OVERLAY_CSS),
          h("div", { className: "dshWs-header", key: "header" },
            h("span", { className: "dshWs-heading" }, t("overlay.title")),
            h("span", { className: "dshWs-hint" }, t("overlay.hint"))
          ),
          h("div", { className: "dshWs-list", key: "list", ref: list, role: "listbox" },
            state.items.map((item, index) => rowOf(item, index, state, isRunning(item)))
          )
        )
      }
    }

    /** Services the browser half reads. */
    const inject = ["locale", "shortcuts", "sessions", "workspaces", "uiWorkspace", "slots"]

    /** Register the dictionary, panel, fixed actions, input, and recent-view order. */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-switcher: dictionaries")
      const t = ctx.locale.bind(NS)

      const Overlay = createOverlay(ctx, t)
      ctx.effect(() => ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "session-switcher-overlay",
        order: 40
      }, Overlay)), "session-switcher: switcher overlay")

      // Track the main view so the panel can offer "recently viewed" order.
      ctx.effect(() => {
        let lastId
        const sync = () => {
          const currentId = mainSessionId(ctx.sessions.list.getSnapshot())
          if (currentId === undefined || currentId === lastId) return
          lastId = currentId
          recordVisit(currentId)
        }
        sync()
        return ctx.sessions.list.subscribe(sync)
      }, "session-switcher: recently viewed order")

      // Read-only reference rows in Settings → Keyboard shortcuts.
      const rows = [
        { id: "session.switchNext", labelKey: "next.label", binding: NEXT_BINDING },
        { id: "session.switchPrevious", labelKey: "previous.label", binding: PREVIOUS_BINDING }
      ]
      for (const row of rows) {
        ctx.effect(() => ctx.shortcuts.registerFixed({
          id: row.id,
          label: () => t(row.labelKey),
          keys: ctx.shortcuts.describeBinding(row.binding).keys,
          bindings: [row.binding],
          group: "application"
        }), "session-switcher: " + row.id + " reference row")
      }

      // The fixed observer opens/advances the panel on Ctrl+Tab.
      ctx.effect(() => ctx.shortcuts.observeFixedInput(fixedInputObserver(ctx)), "session-switcher: switch input")

      // The panel observes the modifier release, cancellation keys, and a focus
      // or pointer exit as page-level input.
      ctx.effect(() => {
        const onKeyUp = (event) => {
          const state = overlay.get()
          if (!state.visible) return
          const released = releasedModifier(event)
          if (released === undefined || !state.modifiers.includes(released)) return
          const stillHeld = state.modifiers.filter((modifier) => event[MODIFIER_FLAGS[modifier]] === true)
          if (stillHeld.length === 0) commit(ctx)
        }
        const onKeyDown = (event) => {
          if (!overlay.get().visible) return
          if (event.key === "Escape") {
            consume(event)
            close()
            return
          }
          if (event.key === "Enter") {
            consume(event)
            commit(ctx)
            return
          }
          if (event.key === "ArrowDown") {
            consume(event)
            advance(1)
            return
          }
          if (event.key === "ArrowUp") {
            consume(event)
            advance(-1)
          }
        }
        // Window capture runs before the document capture listeners that emit
        // the fixed-input reset, so the panel can classify the press first.
        const onPointerDownCapture = (event) => {
          pointerInPanel = overlay.get().visible && pointerTargetsPanel(event)
        }
        const onPointerEndCapture = () => {
          pointerInPanel = false
        }
        const onPointerDown = (event) => {
          if (!overlay.get().visible) return
          if (pointerTargetsPanel(event)) return
          close()
        }
        const onBlur = () => {
          pointerInPanel = false
          close()
        }
        window.addEventListener("keyup", onKeyUp, true)
        window.addEventListener("keydown", onKeyDown, true)
        window.addEventListener("blur", onBlur)
        document.addEventListener("pointerdown", onPointerDown, true)
        window.addEventListener("pointerdown", onPointerDownCapture, true)
        window.addEventListener("pointerup", onPointerEndCapture, true)
        window.addEventListener("pointercancel", onPointerEndCapture, true)
        return () => {
          window.removeEventListener("keyup", onKeyUp, true)
          window.removeEventListener("keydown", onKeyDown, true)
          window.removeEventListener("blur", onBlur)
          document.removeEventListener("pointerdown", onPointerDown, true)
          window.removeEventListener("pointerdown", onPointerDownCapture, true)
          window.removeEventListener("pointerup", onPointerEndCapture, true)
          window.removeEventListener("pointercancel", onPointerEndCapture, true)
        }
      }, "session-switcher: switcher input")
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
