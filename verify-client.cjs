// Local harness for the shipped client.js: executes the real file with stubs and
// checks fixed-action registration, switcher state, commit/cancel paths, and order.
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8')

// ---- fake DOM element (client.js narrows pointer targets with `instanceof Element`)
class FakeElement {
  closest() {
    return null
  }
  hasAttribute() {
    return false
  }
}
globalThis.Element = FakeElement

/** Pointer target stub: reports the panel as its closest ancestor when inside. */
function fakeTarget(inPanel) {
  const target = new FakeElement()
  target.closest = (selector) => (inPanel && selector === '[data-session-switcher-panel]' ? target : null)
  target.hasAttribute = (name) => inPanel && name === 'data-session-switcher-panel'
  return target
}

// ---- fake React (createElement tree + hooks with no re-render) -------------
function createFakeReact() {
  return {
    createElement(type, props, ...children) {
      const flat = []
      const visit = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) visit(item)
        } else if (value !== null && value !== undefined && value !== false && value !== true) {
          flat.push(value)
        }
      }
      for (const child of children) visit(child)
      return { type, props: { ...(props ?? {}), children: flat } }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useRef() {
      return { current: null }
    },
    Fragment: Symbol('Fragment')
  }
}

// ---- fake DOM --------------------------------------------------------------
function makeFakeTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(listener)
    },
    removeEventListener(type, listener) {
      const bucket = listeners.get(type)
      const index = bucket === undefined ? -1 : bucket.indexOf(listener)
      if (index !== -1) bucket.splice(index, 1)
    },
    fire(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event ?? {})
    }
  }
}

function makeFakeDom() {
  return { window: makeFakeTarget(), document: makeFakeTarget() }
}

// ---- plugin loading -------------------------------------------------------
function loadPlugin() {
  let definition
  const dom = makeFakeDom()
  const window = {
    __ModuleLoader__: {
      load(def) {
        definition = def
      }
    },
    addEventListener: dom.window.addEventListener,
    removeEventListener: dom.window.removeEventListener,
    fire: dom.window.fire
  }
  globalThis.window = window
  globalThis.document = dom.document
  new Function('window', SOURCE)(window)
  assert.ok(definition, 'module loader registration missing')
  assert.equal(definition.id, 'dsh-session-switcher')
  assert.equal(typeof definition.factory, 'function')
  const fakeRequire = (name) => {
    if (name === 'react') return createFakeReact()
    throw new Error('unexpected require: ' + name)
  }
  return { plugin: definition.factory(fakeRequire), window, document: dom.document }
}

// ---- fake client context ---------------------------------------------------
function row(id, extra) {
  return { id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 0, ...extra }
}

function snapshot(rows, currentId, phase = 'ready') {
  const byId = {}
  for (const item of rows) byId[item.id] = item
  if (currentId !== undefined) byId[currentId] = { ...byId[currentId], retainedBy: { mainView: 1 } }
  return { ids: rows.map((item) => item.id), byId, phase, projectionsBySession: {} }
}

function makeContext(list, workspace) {
  const slots = []
  const fixed = []
  const observers = new Set()
  const opened = []
  const dicts = {}
  const subscribers = new Set()
  // Live session status map published by the frame's `sessionStatus` slot hook.
  const statuses = new Map()
  const ctx = {
    effect(callback) {
      return callback()
    },
    locale: {
      register(namespace, values) {
        dicts[namespace] = values
        return () => {}
      },
      bind(namespace) {
        return (key, params) => {
          let text = (dicts[namespace]?.en ?? {})[key] ?? key
          for (const [name, value] of Object.entries(params ?? {})) text = text.replace('{' + name + '}', String(value))
          return text
        }
      }
    },
    shortcuts: {
      registerFixed(command) {
        fixed.push(command)
        return () => {}
      },
      describeBinding(binding) {
        const labels = []
        for (const modifier of binding.modifiers) labels.push(modifier === 'control' ? 'Ctrl' : modifier === 'shift' ? 'Shift' : modifier)
        labels.push(binding.code)
        return { binding, keys: labels, issue: null, conflicts: [] }
      },
      observeFixedInput(listener) {
        observers.add(listener)
        return () => {
          observers.delete(listener)
        }
      }
    },
    sessions: {
      list: {
        getSnapshot: () => list,
        subscribe(listener) {
          subscribers.add(listener)
          return () => {
            subscribers.delete(listener)
          }
        }
      }
    },
    workspaces: { list: { getSnapshot: () => workspace } },
    uiWorkspace: {
      openSession(target) {
        opened.push(target)
      }
    },
    slots: {
      inject(owner, register) {
        register()
        return () => {}
      },
      register(options, component) {
        slots.push({ options, component })
        return () => {}
      }
    }
  }
  return { ctx, slots, fixed, observers, opened, list, subscribers, statuses }
}

function mount(list, workspace) {
  const loaded = loadPlugin()
  const made = makeContext(list, workspace)
  loaded.plugin.apply(made.ctx)
  return { ...loaded, ...made }
}

/** Deliver one fixed keydown gesture (defaults: Ctrl+Tab in the page region). */
function fireFixed(mounted, fields) {
  let consumed = 0
  const gesture = {
    code: 'Tab',
    control: true,
    alt: false,
    shift: false,
    meta: false,
    repeat: false,
    composing: false,
    defaultPrevented: false,
    ...fields
  }
  const context = fields?.context ?? { region: 'page', modal: null, target: null }
  for (const observer of [...mounted.observers]) {
    observer({ type: 'keydown', gesture, context, consume() { consumed++ } })
  }
  return { consumed }
}

/** Deliver the service's reset input (focus/modal/pointer/composition changes). */
function fireReset(mounted) {
  for (const observer of [...mounted.observers]) observer({ type: 'reset' })
}

function keyup(window, fields) {
  window.fire('keyup', {
    key: undefined,
    code: undefined,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...fields
  })
}

function keydown(window, fields) {
  let prevented = 0
  let stopped = 0
  const event = {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    preventDefault() { prevented++ },
    stopPropagation() { stopped++ },
    ...fields
  }
  window.fire('keydown', event)
  return { prevented, stopped }
}

/** Move the main view to another Session, as a sidebar click would. */
function setCurrent(mounted, sessionId) {
  for (const row of Object.values(mounted.list.byId)) {
    mounted.list.byId[row.id] = { ...row, retainedBy: {} }
  }
  mounted.list.byId[sessionId] = { ...mounted.list.byId[sessionId], retainedBy: { mainView: 1 } }
  for (const listener of [...mounted.subscribers]) listener()
}

/** Mark the given Sessions as running in the frame's live status map. */
function setRunning(mounted, ids) {
  mounted.statuses.clear()
  for (const id of ids) mounted.statuses.set(id, { running: true, pendingInteraction: undefined, completionUnread: false })
}

/** Render the registered overlay component once and collect its row buttons. */
function renderOverlay(mounted, options) {
  const entry = mounted.slots.find((slot) => slot.options.id === 'session-switcher-overlay')
  assert.ok(entry, 'switcher overlay slot not registered')
  const props = options?.withoutHooks === true ? undefined : {
    useSessionStatus: (selector) => selector(mounted.statuses)
  }
  const tree = entry.component(props)
  if (tree === null) return { tree, rows: [] }
  const list = tree.props.children.find((child) => child?.props?.role === 'listbox')
  assert.ok(list, 'listbox missing from overlay tree')
  const rowButtons = list.props.children.filter((child) => child?.props?.role === 'option')
  const selected = rowButtons.find((child) => child.props['data-selected'] === 'true')
  return { tree, rows: rowButtons, selected }
}

/** Row layout: [main(title, meta), currentBadge?, runningSpinner?]. */
function rowMain(rowButton) {
  return rowButton.props.children[0]
}
function rowTitle(rowButton) {
  return rowMain(rowButton).props.children[0].props.children[0]
}
function rowMeta(rowButton) {
  return rowMain(rowButton).props.children[1]
}
function rowBadge(rowButton) {
  return rowButton.props.children.find((child) => child?.props?.className === 'dshWs-current')
}
function rowSpinner(rowButton) {
  return rowButton.props.children.find((child) => child?.props?.className === 'dshWs-spinner')
}
function rowByTitle(view, title) {
  const found = view.rows.find((candidate) => rowTitle(candidate) === title)
  assert.ok(found, 'row not found: ' + title)
  return found
}

const base = Date.now()
const rows = () => [
  row('s1', { displayTitle: 'Alpha', updatedAt: base - 7200000 }),
  row('s2', { displayTitle: 'Beta', updatedAt: base - 5000 }),
  row('s3', { displayTitle: 'Gamma', updatedAt: base - 120000 })
]
const workspace = {
  phase: 'ready',
  items: [{ workspaceId: 'w1', title: 'dsh', sessionIds: ['s1', 's2', 's3'] }],
  archivedSessionIds: []
}

// --- registration ---------------------------------------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  assert.deepEqual(mounted.plugin.inject, ['locale', 'shortcuts', 'sessions', 'workspaces', 'uiWorkspace', 'slots'])
  assert.equal(mounted.fixed.length, 2, 'two fixed reference rows')
  const [next, previous] = mounted.fixed
  assert.equal(next.id, 'session.switchNext')
  assert.equal(previous.id, 'session.switchPrevious')
  assert.deepEqual(next.bindings, [{ code: 'Tab', modifiers: ['control'] }])
  assert.deepEqual(previous.bindings, [{ code: 'Tab', modifiers: ['control', 'shift'] }])
  assert.deepEqual(next.keys, ['Ctrl', 'Tab'])
  assert.deepEqual(previous.keys, ['Ctrl', 'Shift', 'Tab'])
  assert.equal(next.group, 'application')
  assert.equal(next.label(), 'Switch to next recent session')
  const overlayEntry = mounted.slots.find((slot) => slot.options.id === 'session-switcher-overlay')
  assert.deepEqual(overlayEntry.options, { name: 'shell.overlay', id: 'session-switcher-overlay', order: 40 })
  assert.equal(renderOverlay(mounted).tree, null, 'overlay renders nothing while closed')
}

// --- first Ctrl+Tab opens the panel without switching ---------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  const fired = fireFixed(mounted)
  assert.equal(fired.consumed, 1, 'the chord is consumed')
  assert.deepEqual(mounted.opened, [], 'no navigation before the modifier is released')
  const view = renderOverlay(mounted)
  assert.equal(view.rows.length, 3, 'all switchable sessions listed')
  // Recently-viewed order starts with the current Session (s1), then never-viewed
  // Sessions in recency order: s1, s2, s3. One tap highlights s2.
  assert.deepEqual(view.rows.map(rowTitle), ['Alpha', 'Beta', 'Gamma'])
  assert.equal(rowTitle(view.selected), 'Beta')
  assert.ok(rowMeta(view.rows[0]).props.children[0].includes('dsh'), 'meta line names the owning workspace')
  assert.equal(rowBadge(view.rows[0]).props.children[0], 'Current')
  assert.equal(view.rows[1].props.children.length, 1, 'non-current rows carry no badge')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s2'], 'releasing Ctrl opens the highlighted session')
}

// --- ordering follows visit history, like "Next recently viewed chat" -----
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  setCurrent(mounted, 's3')
  fireFixed(mounted)
  const view = renderOverlay(mounted)
  assert.deepEqual(view.rows.map(rowTitle), ['Gamma', 'Alpha', 'Beta'])
  assert.equal(rowTitle(view.selected), 'Alpha', 'next goes to the previously viewed chat, not the newest activity')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s1'])
}

// --- repeated Tab presses while Ctrl is held move the highlight -----------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  fireFixed(mounted)
  assert.deepEqual(mounted.opened, [])
  const view = renderOverlay(mounted)
  assert.equal(rowTitle(view.selected), 'Gamma', 'second tap highlights the next entry')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s3'])
}

// --- Ctrl+Shift+Tab opens on the previous session; release order ----------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted, { shift: true })
  const view = renderOverlay(mounted)
  assert.equal(rowTitle(view.selected), 'Gamma', 'previous target wraps to the last entry')
  keyup(mounted.window, { key: 'Shift', code: 'ShiftLeft', ctrlKey: true })
  assert.deepEqual(mounted.opened, [], 'releasing Shift alone does not commit while Ctrl is held')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s3'])
}

// --- Escape cancels, Enter commits, arrows move ---------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  const escape = keydown(mounted.window, { key: 'Escape' })
  assert.equal(escape.prevented, 1, 'Escape is consumed')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, [], 'cancelled panel never navigates')
  assert.equal(renderOverlay(mounted).tree, null, 'panel hidden after Escape')
}
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  keydown(mounted.window, { key: 'Enter' })
  assert.deepEqual(mounted.opened, ['s2'], 'Enter commits immediately')
}
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  keydown(mounted.window, { key: 'ArrowDown' })
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s3'], 'ArrowDown moves the highlight')
}

// --- other modifier releases do not commit --------------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  keyup(mounted.window, { key: 'Meta', code: 'MetaLeft', ctrlKey: true })
  assert.deepEqual(mounted.opened, [], 'releasing an unrelated modifier keeps the panel open')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s2'])
}

// --- non-matching fixed input is ignored ----------------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  assert.equal(fireFixed(mounted, { code: 'KeyA' }).consumed, 0, 'other keys pass through')
  assert.equal(fireFixed(mounted, { control: false }).consumed, 0, 'plain Tab passes through')
  assert.equal(fireFixed(mounted, { alt: true }).consumed, 0, 'Ctrl+Alt+Tab passes through')
  assert.equal(fireFixed(mounted, { repeat: true }).consumed, 0, 'held repeats are ignored')
  assert.equal(fireFixed(mounted, { composing: true }).consumed, 0, 'composition is ignored')
  assert.equal(renderOverlay(mounted).tree, null, 'no panel for ignored input')
}

// --- modal context leaves the chord alone ---------------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  const fired = fireFixed(mounted, { context: { region: 'page', modal: 'settings', target: null } })
  assert.equal(fired.consumed, 0, 'modal keeps Ctrl+Tab')
  assert.equal(renderOverlay(mounted).tree, null)
}

// --- reset input (focus/modal/pointer change) hides the panel -------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  fireReset(mounted)
  assert.equal(renderOverlay(mounted).tree, null, 'reset hides the panel')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, [], 'reset never navigates')
}

// --- pointer outside cancels; pointer on a row chooses it -----------------
// DSH's shortcuts service emits a fixed-input reset from its document-capture
// pointerdown listener, so a panel press arrives as reset right before the click.
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  mounted.document.fire('pointerdown', { target: fakeTarget(false) })
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, [], 'outside click cancels')
}
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  mounted.window.fire('pointerdown', { target: fakeTarget(false) })
  fireReset(mounted)
  assert.equal(renderOverlay(mounted).tree, null, 'the reset from an outside pointerdown cancels')
}
{
  // Window capture classifies the press before the service's document-capture
  // reset. A press on the panel must survive that reset so the click can run.
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  mounted.window.fire('pointerdown', { target: fakeTarget(true) })
  fireReset(mounted)
  assert.ok(renderOverlay(mounted).tree !== null, 'a press inside the panel keeps it open')
  fireReset(mounted)
  assert.ok(renderOverlay(mounted).tree !== null, 'further resets keep a panel press alive')
  const view = renderOverlay(mounted)
  rowByTitle(view, 'Beta').props.onClick()
  assert.deepEqual(mounted.opened, ['s2'], 'the row click opens the session after the pointer reset')
  assert.equal(renderOverlay(mounted).tree, null, 'panel hides after a row click')
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, ['s2'], 'releasing Ctrl after the click does not navigate again')
}
{
  // The suppression only covers the gesture itself: a later reset (focus or
  // pointer elsewhere) cancels as usual once the pointer is released.
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  mounted.window.fire('pointerdown', { target: fakeTarget(true) })
  fireReset(mounted)
  mounted.window.fire('pointerup', {})
  fireReset(mounted)
  assert.equal(renderOverlay(mounted).tree, null, 'a reset after the gesture ends still cancels')
}
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  const view = renderOverlay(mounted)
  rowByTitle(view, 'Beta').props.onClick()
  assert.deepEqual(mounted.opened, ['s2'], 'clicking a row opens it')
  assert.equal(renderOverlay(mounted).tree, null, 'panel hides after a row click')
}

// --- blur cancels ---------------------------------------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  mounted.window.fire('blur', {})
  keyup(mounted.window, { key: 'Control', code: 'ControlLeft' })
  assert.deepEqual(mounted.opened, [], 'window blur cancels the panel')
}

// --- running sessions carry the host-style spinner ------------------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  setRunning(mounted, ['s2'])
  fireFixed(mounted)
  const view = renderOverlay(mounted)
  assert.ok(rowSpinner(rowByTitle(view, 'Beta')), 'the session in an active turn shows a spinner')
  assert.equal(rowSpinner(rowByTitle(view, 'Alpha')), undefined, 'idle sessions show no spinner')
  assert.equal(rowSpinner(rowByTitle(view, 'Gamma')), undefined)
  const spinner = rowSpinner(rowByTitle(view, 'Beta'))
  assert.equal(spinner.props['data-state'], 'ongoing', 'the spinner uses the ongoing state')
  assert.equal(spinner.props['aria-label'], 'Running', 'the spinner is labelled for screen readers')
  assert.equal(spinner.props.width, 14)
  const motion = spinner.props.children[0]
  assert.equal(motion.props.className, 'dshWs-spinnerMotion', 'the arc group carries the rotation')
  assert.deepEqual(
    motion.props.children.map((circle) => circle.props.className),
    ['dshWs-spinnerTrack', 'dshWs-spinnerArc'],
    'track and arc circles render in host order'
  )
}
{
  // A running current Session keeps its badge, with the spinner on its right.
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  setRunning(mounted, ['s1'])
  fireFixed(mounted)
  const alpha = rowByTitle(renderOverlay(mounted), 'Alpha')
  assert.ok(rowBadge(alpha), 'the current badge still renders')
  assert.ok(rowSpinner(alpha), 'the current Session can also be running')
  const children = alpha.props.children
  assert.ok(children.indexOf(rowSpinner(alpha)) > children.indexOf(rowBadge(alpha)), 'the spinner sits right of the badge')
}
{
  // Without the slot hook, the list snapshot's cached `running` hint still works.
  const list = snapshot([
    row('s1', { displayTitle: 'Alpha', updatedAt: base - 7200000 }),
    row('s2', { displayTitle: 'Beta', updatedAt: base - 5000, running: true }),
    row('s3', { displayTitle: 'Gamma', updatedAt: base - 120000 })
  ], 's1')
  const mounted = mount(list, workspace)
  fireFixed(mounted)
  const view = renderOverlay(mounted, { withoutHooks: true })
  assert.ok(rowSpinner(rowByTitle(view, 'Beta')), 'falls back to the list running hint')
  assert.equal(rowSpinner(rowByTitle(view, 'Alpha')), undefined)
}

// --- blocked and pass-through cases --------------------------------------
{
  const mounted = mount(
    snapshot([row('only', { updatedAt: base })], 'only'),
    { phase: 'ready', items: [], archivedSessionIds: [] }
  )
  const fired = fireFixed(mounted)
  assert.equal(fired.consumed, 0, 'single visible session leaves the chord alone')
  assert.deepEqual(mounted.opened, [])
}
{
  const mounted = mount(
    { ids: [], byId: {}, phase: 'pending', projectionsBySession: {} },
    { phase: 'pending', items: [], archivedSessionIds: [] }
  )
  assert.equal(fireFixed(mounted).consumed, 0, 'pending list leaves the chord alone')
}
{
  const filtered = mount(
    snapshot([
      row('parent', { updatedAt: base - 100 }),
      row('child', { updatedAt: base - 10, origin: 'subagent', parentId: 'parent' }),
      row('archived', { updatedAt: base - 20 })
    ], 'parent'),
    { phase: 'ready', items: [], archivedSessionIds: ['archived'] }
  )
  assert.equal(fireFixed(filtered).consumed, 0, 'subagent and archived rows are not switch targets')
}

// --- overlay markup is token-styled and free of raw colors ---------------
{
  const mounted = mount(snapshot(rows(), 's1'), workspace)
  fireFixed(mounted)
  const view = renderOverlay(mounted)
  const style = view.tree.props.children.find((child) => child?.type === 'style')
  assert.ok(style, 'overlay carries its scoped stylesheet')
  const css = String(style.props.children[0])
  assert.ok(css.includes('--dsw-specific-menu'), 'surface uses the host menu token')
  assert.ok(css.includes('--dsw-alias-state-business-primary'), 'selection uses the business accent token')
  assert.ok(css.includes('dshWs-spinnerMotion'), 'spinner motion is styled')
  assert.ok(css.includes('prefers-reduced-motion'), 'spinner respects reduced motion')
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(css), false, 'no hardcoded hex colors')
}

console.log('client.js harness: all assertions passed')
