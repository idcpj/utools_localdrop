const path = require('node:path')
const os = require('node:os')
const { LocalDrop } = require('./server/core.cjs')

const utoolsApi = window.utools
const dataRoot = utoolsApi?.getPath?.('userData') || path.join(os.homedir(), '.localdrop')
const drop = new LocalDrop({ dataDir: path.join(dataRoot, 'localdrop'), siteDir: path.join(__dirname, 'dist') })
let pending = null
const listeners = new Set()
let fileShareQueue = Promise.resolve()

function notify() { for (const listener of listeners) listener(pending) }
function filePaths(payload) {
  const entries = Array.isArray(payload) ? payload : payload ? [payload] : []
  return entries.map(x => typeof x === 'string' ? x : x.path || x.filePath).filter(Boolean)
}

utoolsApi?.onPluginEnter?.(({ code, type, payload }) => {
  if (code === 'share-files' || type === 'files') {
    const paths = filePaths(payload)
    pending = { type: 'files', paths, status: 'processing' }
    notify()
    fileShareQueue = fileShareQueue.catch(() => {}).then(async () => {
      if (!paths.length) throw new Error('没有收到可分享的文件路径')
      const autoStarted = !drop.server
      if (autoStarted) await drop.start()
      const added = await drop.addPaths(paths)
      pending = { type: 'files', paths, added, autoStarted, status: 'done' }
      notify()
    }).catch(error => {
      pending = { type: 'files', paths, status: 'error', error: error.message || '自动分享失败' }
      notify()
    })
  }
  else {
    if (code === 'share-text' || type === 'over') pending = { type: 'text', text: typeof payload === 'string' ? payload : payload?.text || '' }
    else pending = null
    notify()
  }
})

utoolsApi?.onPluginOut?.(() => {
  drop.stop().catch(() => {})
})

window.localdrop = {
  snapshot: () => drop.snapshot(),
  start: () => drop.start(),
  stop: () => drop.stop(),
  updateSettings: patch => drop.updateSettings(patch),
  createText: (name, text) => drop.createText(name, text),
  addPaths: paths => drop.addPaths(paths),
  remove: id => { drop.remove(id); return drop.snapshot() },
  clear: () => { drop.clear(); return drop.snapshot() },
  pending: () => pending,
  consumePending: () => { pending = null; notify() },
  onPending: callback => { listeners.add(callback); return () => listeners.delete(callback) },
  chooseFiles: () => utoolsApi?.showOpenDialog?.({ properties: ['openFile', 'multiSelections'] }) || [],
  chooseFolder: () => utoolsApi?.showOpenDialog?.({ properties: ['openDirectory'] }) || [],
  copy: value => utoolsApi?.copyText?.(value),
  openUrl: value => utoolsApi?.shellOpenExternal ? utoolsApi.shellOpenExternal(value) : window.open(value, '_blank'),
  startTunnel: () => drop.startTunnel(),
  stopTunnel: () => drop.stopTunnel(),
}

if (drop.state.settings.autoStart) drop.start().catch(error => { window.localdrop.startError = error.message })
