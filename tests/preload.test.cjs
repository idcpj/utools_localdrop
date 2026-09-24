const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

test('uTools file trigger starts service and adds shares without confirmation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-preload-'))
  const file = path.join(root, 'shared.txt')
  await fs.writeFile(file, 'hello')
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  await fs.mkdir(path.join(root, 'localdrop'))
  await fs.writeFile(path.join(root, 'localdrop', 'state.json'), JSON.stringify({ settings: { ip: '127.0.0.1', port }, shares: [] }))
  let enter
  global.window = { utools: { getPath: () => root, onPluginEnter: handler => { enter = handler } } }
  const preload = require.resolve('../preload.cjs')
  delete require.cache[preload]
  require(preload)
  const states = []
  const done = new Promise((resolve, reject) => {
    global.window.localdrop.onPending(value => {
      states.push(value?.status)
      if (value?.status === 'done') resolve(value)
      if (value?.status === 'error') reject(new Error(value.error))
    })
  })
  enter({ code: 'share-files', type: 'files', payload: [{ path: file }] })
  try {
    const result = await done
    assert.equal(result.autoStarted, true)
    assert.deepEqual(states, ['processing', 'done'])
    const snapshot = await global.window.localdrop.snapshot()
    assert.equal(snapshot.running, true)
    assert.equal(snapshot.shares.length, 1)
    assert.equal(snapshot.shares[0].name, 'shared.txt')
  } finally {
    await global.window.localdrop.stop()
    delete global.window
    await fs.rm(root, { recursive: true, force: true })
  }
})
