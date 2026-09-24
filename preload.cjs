const path = require('node:path')
const os = require('node:os')
const { LocalDrop } = require('./server/core.cjs')

const utoolsApi = window.utools
const dataRoot = utoolsApi?.getPath?.('userData') || path.join(os.homedir(), '.localdrop')
const drop = new LocalDrop({ dataDir: path.join(dataRoot, 'localdrop'), siteDir: path.join(__dirname, 'dist') })
let pending = null
const listeners = new Set()

function notify() { for (const listener of listeners) listener(pending) }
function filePaths(payload) {
  const entries = Array.isArray(payload) ? payload : payload ? [payload] : []
  return entries.map(x => typeof x === 'string' ? x : x.path || x.filePath).filter(Boolean)
}

utoolsApi?.onPluginEnter?.(({ code, type, payload }) => {
  if (code === 'share-files' || type === 'files') pending = { type: 'files', paths: filePaths(payload) }
  else if (code === 'share-text' || type === 'over') pending = { type: 'text', text: typeof payload === 'string' ? payload : payload?.text || '' }
  else pending = null
  notify()
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
}

if (drop.state.settings.autoStart) drop.start().catch(error => { window.localdrop.startError = error.message })
