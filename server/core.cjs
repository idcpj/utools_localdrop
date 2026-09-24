const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const { pipeline } = require('node:stream/promises')

const MAX_UPLOAD = 1024 * 1024 * 1024
const MAX_TEXT = 1024 * 1024
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

function addresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list || [])
    .filter(x => x.family === 'IPv4' && !x.internal && x.address !== '0.0.0.0' && !x.address.startsWith('169.254.'))
    .map(x => ({ name, address: x.address })))
}

function safeName(value) {
  return String(value || '未命名').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^\.+$/, '_').slice(0, 180).trim() || '未命名'
}

function publicShare(item) {
  return { id: item.id, type: item.type, name: item.name, size: item.size || 0, createdAt: item.createdAt, status: item.status || 'active' }
}

function json(res, code, value) {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(body)
}

async function readJson(req, max = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > max) throw Object.assign(new Error('请求内容过大'), { code: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Object.assign(new Error('JSON 格式无效'), { code: 400 }) }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
}

function verifyPassword(password, stored) {
  if (!stored) return true
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const actual = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function inside(root, target) {
  const rel = path.relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function decodeSegments(raw) {
  return raw.split('/').filter(Boolean).map(segment => {
    let decoded
    try { decoded = decodeURIComponent(segment) } catch { throw Object.assign(new Error('路径编码无效'), { code: 400 }) }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) throw Object.assign(new Error('路径无效'), { code: 400 })
    return decoded
  })
}

async function resolveShared(item, parts) {
  const root = await fsp.realpath(item.sourcePath)
  const rootStat = await fsp.stat(root)
  if (item.type === 'file' && parts.length) throw Object.assign(new Error('路径无效'), { code: 400 })
  if (item.type === 'directory' && !rootStat.isDirectory()) throw Object.assign(new Error('分享源已失效'), { code: 404 })
  if (item.type === 'file' && !rootStat.isFile()) throw Object.assign(new Error('分享源已失效'), { code: 404 })
  const candidate = path.join(root, ...parts)
  const target = await fsp.realpath(candidate)
  if (!inside(root, target)) throw Object.assign(new Error('禁止访问分享目录之外的文件'), { code: 403 })
  return { target, stat: await fsp.stat(target) }
}

class LocalDrop {
  constructor({ dataDir, siteDir }) {
    this.dataDir = dataDir
    this.siteDir = siteDir
    fs.mkdirSync(dataDir, { recursive: true })
    this.file = path.join(dataDir, 'state.json')
    let saved = {}
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    this.state = { settings: { port: 43881, ip: addresses()[0]?.address || '127.0.0.1', autoStart: false, allowUpload: false, passwordHash: null, ...saved.settings }, shares: saved.shares || [] }
    this.server = null
    this.sessions = new Map()
    this.attempts = new Map()
  }

  persist() {
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }

  async snapshot() {
    const shares = await Promise.all(this.state.shares.map(async item => {
      let status = 'active', size = item.size || 0
      if (item.sourcePath) {
        try {
          const stat = await fsp.stat(item.sourcePath)
          if ((item.type === 'file' && !stat.isFile()) || (item.type === 'directory' && !stat.isDirectory())) status = 'missing'
          else size = item.type === 'file' ? stat.size : 0
        } catch { status = 'missing' }
      }
      return publicShare({ ...item, status, size })
    }))
    const { passwordHash, ...settings } = this.state.settings
    return { settings: { ...settings, hasPassword: !!passwordHash }, shares, running: !!this.server, addresses: addresses(), url: this.server ? `http://${settings.ip}:${settings.port}` : null }
  }

  async createText(name, text) {
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > MAX_TEXT) throw new Error('文本不能为空且不能超过 1 MB')
    const item = { id: crypto.randomUUID(), type: 'text', name: safeName(name || '文本分享'), textContent: text, size: Buffer.byteLength(text), createdAt: new Date().toISOString() }
    this.state.shares.unshift(item)
    this.persist()
    return publicShare(item)
  }

  async addPaths(paths) {
    const added = []
    for (const value of paths) {
      const sourcePath = path.resolve(String(value))
      const stat = await fsp.stat(sourcePath)
      const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : null
      if (!type) throw new Error(`不支持此文件类型：${path.basename(sourcePath)}`)
      const item = { id: crypto.randomUUID(), type, name: safeName(path.basename(sourcePath)), sourcePath, size: stat.isFile() ? stat.size : 0, createdAt: new Date().toISOString() }
      this.state.shares.unshift(item)
      added.push(publicShare(item))
    }
    this.persist()
    return added
  }

  remove(id) { this.state.shares = this.state.shares.filter(x => x.id !== id); this.persist() }
  clear() { this.state.shares = []; this.persist() }

  async updateSettings(patch) {
    const old = { ...this.state.settings }
    if (patch.ip !== undefined) {
      if (patch.ip !== '127.0.0.1' && !addresses().some(x => x.address === patch.ip)) throw new Error('请选择当前可用的本机 IP')
      this.state.settings.ip = patch.ip
    }
    if (patch.port !== undefined) {
      const port = Number(patch.port)
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口需在 1024 到 65535 之间')
      this.state.settings.port = port
    }
    if (patch.autoStart !== undefined) this.state.settings.autoStart = !!patch.autoStart
    if (patch.allowUpload !== undefined) this.state.settings.allowUpload = !!patch.allowUpload
    if (patch.password !== undefined) {
      if (patch.password && (patch.password.length < 6 || patch.password.length > 128)) throw new Error('密码长度需为 6–128 个字符')
      this.state.settings.passwordHash = patch.password ? hashPassword(patch.password) : null
      this.sessions.clear()
    }
    if (this.server && (old.ip !== this.state.settings.ip || old.port !== this.state.settings.port)) {
      await this.stop()
      try { await this.start() } catch (error) {
        this.state.settings = old
        await this.start().catch(() => {})
        throw error
      }
    }
    this.persist()
    return this.snapshot()
  }

  async start() {
    if (this.server) return this.snapshot()
    const server = http.createServer((req, res) => this.handle(req, res).catch(error => {
      if (!res.headersSent) json(res, Number.isInteger(error.code) ? error.code : 500, { error: Number.isInteger(error.code) ? error.message : '服务处理失败' })
      else res.destroy()
    }))
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.state.settings.port, this.state.settings.ip, () => { server.off('error', reject); resolve() })
    }).catch(error => { throw new Error(error.code === 'EADDRINUSE' ? `端口 ${this.state.settings.port} 已被占用` : `服务启动失败：${error.message}`) })
    this.server = server
    return this.snapshot()
  }

  async stop() {
    if (!this.server) return this.snapshot()
    const server = this.server
    this.server = null
    this.sessions.clear()
    server.closeAllConnections?.()
    await new Promise(resolve => server.close(resolve))
    return this.snapshot()
  }

  authorized(req) {
    if (!this.state.settings.passwordHash) return true
    const cookie = /(?:^|;\s*)localdrop=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')
    const expiry = cookie && this.sessions.get(cookie[1])
    if (!expiry) return false
    if (expiry < Date.now()) { this.sessions.delete(cookie[1]); return false }
    return true
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localdrop.invalid')
    const pathname = url.pathname
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.headers.origin) {
      const expected = `http://${req.headers.host}`
      if (req.headers.origin !== expected) return json(res, 403, { error: '请求来源无效' })
    }
    if (pathname === '/api/health') return json(res, 200, { ok: true, passwordRequired: !!this.state.settings.passwordHash })
    if (pathname === '/api/auth/status') return json(res, 200, { authenticated: this.authorized(req), passwordRequired: !!this.state.settings.passwordHash })
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const key = req.socket.remoteAddress || 'unknown'
      const attempt = this.attempts.get(key) || { count: 0, until: 0 }
      if (attempt.until > Date.now()) return json(res, 429, { error: '尝试过多，请稍后再试' })
      const body = await readJson(req, 4096)
      if (!verifyPassword(String(body.password || ''), this.state.settings.passwordHash)) {
        attempt.count++
        attempt.until = attempt.count >= 5 ? Date.now() + 60_000 : 0
        this.attempts.set(key, attempt)
        return json(res, 401, { error: '密码错误' })
      }
      this.attempts.delete(key)
      const token = crypto.randomBytes(32).toString('hex')
      this.sessions.set(token, Date.now() + 12 * 60 * 60_000)
      res.setHeader('Set-Cookie', `localdrop=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`)
      return json(res, 200, { ok: true })
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = /(?:^|;\s*)localdrop=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1]
      if (token) this.sessions.delete(token)
      res.setHeader('Set-Cookie', 'localdrop=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
      return json(res, 200, { ok: true })
    }
    if (pathname.startsWith('/api/')) {
      if (!this.authorized(req)) return json(res, 401, { error: '请先输入站点密码' })
      if (pathname === '/api/shares' && req.method === 'GET') {
        const snap = await this.snapshot()
        return json(res, 200, { shares: snap.shares, allowUpload: snap.settings.allowUpload })
      }
      if (pathname === '/api/uploads' && req.method === 'POST') return this.upload(req, res, url)
      const match = /^\/api\/shares\/([a-f0-9-]+)\/(content|browse|download)$/.exec(pathname)
      if (match && req.method === 'GET') return this.shareRequest(req, res, match[1], match[2], url)
      return json(res, 404, { error: '接口不存在' })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '方法不允许' })
    return this.staticFile(pathname, res, req.method === 'HEAD')
  }

  async shareRequest(req, res, id, action, url) {
    const item = this.state.shares.find(x => x.id === id)
    if (!item) return json(res, 404, { error: '分享项不存在' })
    if (item.type === 'text') {
      if (action !== 'content') return json(res, 400, { error: '文本只能查看' })
      return json(res, 200, { name: item.name, text: item.textContent })
    }
    const parts = decodeSegments(url.searchParams.get('path') || '')
    let target, stat
    try { ({ target, stat } = await resolveShared(item, parts)) } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EACCES') return json(res, 404, { error: '文件不存在或分享源已失效' })
      throw error
    }
    if (action === 'browse') {
      if (!stat.isDirectory()) return json(res, 400, { error: '不是文件夹' })
      const entries = await fsp.readdir(target, { withFileTypes: true })
      const result = await Promise.all(entries.map(async entry => {
        try {
          const resolved = await fsp.realpath(path.join(target, entry.name))
          if (!inside(await fsp.realpath(item.sourcePath), resolved)) return null
          const s = await fsp.stat(resolved)
          return (s.isFile() || s.isDirectory()) ? { name: entry.name, type: s.isDirectory() ? 'directory' : 'file', size: s.isFile() ? s.size : 0, modifiedAt: s.mtime.toISOString() } : null
        } catch { return null }
      }))
      return json(res, 200, { name: parts.at(-1) || item.name, entries: result.filter(Boolean).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'zh') : a.type === 'directory' ? -1 : 1) })
    }
    if (action !== 'download' || !stat.isFile()) return json(res, 400, { error: '不是可下载的文件' })
    const filename = path.basename(target)
    const encoded = encodeURIComponent(filename).replace(/['()]/g, escape)
    const headers = { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' }
    let start = 0, end = stat.size - 1, status = 200
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      if (!match || (!match[1] && !match[2])) return json(res, 416, { error: '范围无效' })
      if (!match[1]) { start = Math.max(0, stat.size - Number(match[2])); end = stat.size - 1 }
      else { start = Number(match[1]); end = match[2] ? Number(match[2]) : stat.size - 1 }
      if (start > end || end >= stat.size) return json(res, 416, { error: '范围无效' })
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
    }
    headers['Content-Length'] = Math.max(0, end - start + 1)
    res.writeHead(status, headers)
    if (stat.size === 0) return res.end()
    fs.createReadStream(target, { start, end }).pipe(res)
  }

  async upload(req, res, url) {
    if (!this.state.settings.allowUpload) return json(res, 403, { error: '上传已关闭' })
    const raw = url.searchParams.get('name') || ''
    if (!raw || Buffer.byteLength(raw) > 512 || raw === '.' || raw === '..' || raw.includes('/') || raw.includes('\\')) return json(res, 400, { error: '文件名无效' })
    const dir = path.join(this.dataDir, 'uploads')
    await fsp.mkdir(dir, { recursive: true })
    const ext = path.extname(raw)
    const base = safeName(path.basename(raw, ext))
    let target
    for (let n = 0; n < 10000; n++) {
      target = path.join(dir, `${base}${n ? ` (${n})` : ''}${ext}`)
      try { await fsp.access(target) } catch { break }
    }
    let size = 0
    const limit = async function* (stream) {
      for await (const chunk of stream) {
        size += chunk.length
        if (size > MAX_UPLOAD) throw Object.assign(new Error('文件不能超过 1 GB'), { code: 413 })
        yield chunk
      }
    }
    try {
      await pipeline(limit(req), fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }))
    } catch (error) { await fsp.unlink(target).catch(() => {}); throw error }
    return json(res, 201, { name: path.basename(target), size })
  }

  async staticFile(pathname, res, head) {
    const file = pathname === '/' ? 'site.html' : pathname.replace(/^\/+/, '')
    if (file !== 'site.html' && !file.startsWith('assets/')) return json(res, 404, { error: '页面不存在' })
    const target = path.resolve(this.siteDir, file)
    if (!inside(this.siteDir, target)) return json(res, 403, { error: '禁止访问' })
    let stat
    try { stat = await fsp.stat(target) } catch { return json(res, 404, { error: '页面不存在' }) }
    if (!stat.isFile()) return json(res, 404, { error: '页面不存在' })
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    if (head) return res.end()
    fs.createReadStream(target).pipe(res)
  }
}

module.exports = { LocalDrop, addresses, safeName, decodeSegments, inside }
