import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, File, FileText, Folder, LayoutGrid, List, LockKeyhole, LogOut, Search, ShieldCheck, UploadCloud, X } from 'lucide-react'
import '../styles.css'

const size = n => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n || 0} B`
async function get(url) { const res = await fetch(url, { credentials: 'same-origin' }); const value = await res.json(); if (!res.ok) throw new Error(value.error || '请求失败'); return value }
function contentUrl(id, action, parts = []) { const url = new URL(`/api/shares/${id}/${action}`, location.origin); if (parts.length) url.searchParams.set('path', parts.map(encodeURIComponent).join('/')); return url.toString() }

function App() {
  const [auth, setAuth] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shares, setShares] = useState([])
  const [allowUpload, setAllowUpload] = useState(false)
  const [selected, setSelected] = useState(null)
  const [parts, setParts] = useState([])
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('localdrop_site_view') || 'grid' } catch { return 'grid' }
  })
  const [upload, setUpload] = useState(null)
  const [download, setDownload] = useState(null)
  const inputRef = useRef(null)

  const changeViewMode = mode => {
    setViewMode(mode)
    try { localStorage.setItem('localdrop_site_view', mode) } catch {}
  }

  async function loadShares() {
    const data = await get('/api/shares')
    setShares(data.shares); setAllowUpload(data.allowUpload)
    const params = new URLSearchParams(location.search)
    const shareId = params.get('share')
    const downloadId = params.get('download')
    if (downloadId) {
      const item = data.shares.find(x => x.id === downloadId)
      if (item?.type === 'file') {
        window.setTimeout(() => { window.location.assign(contentUrl(item.id, 'download')) }, 0)
        return
      }
    }
    if (shareId) { const item = data.shares.find(x => x.id === shareId); if (item) open(item) }
  }
  useEffect(() => { get('/api/auth/status').then(data => { setAuth(data); if (data.authenticated) loadShares().catch(e => setError(e.message)) }).catch(e => setError(e.message)) }, [])

  async function login(e) {
    e.preventDefault(); setLoading(true); setError('')
    try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setAuth({ authenticated: true, passwordRequired: true }); setPassword(''); await loadShares() }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); setAuth({ authenticated: false, passwordRequired: true }); setSelected(null); setShares([]); history.replaceState(null, '', '/') }
  async function open(item) {
    setError(''); setSelected(item); setParts([]); history.replaceState(null, '', `/?share=${item.id}`)
    try {
      if (item.type === 'text') { const data = await get(contentUrl(item.id, 'content')); setText(data.text) }
      else if (item.type === 'directory') { const data = await get(contentUrl(item.id, 'browse')); setEntries(data.entries) }
    } catch (e) { setError(e.message) }
  }
  async function browse(next) { setError(''); try { const data = await get(contentUrl(selected.id, 'browse', next)); setParts(next); setEntries(data.entries) } catch (e) { setError(e.message) } }
  function back() { setSelected(null); setParts([]); setText(''); history.replaceState(null, '', '/') }
  async function downloadFile(url, name) {
    setError('')
    setDownload({ name, loaded: 0, total: 0, progress: 0 })
    try {
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(value.error || '下载失败') }
      const total = Number(response.headers.get('content-length')) || 0
      const reader = response.body?.getReader()
      if (!reader) throw new Error('当前浏览器不支持流式下载')
      const chunks = []
      let loaded = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        chunks.push(part.value)
        loaded += part.value.byteLength
        setDownload({ name, loaded, total, progress: total ? Math.round(loaded / total * 100) : 0 })
      }
      const blob = new Blob(chunks)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = name
      link.click()
      URL.revokeObjectURL(link.href)
      setDownload({ name, loaded, total: total || loaded, progress: 100, done: true })
    } catch (e) { setError(e.message); setDownload(null) }
  }
  function uploadFiles(files) {
    if (!files?.length || !allowUpload) return
    const queue = Array.from(files)
    const run = index => {
      if (index >= queue.length) {
        loadShares().catch(e => setError(e.message))
        setUpload({ done: true, progress: 100, name: `${queue.length} 个文件上传完成` })
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      const file = queue[index]
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/uploads?name=${encodeURIComponent(file.name)}`)
      xhr.upload.onprogress = event => { if (event.lengthComputable) setUpload({ name: file.name, progress: Math.round((index + event.loaded / event.total) / queue.length * 100) }) }
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) run(index + 1); else { let message = '上传失败'; try { message = JSON.parse(xhr.responseText).error || message } catch {} setError(message); setUpload(null) } }
      xhr.onerror = () => { setError('网络连接中断，上传失败'); setUpload(null) }
      setUpload({ name: file.name, progress: Math.round(index / queue.length * 100) })
      xhr.send(file)
    }
    setError(''); run(0)
  }
  const shown = shares.filter(x => x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  if (!auth) return <div className="flex min-h-screen items-center justify-center bg-[#111525] text-slate-300">正在连接站点…</div>
  if (!auth.authenticated) return <div className="flex min-h-screen items-center justify-center bg-[#111525] px-5"><div className="glass w-full max-w-md rounded-3xl p-8 text-center"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-200 text-slate-900"><LockKeyhole size={30}/></div><h1 className="text-2xl font-bold">欢迎来到 LocalDrop</h1><p className="mt-2 text-sm text-slate-400">输入站点密码以访问分享空间</p><form onSubmit={login} className="mt-8 text-left"><label className="label">站点密码</label><input autoFocus type="password" className="input mt-2" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码"/><button disabled={loading || !password} className="btn btn-primary mt-4 w-full">{loading ? '验证中…' : '进入站点'} <ArrowRight size={16}/></button></form>{error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}<p className="mt-7 text-xs text-slate-500">支持局域网直连与公网安全分享</p></div></div>

  return <div className="min-h-screen bg-[#111525] text-slate-100"><header className="border-b border-white/[.07] bg-[#161b2d]"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-5"><button onClick={back} className="flex items-center gap-3 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-200 text-slate-900"><Download size={21}/></div><div><div className="font-bold">LocalDrop</div><div className="text-xs text-slate-400">文件分享站点</div></div></button><div className="flex items-center gap-2"><span className="hidden items-center gap-1 text-xs text-emerald-200 sm:flex"><ShieldCheck size={15}/> {auth.passwordRequired ? '安全连接' : '公开访问'}</span>{auth.passwordRequired && <button className="btn btn-ghost px-2 text-xs" onClick={logout}><LogOut size={15}/> 退出</button>}</div></div></header>
  <main className="mx-auto max-w-5xl px-5 pb-16 pt-10"><div className="mb-8"><div className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-emerald-200">LOCAL SHARING SPACE</div><h1 className="text-3xl font-bold tracking-tight md:text-4xl">{selected ? selected.name : '你的分享空间'}</h1><p className="mt-3 text-sm text-slate-400">{selected ? selected.type === 'directory' ? '浏览文件夹并下载需要的文件' : selected.type === 'text' ? '查看并复制分享的文本' : '文件已准备好下载' : '所有可用的分享项目都在这里'}</p></div>
  {error && <div role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
  {selected ? <><div className="mb-5 flex flex-wrap items-center gap-2 text-sm"><button className="btn btn-ghost px-2" onClick={back}><ArrowLeft size={16}/> 全部分享</button>{parts.map((part, i) => <React.Fragment key={i}><span className="text-slate-600">/</span><button className="text-slate-300 hover:text-emerald-200" onClick={() => browse(parts.slice(0, i + 1))}>{part}</button></React.Fragment>)}</div>
    {selected.type === 'text' && <section className="glass rounded-2xl p-6"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><FileText size={18} className="text-violet-200"/> 文本内容</div><button className="btn btn-secondary text-sm" onClick={async () => { await navigator.clipboard.writeText(text); setError('已复制文本') }}><Copy size={15}/> 复制</button></div><pre className="whitespace-pre-wrap break-words rounded-xl bg-[#121728] p-5 font-sans text-sm leading-7 text-slate-200">{text}</pre></section>}
    {selected.type === 'file' && <section className="glass flex flex-col items-center rounded-2xl p-10 text-center"><File size={44} className="mb-5 text-sky-200"/><h2 className="break-all text-lg font-semibold">{selected.name}</h2><p className="mt-2 text-sm text-slate-400">{size(selected.size)}{selected.status !== 'active' ? ' · 源文件已失效' : ''}</p><button className="btn btn-primary mt-6" disabled={!!download && !download.done} onClick={() => downloadFile(contentUrl(selected.id, 'download'), selected.name)}><Download size={17}/> {download?.done ? '重新下载' : '下载文件'}</button></section>}
    {selected.type === 'directory' && <section className="glass overflow-hidden rounded-2xl">{entries.length ? entries.map(entry => { const isDir = entry.type === 'directory'; const next = [...parts, entry.name]; return <div key={entry.name} className="flex items-center gap-3 border-b border-white/[.06] px-4 py-4 last:border-0"><div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${isDir ? 'bg-amber-200/10 text-amber-200' : 'bg-sky-200/10 text-sky-200'}`}>{isDir ? <Folder size={20}/> : <File size={20}/>}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{entry.name}</div><div className="mt-1 text-xs text-slate-400">{isDir ? '文件夹' : size(entry.size)}</div></div>{isDir ? <button className="btn btn-ghost px-2" onClick={() => browse(next)}><ArrowRight size={17}/></button> : <button className="btn btn-ghost px-2" disabled={!!download && !download.done} onClick={() => downloadFile(contentUrl(selected.id, 'download', next), entry.name)}><Download size={17}/></button>}</div> }) : <div className="p-12 text-center text-sm text-slate-400">此文件夹为空</div>}</section>}
  </> : <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-400">共 {shown.length} 个分享项目</div><div className="flex w-full items-center gap-2 sm:w-auto"><div className="flex items-center rounded-xl border border-white/5 bg-slate-800/80 p-1"><button type="button" title="块状视图（网格）" onClick={() => changeViewMode('grid')} className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${viewMode === 'grid' ? 'bg-emerald-300 font-bold text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><LayoutGrid size={16}/></button><button type="button" title="列表视图（列）" onClick={() => changeViewMode('list')} className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${viewMode === 'list' ? 'bg-emerald-300 font-bold text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><List size={16}/></button></div><div className="relative flex-1 sm:w-64"><Search size={16} className="absolute left-3 top-3.5 text-slate-500"/><input className="input pl-9" placeholder="搜索分享项目" value={query} onChange={e => setQuery(e.target.value)}/></div></div></div>{viewMode === 'grid' ? <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map(item => { const Icon = item.type === 'text' ? FileText : item.type === 'directory' ? Folder : File; return <button key={item.id} onClick={() => open(item)} className="glass group min-h-44 rounded-2xl p-5 text-left transition hover:-translate-y-1 hover:border-emerald-300/30"><div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${item.type === 'directory' ? 'bg-amber-200/10 text-amber-200' : item.type === 'text' ? 'bg-violet-200/10 text-violet-200' : 'bg-sky-200/10 text-sky-200'}`}><Icon size={24}/></div><div className="truncate font-semibold group-hover:text-emerald-200">{item.name}</div><div className="mt-2 text-xs text-slate-400">{item.type === 'directory' ? '文件夹' : item.type === 'text' ? '文本' : '文件'} · {size(item.size)}</div>{item.status !== 'active' && <div className="mt-2 text-xs text-rose-300">源文件已失效</div>}</button> })}</section> : <section className="glass overflow-hidden rounded-2xl divide-y divide-white/[.06]">{shown.map(item => { const Icon = item.type === 'text' ? FileText : item.type === 'directory' ? Folder : File; const isFile = item.type === 'file'; const isDir = item.type === 'directory'; return <div key={item.id} onClick={() => open(item)} className="group flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-white/[.03] md:px-5"><div className="flex min-w-0 items-center gap-3.5"><div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${item.type === 'directory' ? 'bg-amber-200/10 text-amber-200' : item.type === 'text' ? 'bg-violet-200/10 text-violet-200' : 'bg-sky-200/10 text-sky-200'}`}><Icon size={20}/></div><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-100 group-hover:text-emerald-200" title={item.name}>{item.name}</div><div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400"><span>{item.type === 'directory' ? '文件夹' : item.type === 'text' ? '文本' : '文件'}</span><span>·</span><span>{size(item.size)}</span>{item.status !== 'active' && <span className="text-rose-300">· 源文件已失效</span>}</div></div></div><div className="flex flex-none items-center gap-2">{isFile && item.status === 'active' && <button title="下载文件" className="btn btn-ghost h-9 px-2.5 text-xs text-slate-300 hover:text-emerald-200" onClick={e => { e.stopPropagation(); downloadFile(contentUrl(item.id, 'download'), item.name) }}><Download size={15}/><span className="hidden sm:inline">下载</span></button>}{isDir && <span className="flex h-8 w-8 items-center justify-center text-slate-400 group-hover:text-emerald-200"><ArrowRight size={16}/></span>}{item.type === 'text' && <span className="text-xs text-slate-400 group-hover:text-emerald-200">查看</span>}</div></div> })}</section>}{!shown.length && <div className="glass rounded-2xl px-6 py-16 text-center text-sm text-slate-400">{query ? '没有找到匹配的项目' : '暂时没有分享项目'}</div>}</>}

  {download && <div className="glass mt-6 rounded-2xl p-5"><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="truncate">{download.name}</span><span>{download.total ? `${size(download.loaded)} / ${size(download.total)}` : size(download.loaded)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-200 transition-all" style={{ width: `${download.progress}%` }}/></div><div className="mt-2 text-xs text-slate-400">{download.done ? '下载完成' : download.total ? `${download.progress}% · 正在下载` : '正在下载'}</div></div>}

  {allowUpload && <section className="glass mt-10 rounded-2xl p-5"><div className="mb-1 flex items-center gap-2 font-semibold"><UploadCloud size={19} className="text-emerald-200"/> 上传到分享者设备</div><p className="mb-5 text-xs text-slate-400">文件会保存到分享者的 LocalDrop uploads 目录</p><div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); uploadFiles(e.dataTransfer.files) }} className="rounded-xl border border-dashed border-slate-600 bg-slate-800/30 p-8 text-center"><UploadCloud size={30} className="mx-auto mb-3 text-emerald-200"/><p className="text-sm">拖拽文件到这里，或选择文件上传</p><input ref={inputRef} type="file" multiple className="mt-4 max-w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-200 file:px-3 file:py-2 file:font-semibold file:text-slate-900" onChange={e => uploadFiles(e.target.files)}/></div>{upload && <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="truncate">{upload.done && <CheckCircle2 size={14} className="mr-1 inline text-emerald-200"/>}{upload.name}</span><span>{upload.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-200 transition-all" style={{ width: `${upload.progress}%` }}/></div></div>}</section>}
  </main><footer className="border-t border-white/[.06] py-7 text-center text-xs text-slate-500">LocalDrop · 便捷安全的文件分享空间</footer></div>
}

createRoot(document.getElementById('root')).render(<App/>)
