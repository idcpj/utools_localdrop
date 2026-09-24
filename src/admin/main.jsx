import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowDownToLine, Copy, File, FileText, Folder, Globe2, HardDrive, KeyRound, Pause, Play, Plus, Power, QrCode, RefreshCw, Settings2, ShieldCheck, Trash2, Upload, Wifi, X } from 'lucide-react'
import '../styles.css'

const api = window.localdrop
const formatSize = n => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n || 0} B`
const typeIcon = { text: FileText, file: File, directory: Folder }
const typeLabel = { text: '文本', file: '文件', directory: '文件夹' }

function App() {
  const [data, setData] = useState(null)
  const [pending, setPending] = useState(null)
  const [tab, setTab] = useState('overview')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState(null)
  const [config, setConfig] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function refresh() { setData(await api.snapshot()) }
  useEffect(() => {
    refresh().catch(error => setNotice(error.message))
    setPending(api.pending())
    const off = api.onPending(value => { setPending(value); if (value?.type === 'files' && value.status === 'done') refresh().catch(() => {}) })
    const timer = setInterval(() => refresh().catch(() => {}), 5000)
    if (api.startError) setNotice(api.startError)
    return () => { off(); clearInterval(timer) }
  }, [])
  useEffect(() => { if (data && !config) setConfig({ ip: data.settings.ip, port: data.settings.port }) }, [data])

  async function action(work, message) {
    setBusy(true); setNotice('')
    try { const result = await work(); setData(result?.settings ? result : await api.snapshot()); if (message) setNotice(message) }
    catch (error) { setNotice(error.message || '操作失败') }
    finally { setBusy(false) }
  }
  const copy = async value => {
    try {
      await Promise.resolve(api.copy(value))
      setToast('链接已复制到剪贴板')
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(''), 2200)
    } catch (error) { setToast(error.message || '复制失败') }
  }
  const shareBaseUrl = data?.tunnel?.url || data?.url
  const itemUrl = item => item.type === 'file'
    ? `${shareBaseUrl}/api/shares/${encodeURIComponent(item.id)}/download?token=${encodeURIComponent(item.downloadToken)}`
    : `${shareBaseUrl}/?share=${encodeURIComponent(item.id)}`
  const sharePaths = async paths => { if (paths?.length) await action(() => api.addPaths(paths), `已添加 ${paths.length} 个分享项`) }
  const saveConfig = () => action(() => api.updateSettings({ ip: config.ip, port: Number(config.port) }), '访问地址已更新')
  const savePassword = () => action(async () => { const result = await api.updateSettings({ password }); setPassword(''); return result }, password ? '站点密码已更新' : '站点密码已清除')
  const toggleTunnel = () => action(() => data?.tunnel?.running ? api.stopTunnel() : api.startTunnel(), data?.tunnel?.running ? '公网隧道已关闭' : '公网隧道已启动')

  return <div className="min-h-screen bg-[#111525] text-slate-100">
    {toast && <div role="status" aria-live="polite" className="pointer-events-none fixed right-5 top-5 z-50 rounded-xl border border-emerald-200/25 bg-[#202a3d]/95 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-2xl shadow-black/30 backdrop-blur-sm">{toast}</div>}
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-7 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-200 text-slate-900"><ArrowDownToLine size={25}/></div><div><h1 className="text-xl font-bold tracking-tight">LocalDrop</h1><p className="text-xs text-slate-400">让文件在局域网里自由流动</p></div></div>
        <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${data?.running ? 'bg-emerald-400/15 text-emerald-200' : 'bg-slate-700/60 text-slate-300'}`}>{data?.running ? '● 服务运行中' : '○ 服务已停止'}</span><button title="打开设置" onClick={() => setSettingsOpen(true)} className="btn btn-secondary px-3"><Settings2 size={17}/><span className="hidden sm:inline">设置</span></button></div>
      </header>

      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>}
      {pending && <div className={`glass mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 ${pending.status === 'error' ? 'border-rose-300/30' : 'border-emerald-300/30'}`}><div><div className={`mb-1 text-sm font-semibold ${pending.status === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}>{pending.status === 'processing' ? '正在处理 uTools 分享…' : pending.status === 'error' ? '自动分享失败' : pending.autoStarted ? '服务已自动启动，文件已添加' : '文件已直接添加到分享'}</div><div className="text-sm text-slate-300">{pending.type === 'files' ? `${pending.paths.length} 个文件或文件夹` : `已接收文本：${pending.text.slice(0, 60)}`}{pending.error ? ` · ${pending.error}` : ''}</div></div><div className="flex gap-2"><button className="btn btn-ghost" onClick={() => api.consumePending()}><X size={16}/> 关闭</button>{pending.type !== 'files' || pending.status === 'error' ? <button className="btn btn-primary" onClick={async () => { if (pending.type === 'files') await sharePaths(pending.paths); else { setText(pending.text); setTab('create') } api.consumePending() }}>{pending.type === 'files' ? '重试分享' : '编辑文本'}</button> : null}</div></div>}

      <div className="grid gap-6 lg:grid-cols-1">
        <main className="min-w-0">
          <section className="glass relative overflow-hidden rounded-3xl p-6 md:p-8"><div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl"/><div className="relative"><div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-emerald-200"><Wifi size={14}/> 局域网访问地址</div><h2 className="break-all text-2xl font-bold tracking-tight md:text-3xl">{data?.url || '启动服务后生成访问地址'}</h2><p className="mt-3 text-sm text-slate-400">同一局域网内的设备可以通过此地址访问分享站点</p><div className="mt-6 flex flex-wrap gap-2"><button disabled={!data?.url} onClick={() => copy(data.url)} className="btn btn-primary"><Copy size={16}/> 复制链接</button><button disabled={!data?.url} onClick={() => setQr({ url: data.url, title: '扫码访问分享站点' })} className="btn btn-secondary"><QrCode size={17}/> 显示二维码</button></div></div></section>

          <div className="mt-7 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">分享项目</h2><p className="mt-1 text-xs text-slate-400">{data?.shares.length || 0} 个项目正在列表中</p></div><button onClick={() => setTab(tab === 'create' ? 'overview' : 'create')} className="btn btn-primary"><Plus size={17}/> 新建分享</button></div>

          {tab === 'create' && <section className="glass mt-4 rounded-2xl p-5"><h3 className="mb-4 font-semibold">创建分享</h3><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => api.chooseFiles().then(sharePaths)} className="flex min-h-24 flex-col items-start justify-center rounded-xl border border-dashed border-slate-600 bg-slate-800/40 p-4 text-left hover:border-emerald-300"><File size={20} className="mb-2 text-emerald-200"/><span className="text-sm font-semibold">选择文件</span><span className="text-xs text-slate-400">支持一次选择多个文件</span></button><button onClick={() => api.chooseFolder().then(sharePaths)} className="flex min-h-24 flex-col items-start justify-center rounded-xl border border-dashed border-slate-600 bg-slate-800/40 p-4 text-left hover:border-emerald-300"><Folder size={20} className="mb-2 text-emerald-200"/><span className="text-sm font-semibold">选择文件夹</span><span className="text-xs text-slate-400">保留原始位置</span></button></div><div className="mt-5 border-t border-white/10 pt-5"><label className="label">文本名称</label><input className="input mt-2" value={name} onChange={e => setName(e.target.value)} placeholder="例如：会议记录"/><label className="label mt-4 block">文本内容</label><textarea className="input mt-2 min-h-32 resize-y" value={text} onChange={e => setText(e.target.value)} placeholder="在这里输入要分享的文本…"/><button disabled={busy || !text.trim()} onClick={() => action(async () => { await api.createText(name, text); setName(''); setText(''); setTab('overview') }, '文本已分享')} className="btn btn-primary mt-3">分享文本</button></div></section>}

          <section className="glass mt-4 overflow-hidden rounded-2xl">{data?.shares.length ? <div>{data.shares.map(item => { const Icon = typeIcon[item.type] || File; return <div key={item.id} className="flex items-center gap-3 border-b border-white/[.06] px-4 py-4 last:border-0 md:px-5"><div className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${item.type === 'directory' ? 'bg-amber-300/10 text-amber-200' : item.type === 'text' ? 'bg-violet-300/10 text-violet-200' : 'bg-sky-300/10 text-sky-200'}`}><Icon size={21}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.name}</div><div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400"><span>{typeLabel[item.type]}</span><span>·</span><span>{formatSize(item.size)}</span><span>·</span><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>{item.status !== 'active' && <span className="text-rose-300">· 已失效</span>}</div></div><button title={item.type === 'file' ? '复制文件下载地址' : '复制项目地址'} disabled={!data.url} className="btn btn-ghost px-2" onClick={() => copy(itemUrl(item))}><Copy size={16}/></button><button title="显示二维码" disabled={!data.url} className="btn btn-ghost px-2" onClick={() => setQr({ url: itemUrl(item), title: item.type === 'file' ? '扫码下载文件' : '扫码访问分享项目' })}><QrCode size={16}/></button><button title="删除分享" className="btn btn-ghost px-2 hover:text-rose-300" onClick={() => action(() => api.remove(item.id), '已删除分享项')}><Trash2 size={16}/></button></div> })}</div> : <div className="flex flex-col items-center px-6 py-14 text-center"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-700/50 text-emerald-200"><HardDrive size={28}/></div><h3 className="font-semibold">还没有分享项目</h3><p className="mt-2 max-w-xs text-sm text-slate-400">选择文件、文件夹，或输入文本，即可分享给同一局域网中的设备。</p></div>}</section>
          {!!data?.shares.length && <button className="btn btn-ghost mt-3 text-xs hover:text-rose-300" onClick={() => { if (window.confirm(`确定清空全部 ${data.shares.length} 个分享项吗？`)) action(() => api.clear(), '列表已清空') }}><Trash2 size={14}/> 清空列表</button>}
        </main>


      </div>
    </div>
    {settingsOpen && data && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-5" onClick={() => setSettingsOpen(false)}><section className="glass max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-6" onClick={e => e.stopPropagation()}><div className="mb-6 flex items-center justify-between"><div><h2 className="text-xl font-bold">统一设置</h2><p className="mt-1 text-xs text-slate-400">服务、网络、上传和站点安全都在这里管理</p></div><button className="btn btn-ghost px-2" title="关闭设置" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div><div className="space-y-6"><section><div className="mb-4 flex items-center gap-2 font-semibold"><Power size={18} className="text-emerald-200"/> 服务启动</div><div className="mb-3 flex items-center justify-between rounded-xl bg-slate-800/50 p-4"><div><div className="text-sm font-semibold">当前状态：{data.running ? '运行中' : '已停止'}</div><div className="mt-1 text-xs text-slate-400">文件触发分享时会自动启动服务</div></div><button onClick={() => action(() => data.running ? api.stop() : api.start(), data.running ? '服务已停止' : '服务已启动')} disabled={busy} className={`btn ${data.running ? 'btn-secondary' : 'btn-primary'}`}>{data.running ? <Pause size={16}/> : <Play size={16}/>} {data.running ? '停止服务' : '启动服务'}</button></div><div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4"><div><div className="text-sm font-semibold">插件启动时自动启动服务</div><div className="mt-1 text-xs text-slate-400">文件触发分享时始终会自动启动服务</div></div><input type="checkbox" className="h-5 w-5 accent-emerald-300" checked={!!data.settings.autoStart} onChange={e => action(() => api.updateSettings({ autoStart: e.target.checked }))}/></div></section><section className="border-t border-white/10 pt-6"><div className="mb-4 flex items-center gap-2 font-semibold"><Wifi size={18} className="text-emerald-200"/> 网络服务</div><label className="label">局域网 IP</label><select className="input mt-2" value={config?.ip || ''} onChange={e => setConfig({ ...config, ip: e.target.value })}><option value="127.0.0.1">127.0.0.1 · 仅本机</option>{data.addresses.map(x => <option key={`${x.name}-${x.address}`} value={x.address}>{x.address} · {x.name}</option>)}</select><label className="label mt-4 block">服务端口</label><input className="input mt-2" type="number" min="1024" max="65535" value={config?.port || ''} onChange={e => setConfig({ ...config, port: e.target.value })}/><button className="btn btn-secondary mt-4" disabled={busy || !config} onClick={saveConfig}><RefreshCw size={15}/> 保存网络设置</button></section><section className="border-t border-white/10 pt-6"><div className="mb-4 flex items-center gap-2 font-semibold"><Globe2 size={18} className="text-emerald-200"/> 公网临时分享</div><div className="rounded-xl bg-slate-800/50 p-4"><div className="text-sm font-semibold">Cloudflare Quick Tunnel</div><div className="mt-1 text-xs leading-relaxed text-slate-400">公网地址是临时的，仅在当前服务运行期间有效。首次启动会下载 cloudflared 到插件数据目录。</div><div className="mt-4 flex flex-wrap items-center gap-2"><button className={`btn ${data.tunnel?.running ? 'btn-secondary' : 'btn-primary'}`} disabled={busy || data.tunnel?.starting || !data.settings.hasPassword} onClick={toggleTunnel}>{data.tunnel?.starting ? '连接中…' : data.tunnel?.running ? '关闭公网分享' : '开启公网分享'}</button>{!data.settings.hasPassword && <span className="text-xs text-amber-200">请先设置站点密码</span>}</div>{data.tunnel?.url && <><div className="mt-4 break-all rounded-lg bg-slate-900/70 p-3 text-xs text-emerald-200">{data.tunnel.url}</div><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={() => copy(data.tunnel.url)}><Copy size={15}/> 复制公网地址</button><button className="btn btn-secondary" onClick={() => setQr({ url: data.tunnel.url, title: '扫码访问公网分享' })}><QrCode size={15}/> 公网二维码</button></div></>}{data.tunnel?.error && <div className="mt-3 text-xs text-rose-300">{data.tunnel.error}</div>}</div></section><section className="border-t border-white/10 pt-6"><div className="mb-4 flex items-center gap-2 font-semibold"><Upload size={18} className="text-emerald-200"/> 访客上传</div><div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4"><div><div className="text-sm font-semibold">允许访客上传文件</div><div className="mt-1 text-xs text-slate-400">文件保存到插件数据目录的 uploads 文件夹</div></div><input type="checkbox" className="h-5 w-5 accent-emerald-300" checked={!!data.settings.allowUpload} onChange={e => action(() => api.updateSettings({ allowUpload: e.target.checked }))}/></div></section><section className="border-t border-white/10 pt-6"><div className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-200"/> 站点密码</div><p className="mb-4 text-xs leading-relaxed text-slate-400">{data.settings.hasPassword ? '访问站点需要输入密码。修改密码后，访客需要重新登录。' : '当前未设置密码，局域网内的设备可直接访问。'}</p><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位的新密码"/><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={savePassword} disabled={busy || password.length < 6}><KeyRound size={15}/> {data.settings.hasPassword ? '修改密码' : '设置密码'}</button>{data.settings.hasPassword && <button className="btn btn-ghost text-xs" onClick={() => { if (window.confirm('确定清除站点密码吗？')) action(() => api.updateSettings({ password: '' }), '站点密码已清除') }}>清除密码</button>}</div></section></div></section></div>}
    {qr && <div className="fixed inset-0 z-20 overflow-y-auto bg-black/70 p-4 sm:p-6" onClick={() => setQr(null)}><div className="flex min-h-full items-center justify-center"><div className="glass w-full max-w-md rounded-2xl p-5 text-center sm:p-7" onClick={e => e.stopPropagation()}><div className="mb-4 text-lg font-bold">{qr.title}</div><div className="mx-auto w-fit max-w-full rounded-xl bg-white p-3 sm:p-4"><QRCodeSVG value={qr.url} size={220} className="block h-auto max-w-full"/></div><div className="mx-auto mt-4 max-w-full break-all px-1 text-xs leading-5 text-slate-300">{qr.url}</div><button className="btn btn-secondary mt-5 w-full" onClick={() => setQr(null)}>关闭</button></div></div></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App/>)
