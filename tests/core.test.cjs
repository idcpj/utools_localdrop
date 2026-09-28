const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { LocalDrop } = require('../server/core.cjs')

function fakeWindowsExecutable() {
  const buffer = Buffer.alloc(1024)
  buffer.write('MZ', 0, 'ascii')
  buffer.writeUInt32LE(128, 0x3c)
  buffer.write('PE\0\0', 128, 'ascii')
  buffer.writeUInt16LE(process.arch === 'ia32' ? 0x14c : process.arch === 'arm64' ? 0xaa64 : 0x8664, 132)
  buffer.writeUInt16LE(1, 134)
  buffer.writeUInt16LE(process.arch === 'ia32' ? 0xe0 : 0xf0, 148)
  buffer.writeUInt16LE(process.arch === 'ia32' ? 0x10b : 0x20b, 152)
  const section = 152 + (process.arch === 'ia32' ? 0xe0 : 0xf0)
  buffer.writeUInt32LE(512, section + 16)
  buffer.writeUInt32LE(512, section + 20)
  return buffer
}

async function withDrop(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-'))
  const source = path.join(root, 'source')
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, 'hello.txt'), 'hello localdrop')
  const drop = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist') })
  await drop.updateSettings({ ip: '127.0.0.1', port: 45678 + Math.floor(Math.random() * 1000), password: 'secret123', allowUpload: true })
  await drop.start()
  try { return await fn(drop, root, `http://127.0.0.1:${drop.state.settings.port}`) } finally { await drop.stop(); await fs.rm(root, { recursive: true, force: true }) }
}

test('password protects shares and directory download works', async () => withDrop(async (drop, root, base) => {
  const item = (await drop.addPaths([path.join(root, 'source')]))[0]
  let response = await fetch(`${base}/api/shares`)
  assert.equal(response.status, 401)
  response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret123' }) })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie').split(';')[0]
  response = await fetch(`${base}/api/shares`, { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).shares[0].id, item.id)
  response = await fetch(`${base}/api/shares/${item.id}/browse`, { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).entries[0].name, 'hello.txt')
  response = await fetch(`${base}/api/shares/${item.id}/download?path=hello.txt`, { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'hello localdrop')
}))

test('upload saves into data uploads when enabled', async () => withDrop(async (drop, root, base) => {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret123' }) })
  const cookie = response.headers.get('set-cookie').split(';')[0]
  const upload = await fetch(`${base}/api/uploads?name=note.txt`, { method: 'POST', headers: { cookie }, body: 'uploaded' })
  assert.equal(upload.status, 201)
  const uploaded = await upload.json()
  assert.equal((await fs.readFile(path.join(root, 'data', 'uploads', 'note.txt'))).toString(), 'uploaded')
  assert.equal(uploaded.type, 'file')
  assert.equal(uploaded.name, 'note.txt')
  assert.ok(uploaded.downloadToken)
  assert.equal(drop.state.shares[0].id, uploaded.id)
  const restarted = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist') })
  const snapshot = await restarted.snapshot()
  assert.equal(snapshot.shares[0].id, uploaded.id)
  assert.equal(snapshot.shares[0].status, 'active')
  const downloaded = await fetch(`${base}/api/shares/${uploaded.id}/download?token=${uploaded.downloadToken}`)
  assert.equal(downloaded.status, 200)
  assert.equal(await downloaded.text(), 'uploaded')
}))

test('file download token works without a session and is not exposed to visitors', async () => withDrop(async (drop, root, base) => {
  const item = (await drop.addPaths([path.join(root, 'source', 'hello.txt')]))[0]
  const token = drop.state.shares.find(share => share.id === item.id).downloadToken
  let response = await fetch(`${base}/api/shares/${item.id}/download`)
  assert.equal(response.status, 401)
  response = await fetch(`${base}/api/shares/${item.id}/download?token=${token}`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'hello localdrop')
  response = await fetch(`${base}/api/shares`)
  assert.equal(response.status, 401)
}))

test('public tunnel requires a site password', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-tunnel-'))
  const drop = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist') })
  await assert.rejects(() => drop.startTunnel(), /站点密码/)
  await fs.rm(root, { recursive: true, force: true })
})

test('public tunnel replaces a truncated Windows executable cache', async () => {
  if (process.platform !== 'win32') return
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-corrupt-bin-'))
  const executable = path.join(root, 'data', 'bin', 'cloudflared.exe')
  await fs.mkdir(path.dirname(executable), { recursive: true })
  await fs.writeFile(executable, fakeWindowsExecutable().subarray(0, 700))
  let installs = 0
  const fakeCloudflared = {
    install: async target => { installs++; await fs.writeFile(target, fakeWindowsExecutable()) },
  }
  const { EventEmitter } = require('node:events')
  const spawnImpl = () => {
    const child = new EventEmitter()
    child.killed = false
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => { child.killed = true; child.emit('exit', 0, 'SIGINT') }
    queueMicrotask(() => { child.emit('spawn'); setTimeout(() => child.stdout.emit('data', 'https://repaired.trycloudflare.com\n'), 5) })
    return child
  }
  const drop = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist'), cloudflaredModule: fakeCloudflared, spawnImpl })
  await drop.updateSettings({ ip: '127.0.0.1', port: 47890, password: 'secret123' })
  drop.server = { closeAllConnections() {}, close(callback) { callback() } }
  const snapshot = await drop.startTunnel()
  assert.equal(installs, 1)
  assert.equal(snapshot.tunnel.url, 'https://repaired.trycloudflare.com')
  await drop.stop()
  await fs.rm(root, { recursive: true, force: true })
})

test('public tunnel reports spawn errors instead of UNKNOWN', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-spawn-'))
  const fakeCloudflared = {
    install: async executable => { await fs.writeFile(executable, fakeWindowsExecutable()) },
  }
  const drop = new LocalDrop({
    dataDir: path.join(root, 'data'),
    siteDir: path.resolve(__dirname, '../dist'),
    cloudflaredModule: fakeCloudflared,
    spawnImpl: () => {
      const { EventEmitter } = require('node:events')
      const child = new EventEmitter()
      child.killed = false
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => { child.killed = true }
      queueMicrotask(() => child.emit('error', Object.assign(new Error('权限不足'), { code: 'EACCES' })))
      return child
    },
  })
  await drop.updateSettings({ ip: '127.0.0.1', port: 47891, password: 'secret123' })
  drop.server = { closeAllConnections() {}, close(callback) { callback() } }
  await assert.rejects(() => drop.startTunnel(), /cloudflared 启动失败：EACCES/)
  assert.match(drop.tunnelError, /EACCES/)
  await drop.stop()
  await fs.rm(root, { recursive: true, force: true })
})

test('public tunnel retries Windows spawn UNKNOWN with shell fallback', async () => {
  if (process.platform !== 'win32') return
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-spawn-fallback-'))
  const fakeCloudflared = { install: async executable => { await fs.writeFile(executable, fakeWindowsExecutable()) } }
  let calls = 0
  let fallbackArgs
  const { EventEmitter } = require('node:events')
  const spawnImpl = (executable, args, options) => {
    calls++
    if (calls === 2) fallbackArgs = { executable, args, options }
    const child = new EventEmitter()
    child.killed = false
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => { child.killed = true; child.emit('exit', 0, 'SIGINT') }
    if (calls === 1) queueMicrotask(() => child.emit('error', Object.assign(new Error('unknown'), { code: 'UNKNOWN' })))
    else queueMicrotask(() => { child.emit('spawn'); setTimeout(() => child.stderr.emit('data', 'https://fallback.trycloudflare.com\n'), 5) })
    return child
  }
  const drop = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist'), cloudflaredModule: fakeCloudflared, spawnImpl })
  await drop.updateSettings({ ip: '127.0.0.1', port: 47892, password: 'secret123' })
  drop.server = { closeAllConnections() {}, close(callback) { callback() } }
  const snapshot = await drop.startTunnel()
  assert.equal(calls, 2)
  assert.equal(snapshot.tunnel.url, 'https://fallback.trycloudflare.com')
  if (fallbackArgs) {
    assert.equal(fallbackArgs.args[2], 'call')
    assert.match(await fs.readFile(fallbackArgs.args[3], 'ascii'), /cloudflared\.exe.*tunnel --url/)
  }
  await drop.stop()
  await fs.rm(root, { recursive: true, force: true })
})

test('public tunnel handles synchronous Windows spawn UNKNOWN', async () => {
  if (process.platform !== 'win32') return
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrop-spawn-sync-'))
  const fakeCloudflared = { install: async executable => { await fs.writeFile(executable, fakeWindowsExecutable()) } }
  let calls = 0
  const { EventEmitter } = require('node:events')
  const spawnImpl = (executable, args) => {
    calls++
    if (calls === 1) throw Object.assign(new Error('sync unknown'), { code: 'UNKNOWN' })
    const child = new EventEmitter()
    child.killed = false
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => { child.killed = true; child.emit('exit', 0, 'SIGINT') }
    queueMicrotask(() => { child.emit('spawn'); setTimeout(() => child.stderr.emit('data', 'https://sync-fallback.trycloudflare.com\n'), 5) })
    return child
  }
  const drop = new LocalDrop({ dataDir: path.join(root, 'data'), siteDir: path.resolve(__dirname, '../dist'), cloudflaredModule: fakeCloudflared, spawnImpl })
  await drop.updateSettings({ ip: '127.0.0.1', port: 47893, password: 'secret123' })
  drop.server = { closeAllConnections() {}, close(callback) { callback() } }
  const snapshot = await drop.startTunnel()
  assert.equal(calls, 2)
  assert.equal(snapshot.tunnel.url, 'https://sync-fallback.trycloudflare.com')
  await drop.stop()
  await fs.rm(root, { recursive: true, force: true })
})

test('origin verification handles public https tunnel and blocks untrusted cross-origin requests', async () => withDrop(async (drop, root, base) => {
  // 设置模拟的公网隧道地址
  drop.tunnelUrl = 'https://demo-tunnel.trycloudflare.com'

  // 1. 本地合法 Origin 应该通过
  const localRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': base,
    },
    body: JSON.stringify({ password: 'secret123' }),
  })
  assert.equal(localRes.status, 200)

  // 2. 公网 HTTPS 隧道 Origin 应该通过
  const tunnelRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://demo-tunnel.trycloudflare.com',
      'host': 'demo-tunnel.trycloudflare.com',
    },
    body: JSON.stringify({ password: 'secret123' }),
  })
  assert.equal(tunnelRes.status, 200)

  // 3. 恶意第三方的跨站 Origin 应该被拒绝并返回 403 请求来源无效
  const evilRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://malicious-attacker.com',
    },
    body: JSON.stringify({ password: 'secret123' }),
  })
  assert.equal(evilRes.status, 403)
  const evilJson = await evilRes.json()
  assert.equal(evilJson.error, '请求来源无效')
}))

