import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  HardDrive,
  LayoutGrid,
  List,
  LockKeyhole,
  LogOut,
  Search,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import '../styles.css'

const size = n => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n || 0} B`)

async function get(url) {
  const res = await fetch(url, { credentials: 'same-origin' })
  const value = await res.json()
  if (!res.ok) throw new Error(value.error || '请求失败')
  return value
}

function contentUrl(id, action, parts = []) {
  const url = new URL(`/api/shares/${id}/${action}`, location.origin)
  if (parts.length) url.searchParams.set('path', parts.map(encodeURIComponent).join('/'))
  return url.toString()
}

function App() {
  const [auth, setAuth] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [loading, setLoading] = useState(false)
  const [shares, setShares] = useState([])
  const [allowUpload, setAllowUpload] = useState(false)
  const [selected, setSelected] = useState(null)
  const [parts, setParts] = useState([])
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('localdrop_site_view') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const [upload, setUpload] = useState(null)
  const [download, setDownload] = useState(null)
  const inputRef = useRef(null)
  const searchInputRef = useRef(null)

  const showToast = msg => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }

  const changeViewMode = mode => {
    setViewMode(mode)
    try {
      localStorage.setItem('localdrop_site_view', mode)
    } catch {}
  }

  async function loadShares() {
    const data = await get('/api/shares')
    setShares(data.shares)
    setAllowUpload(data.allowUpload)
    const params = new URLSearchParams(location.search)
    const shareId = params.get('share')
    const downloadId = params.get('download')
    if (downloadId) {
      const item = data.shares.find(x => x.id === downloadId)
      if (item?.type === 'file') {
        window.setTimeout(() => {
          window.location.assign(contentUrl(item.id, 'download'))
        }, 0)
        return
      }
    }
    if (shareId) {
      const item = data.shares.find(x => x.id === shareId)
      if (item) open(item)
    }
  }

  useEffect(() => {
    get('/api/auth/status')
      .then(data => {
        setAuth(data)
        if (data.authenticated) loadShares().catch(e => setError(e.message))
      })
      .catch(e => {
        if (location.port === '5178' || location.port === '5173') {
          setAuth({ authenticated: true, passwordRequired: false })
          setShares([
            { id: '1', name: 'Design_System_Spec.pdf', type: 'file', size: 14155776, createdAt: Date.now() - 3600000, status: 'active' },
            { id: '2', name: 'UI_Icons_Export', type: 'directory', size: 48549888, createdAt: Date.now() - 10800000, status: 'active' },
            { id: '3', name: 'Production_Env_Config', type: 'text', size: 840, createdAt: Date.now() - 86400000, status: 'active' },
          ])
          setAllowUpload(true)
          return
        }
        setError(e.message)
      })
  }, [])

  // Keyboard shortcut '/' to search
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !selected) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected])

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setAuth({ authenticated: true, passwordRequired: true })
      setPassword('')
      await loadShares()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuth({ authenticated: false, passwordRequired: true })
    setSelected(null)
    setShares([])
    history.replaceState(null, '', '/')
  }

  async function open(item) {
    setError('')
    setSelected(item)
    setParts([])
    history.replaceState(null, '', `/?share=${item.id}`)
    try {
      if (item.type === 'text') {
        const data = await get(contentUrl(item.id, 'content'))
        setText(data.text)
      } else if (item.type === 'directory') {
        const data = await get(contentUrl(item.id, 'browse'))
        setEntries(data.entries)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function browse(next) {
    setError('')
    try {
      const data = await get(contentUrl(selected.id, 'browse', next))
      setParts(next)
      setEntries(data.entries)
    } catch (e) {
      setError(e.message)
    }
  }

  function back() {
    setSelected(null)
    setParts([])
    setText('')
    history.replaceState(null, '', '/')
  }

  async function downloadFile(url, name) {
    setError('')
    setDownload({ name, loaded: 0, total: 0, progress: 0 })
    try {
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) {
        const value = await response.json().catch(() => ({}))
        throw new Error(value.error || '下载失败')
      }
      const total = Number(response.headers.get('content-length')) || 0
      const reader = response.body?.getReader()
      if (!reader) throw new Error('当前浏览器不支持流式传输下载')
      const chunks = []
      let loaded = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        chunks.push(part.value)
        loaded += part.value.byteLength
        setDownload({ name, loaded, total, progress: total ? Math.round((loaded / total) * 100) : 0 })
      }
      const blob = new Blob(chunks)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = name
      link.click()
      URL.revokeObjectURL(link.href)
      setDownload({ name, loaded, total: total || loaded, progress: 100, done: true })
      showToast('下载已完成')
    } catch (e) {
      setError(e.message)
      setDownload(null)
    }
  }

  function uploadFiles(files) {
    if (!files?.length || !allowUpload) return
    const queue = Array.from(files)
    const run = index => {
      if (index >= queue.length) {
        loadShares().catch(e => setError(e.message))
        setUpload({ done: true, progress: 100, name: `${queue.length} 个文件上传成功` })
        showToast(`${queue.length} 个文件已成功发送`)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      const file = queue[index]
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/uploads?name=${encodeURIComponent(file.name)}`)
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          setUpload({
            name: file.name,
            progress: Math.round(((index + event.loaded / event.total) / queue.length) * 100),
          })
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          run(index + 1)
        } else {
          let message = '上传失败'
          try {
            message = JSON.parse(xhr.responseText).error || message
          } catch {}
          setError(message)
          setUpload(null)
        }
      }
      xhr.onerror = () => {
        setError('网络连接中断，上传中止')
        setUpload(null)
      }
      setUpload({ name: file.name, progress: Math.round((index / queue.length) * 100) })
      xhr.send(file)
    }
    setError('')
    run(0)
  }

  const shown = shares.filter(x => x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  // Initial loading screen
  if (!auth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#07080a] text-[#9c9c9d] font-sans">
        <div className="app-icon-tile h-10 w-10 animate-pulse text-white mb-3">
          <ArrowDownToLine size={20} />
        </div>
        <p className="text-xs">正在连接 LocalDrop 分享站点…</p>
      </div>
    )
  }

  // Raycast Password Login Portal
  if (!auth.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080a] px-4 font-sans selection:bg-white/20 selection:text-white">
        <div className="raycast-card relative w-full max-w-sm overflow-hidden p-6 sm:p-8 text-center shadow-raycast-modal">
          <div className="raycast-hero-stripe" />

          <div className="app-icon-tile mx-auto mb-4 h-12 w-12 bg-[#121212] text-white">
            <LockKeyhole size={22} className="text-[#57c1ff]" />
          </div>

          <h1 className="text-base font-semibold tracking-tight text-[#f4f4f6]">访问受限 · LocalDrop</h1>
          <p className="mt-1 text-xs text-[#9c9c9d]">此分享空间设置了密码保护，请输入访问密码继续</p>

          <form onSubmit={login} className="mt-6 text-left">
            <label className="text-[11px] font-medium text-[#9c9c9d]">站点密码</label>
            <input
              autoFocus
              type="password"
              className="raycast-input mt-1.5 h-10"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
            />

            <button
              disabled={loading || !password}
              className="btn btn-primary mt-4 w-full h-10 text-xs font-semibold"
            >
              {loading ? '正在验证…' : '验证并进入空间'}
              <ArrowRight size={14} />
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-center justify-center gap-1.5 rounded border border-[#ff6161]/30 bg-[#ff6161]/10 p-2 text-xs text-[#ff6161]"
            >
              <ShieldAlert size={13} />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-6 border-t border-[#242728]/70 pt-4 text-[11px] text-[#6a6b6c]">
            局域网高速传输 · 安全加密连接
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-[#cdcdcd] font-sans selection:bg-white/20 selection:text-white flex flex-col">
      {/* Raycast HUD Floating Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-lg border border-[#242728] bg-[#101111]/95 px-4 py-2.5 text-xs font-medium text-[#f4f4f6] shadow-raycast-hud backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#59d499]/20 text-[#59d499]">
            <Check size={11} strokeWidth={3} />
          </span>
          <span>{toast}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#242728] bg-[#07080a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button onClick={back} className="flex items-center gap-3 text-left group">
            <div className="app-icon-tile h-9 w-9 bg-[#121212] border-[#242728] text-white group-hover:border-white/20">
              <ArrowDownToLine size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[#f4f4f6]">LocalDrop</span>
                <span className="badge-neutral text-[10px] py-0.5">Share</span>
              </div>
              <span className="text-[11px] text-[#9c9c9d] block -mt-0.5">即时文件分享空间</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              {auth.passwordRequired ? (
                <span className="badge-green-soft">
                  <ShieldCheck size={11} /> 安全验证通道
                </span>
              ) : (
                <span className="badge-neutral">公开访问</span>
              )}
            </span>

            {auth.passwordRequired && (
              <button
                className="btn btn-ghost px-2.5 py-1 h-7 text-xs text-[#9c9c9d] hover:text-[#ff6161]"
                onClick={logout}
                title="退出当前会话"
              >
                <LogOut size={13} />
                <span>退出</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8 w-full">
        {/* Header Breadcrumbs / Title */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#242728]/60 pb-5">
          <div>
            {selected ? (
              <div className="flex items-center gap-2 text-xs">
                <button
                  className="btn btn-secondary px-2 py-1 h-7 text-xs text-[#9c9c9d] hover:text-white"
                  onClick={back}
                >
                  <ArrowLeft size={13} />
                  <span>全部分享</span>
                </button>
                <span className="text-[#434345]">/</span>
                <span className="font-semibold text-[#f4f4f6] truncate max-w-[200px] sm:max-w-md">
                  {selected.name}
                </span>
                {parts.map((p, i) => (
                  <React.Fragment key={i}>
                    <span className="text-[#434345]">/</span>
                    <button
                      className="text-[#9c9c9d] hover:text-[#f4f4f6]"
                      onClick={() => browse(parts.slice(0, i + 1))}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-[#f4f4f6]">已分享的项目</h1>
                  <span className="keycap">{shown.length}</span>
                </div>
                <p className="text-xs text-[#9c9c9d] mt-0.5">选择项目下载至本地设备或在线查看内容</p>
              </div>
            )}
          </div>

          {/* List Search and View Toggle (Only shown when on root overview) */}
          {!selected && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a6b6c]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索分享项目..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="raycast-input pl-8 pr-7 py-1 h-8 text-xs"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 keycap">/</span>
              </div>

              <div className="flex items-center rounded-lg border border-[#242728] bg-[#0d0d0d] p-0.5">
                <button
                  type="button"
                  title="网格视图"
                  onClick={() => changeViewMode('grid')}
                  className={`flex h-7 w-7 items-center justify-center rounded transition ${
                    viewMode === 'grid' ? 'bg-[#18191b] text-white shadow-sm' : 'text-[#6a6b6c] hover:text-[#cdcdcd]'
                  }`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  title="列表视图"
                  onClick={() => changeViewMode('list')}
                  className={`flex h-7 w-7 items-center justify-center rounded transition ${
                    viewMode === 'list' ? 'bg-[#18191b] text-white shadow-sm' : 'text-[#6a6b6c] hover:text-[#cdcdcd]'
                  }`}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between rounded-lg border border-[#ff6161]/30 bg-[#ff6161]/10 px-4 py-2.5 text-xs text-[#ff6161]"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Selected Item View Modes */}
        {selected ? (
          <div>
            {/* 1. Text Viewer */}
            {selected.type === 'text' && (
              <section className="raycast-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#242728] bg-[#101111] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="app-icon-tile h-7 w-7 bg-[#b388ff]/10 text-[#b388ff] border-none">
                      <FileText size={15} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#f4f4f6]">{selected.name}</div>
                      <div className="text-[11px] text-[#9c9c9d]">{text.length} 字符</div>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary text-xs h-7 px-3"
                    onClick={async () => {
                      await navigator.clipboard.writeText(text)
                      showToast('文本已成功复制到剪贴板')
                    }}
                  >
                    <Copy size={13} />
                    <span>复制文本</span>
                  </button>
                </div>

                <div className="p-4 sm:p-5">
                  <pre className="raycast-card-elevated whitespace-pre-wrap break-words rounded-lg p-4 font-mono text-xs leading-relaxed text-[#f4f4f6] max-h-[60vh] overflow-y-auto select-all">
                    {text || '（空文本内容）'}
                  </pre>
                </div>
              </section>
            )}

            {/* 2. File Download Card */}
            {selected.type === 'file' && (
              <section className="raycast-card relative overflow-hidden p-8 text-center sm:p-12">
                <div className="raycast-hero-stripe" />
                <div className="app-icon-tile mx-auto mb-4 h-16 w-16 bg-[#57c1ff]/10 text-[#57c1ff] border-[#242728]">
                  <File size={32} />
                </div>

                <h2 className="break-all text-base font-semibold text-[#f4f4f6] max-w-lg mx-auto">
                  {selected.name}
                </h2>

                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#9c9c9d]">
                  <span>{size(selected.size)}</span>
                  {selected.status !== 'active' && (
                    <span className="badge-red-soft text-[10px]">源文件已失效</span>
                  )}
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  <button
                    className="btn btn-primary px-5 py-2 h-9 text-xs font-semibold"
                    disabled={!!download && !download.done}
                    onClick={() => downloadFile(contentUrl(selected.id, 'download'), selected.name)}
                  >
                    <Download size={14} />
                    <span>{download?.done ? '重新下载' : '立即下载文件'}</span>
                  </button>
                </div>
              </section>
            )}

            {/* 3. Directory Browser */}
            {selected.type === 'directory' && (
              <section className="raycast-card overflow-hidden">
                <div className="border-b border-[#242728] bg-[#101111] px-4 py-2.5 text-xs text-[#9c9c9d] flex items-center justify-between">
                  <span>当前路径: ~/{[selected.name, ...parts].join('/')}</span>
                  <span>{entries.length} 个子项</span>
                </div>

                {entries.length ? (
                  <div className="divide-y divide-[#242728]/60">
                    {entries.map(entry => {
                      const isDir = entry.type === 'directory'
                      const next = [...parts, entry.name]
                      return (
                        <div
                          key={entry.name}
                          className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[#121212]"
                        >
                          <div
                            className={`app-icon-tile h-8 w-8 ${
                              isDir ? 'bg-[#ffc533]/10 text-[#ffc533]' : 'bg-[#57c1ff]/10 text-[#57c1ff]'
                            } border-none`}
                          >
                            {isDir ? <Folder size={16} /> : <File size={16} />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-[#f4f4f6]">
                              {entry.name}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#9c9c9d]">
                              {isDir ? '目录' : size(entry.size)}
                            </div>
                          </div>

                          {isDir ? (
                            <button
                              className="btn btn-secondary px-2.5 py-1 h-7 text-xs"
                              onClick={() => browse(next)}
                            >
                              <span>打开</span>
                              <ArrowRight size={13} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost px-2.5 py-1 h-7 text-xs text-[#9c9c9d] hover:text-white"
                              disabled={!!download && !download.done}
                              onClick={() => downloadFile(contentUrl(selected.id, 'download', next), entry.name)}
                            >
                              <Download size={13} />
                              <span>下载</span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center text-xs text-[#9c9c9d]">此文件夹为空</div>
                )}
              </section>
            )}
          </div>
        ) : (
          /* Root Overview: Grid or List View */
          <div>
            {shown.length === 0 ? (
              <div className="raycast-card p-12 text-center">
                <div className="app-icon-tile mx-auto mb-3 h-12 w-12 bg-[#121212] text-[#9c9c9d]">
                  <HardDrive size={22} />
                </div>
                <h3 className="text-sm font-medium text-[#f4f4f6]">
                  {query ? '没有找到匹配的分享项目' : '暂时没有分享内容'}
                </h3>
                <p className="mt-1 text-xs text-[#9c9c9d]">
                  {query ? '请检查搜索关键词' : '分享者尚未添加项目或已清空列表'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              /* Raycast Store Extension Cards Grid */
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map(item => {
                  const Icon = item.type === 'text' ? FileText : item.type === 'directory' ? Folder : File
                  const isFile = item.type === 'file'
                  const isDir = item.type === 'directory'
                  const colorClass = isDir
                    ? 'text-[#ffc533] bg-[#ffc533]/10'
                    : item.type === 'text'
                    ? 'text-[#b388ff] bg-[#b388ff]/10'
                    : 'text-[#57c1ff] bg-[#57c1ff]/10'

                  return (
                    <div
                      key={item.id}
                      onClick={() => open(item)}
                      className="raycast-card group flex flex-col justify-between p-4 cursor-pointer transition hover:border-white/30 hover:bg-[#121212]"
                    >
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <div className={`app-icon-tile h-10 w-10 ${colorClass} border-transparent`}>
                            <Icon size={20} />
                          </div>

                          <span className="badge-neutral text-[10px]">
                            {isDir ? '文件夹' : item.type === 'text' ? '文本' : '文件'}
                          </span>
                        </div>

                        <div
                          className="truncate text-xs font-semibold text-[#f4f4f6] group-hover:text-white"
                          title={item.name}
                        >
                          {item.name}
                        </div>

                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#9c9c9d]">
                          <span>{size(item.size)}</span>
                          {item.status !== 'active' && (
                            <span className="badge-red-soft text-[10px] py-0">失效</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#242728]/60 flex items-center justify-between">
                        <span className="text-[11px] text-[#6a6b6c]">
                          {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                        </span>

                        {isFile && item.status === 'active' ? (
                          <button
                            className="btn btn-secondary px-2.5 py-1 h-7 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              downloadFile(contentUrl(item.id, 'download'), item.name)
                            }}
                          >
                            <Download size={12} />
                            <span>下载</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#9c9c9d] flex items-center gap-1 group-hover:text-white">
                            <span>打开</span>
                            <ArrowRight size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Raycast Command Palette Row List */
              <div className="raycast-card overflow-hidden divide-y divide-[#242728]/60">
                {shown.map(item => {
                  const Icon = item.type === 'text' ? FileText : item.type === 'directory' ? Folder : File
                  const isFile = item.type === 'file'
                  const isDir = item.type === 'directory'
                  const colorClass = isDir
                    ? 'text-[#ffc533] bg-[#ffc533]/10'
                    : item.type === 'text'
                    ? 'text-[#b388ff] bg-[#b388ff]/10'
                    : 'text-[#57c1ff] bg-[#57c1ff]/10'

                  return (
                    <div
                      key={item.id}
                      onClick={() => open(item)}
                      className="group flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#121212]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`app-icon-tile h-8 w-8 ${colorClass} border-transparent`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div
                            className="truncate text-xs font-semibold text-[#f4f4f6] group-hover:text-white"
                            title={item.name}
                          >
                            {item.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9c9c9d]">
                            <span>{isDir ? '文件夹' : item.type === 'text' ? '文本' : '文件'}</span>
                            <span className="text-[#434345]">·</span>
                            <span>{size(item.size)}</span>
                            {item.status !== 'active' && (
                              <span className="badge-red-soft text-[10px] py-0">源文件已失效</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isFile && item.status === 'active' && (
                          <button
                            className="btn btn-secondary px-2.5 py-1 h-7 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              downloadFile(contentUrl(item.id, 'download'), item.name)
                            }}
                          >
                            <Download size={13} />
                            <span>下载</span>
                          </button>
                        )}
                        {isDir && (
                          <span className="text-[#6a6b6c] group-hover:text-white">
                            <ArrowRight size={15} />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Floating Download Stream HUD */}
        {download && (
          <div className="raycast-card mt-6 p-4 border border-[#242728] shadow-raycast-hud">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[#f4f4f6] truncate">{download.name}</span>
              <span className="font-mono text-[#9c9c9d]">
                {download.total ? `${size(download.loaded)} / ${size(download.total)}` : size(download.loaded)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#18191b]">
              <div
                className="h-full rounded-full bg-white transition-all duration-150"
                style={{ width: `${download.progress}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[#9c9c9d]">
              {download.done ? '下载完成' : download.total ? `${download.progress}% · 传输中` : '正在传输数据…'}
            </div>
          </div>
        )}

        {/* Raycast Visitor Upload Dropzone (When enabled) */}
        {allowUpload && (
          <section className="raycast-card mt-8 p-5 border border-[#242728]">
            <div className="mb-1 flex items-center gap-2">
              <UploadCloud size={16} className="text-[#59d499]" />
              <h3 className="text-xs font-semibold text-[#f4f4f6]">发送文件至分享者设备</h3>
            </div>
            <p className="mb-4 text-[11px] text-[#9c9c9d]">
              上传的文件将直接保存在对方主机的 LocalDrop 插件数据目录
            </p>

            <div
              onDragOver={e => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                uploadFiles(e.dataTransfer.files)
              }}
              className={`rounded-lg border border-dashed p-6 text-center transition ${
                isDragging
                  ? 'border-white bg-[#18191b]'
                  : 'border-[#242728] bg-[#101111] hover:border-white/25'
              }`}
            >
              <UploadCloud size={24} className="mx-auto mb-2 text-[#9c9c9d]" />
              <p className="text-xs text-[#f4f4f6]">拖放文件至此处，或点击按钮选取</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="mt-3 text-xs text-[#9c9c9d] file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-black hover:file:bg-[#e8e8e8] cursor-pointer"
                onChange={e => uploadFiles(e.target.files)}
              />
            </div>

            {upload && (
              <div className="mt-4 rounded border border-[#242728] bg-[#101111] p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[#f4f4f6]">
                    {upload.done && <CheckCircle2 size={13} className="mr-1 inline text-[#59d499]" />}
                    {upload.name}
                  </span>
                  <span className="font-mono text-[#9c9c9d]">{upload.progress}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[#18191b]">
                  <div
                    className="h-full rounded-full bg-[#59d499] transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Raycast Minimal Footer */}
      <footer className="border-t border-[#242728]/70 py-6 text-center text-[11px] text-[#6a6b6c]">
        LocalDrop · 局域网极速直连与 Cloudflare 临时穿透
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
