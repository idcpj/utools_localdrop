import React, { useEffect, useId, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  FileText,
  Folder,
  Globe2,
  HardDrive,
  KeyRound,
  Pause,
  Play,
  Plus,
  Power,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react'
import '../styles.css'

const mockApi = {
  snapshot: async () => ({
    running: true,
    settings: { ip: '192.168.1.108', port: 53317, autoStart: true, allowUpload: true, hasPassword: true },
    addresses: [
      { name: 'Wi-Fi', address: '192.168.1.108' },
      { name: 'Ethernet', address: '10.0.0.12' },
    ],
    url: 'http://192.168.1.108:53317',
    shares: [
      { id: '1', name: 'Design_System_Spec.pdf', type: 'file', size: 14200000, createdAt: Date.now() - 3600000, status: 'active', downloadToken: 'tok1' },
      { id: '2', name: 'UI_Icons_Export', type: 'directory', size: 48600000, createdAt: Date.now() - 10800000, status: 'active' },
      { id: '3', name: 'Production_Env_Config', type: 'text', size: 840, createdAt: Date.now() - 86400000, status: 'active' },
    ],
    tunnel: { running: false, starting: false, url: '', error: null },
  }),
  pending: () => null,
  onPending: () => () => {},
  consumePending: () => {},
  start: async () => {},
  stop: async () => {},
  updateSettings: async patch => patch,
  createText: async () => {},
  addPaths: async () => {},
  remove: () => {},
  clear: () => {},
  chooseFiles: async () => [],
  chooseFolder: async () => [],
  copy: async val => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(val) : null),
  startTunnel: async () => {},
  stopTunnel: async () => {},
}

const api = window.localdrop || mockApi
const formatSize = n => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n || 0} B`)
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
  const [searchQuery, setSearchQuery] = useState('')

  async function refresh() {
    setData(await api.snapshot())
  }

  useEffect(() => {
    refresh().catch(error => setNotice(error.message))
    setPending(api.pending())
    const off = api.onPending(value => {
      setPending(value)
      if (value?.type === 'files' && value.status === 'done') refresh().catch(() => {})
    })
    const timer = setInterval(() => refresh().catch(() => {}), 5000)
    if (api.startError) setNotice(api.startError)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (data && !config) setConfig({ ip: data.settings.ip, port: data.settings.port })
  }, [data])

  // ESC to close modals
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        if (qr) setQr(null)
        else if (settingsOpen) setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [qr, settingsOpen])

  async function action(work, message) {
    setBusy(true)
    setNotice('')
    try {
      const result = await work()
      setData(result?.settings ? result : await api.snapshot())
      if (message) {
        showToast(message)
      }
    } catch (error) {
      setNotice(error.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const showToast = msg => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }

  const copy = async value => {
    try {
      await Promise.resolve(api.copy(value))
      showToast('链接已复制到剪贴板')
    } catch (error) {
      showToast(error.message || '复制失败')
    }
  }

  const shareBaseUrl = data?.tunnel?.url || data?.url
  const itemUrl = item =>
    item.type === 'file'
      ? `${shareBaseUrl}/api/shares/${encodeURIComponent(item.id)}/download?token=${encodeURIComponent(item.downloadToken)}`
      : `${shareBaseUrl}/?share=${encodeURIComponent(item.id)}`

  const sharePaths = async paths => {
    if (paths?.length) await action(() => api.addPaths(paths), `已添加 ${paths.length} 个分享项`)
  }

  const saveConfig = () => action(() => api.updateSettings({ ip: config.ip, port: Number(config.port) }), '网络访问地址已更新')
  const savePassword = () =>
    action(async () => {
      const result = await api.updateSettings({ password })
      setPassword('')
      return result
    }, password ? '站点密码已更新' : '站点密码已清除')

  const toggleTunnel = () =>
    action(() => (data?.tunnel?.running ? api.stopTunnel() : api.startTunnel()), data?.tunnel?.running ? '公网隧道已关闭' : '公网隧道已启动')

  const isTunnelActive = !!(data?.tunnel?.running && data?.tunnel?.url)
  const isTunnelStarting = !!data?.tunnel?.starting

  const filteredShares = data?.shares?.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())) || []

  return (
    <div className="min-h-screen bg-[#07080a] text-[#cdcdcd] selection:bg-white/20 selection:text-white font-sans">
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

      {/* Main Container */}
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Top Header - Raycast Command Bar Aesthetic */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#242728]/70 pb-5">
          <div className="flex items-center gap-3">
            <div className="app-icon-tile h-10 w-10 bg-[#121212] border-[#242728] text-white shadow-sm">
              <ArrowDownToLine size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-[#f4f4f6]">LocalDrop</h1>
                <span className="keycap">v0.1.0</span>
              </div>
              <p className="text-xs text-[#9c9c9d] mt-0.5">跨设备即时传输 · 局域网高速与 Cloudflare 临时公网</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Pills */}
            {data?.running ? (
              <span className="badge-green-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-[#59d499] animate-pulse" />
                服务运行中
              </span>
            ) : (
              <span className="badge-neutral">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6a6b6c]" />
                服务已停止
              </span>
            )}

            {isTunnelActive && (
              <span className="badge-info-soft">
                <Globe2 size={12} />
                公网穿透
              </span>
            )}

            {isTunnelStarting && (
              <span className="badge-yellow-soft animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ffc533]" />
                隧道连接中
              </span>
            )}

            <button
              title="偏好设置 (⌘,)"
              onClick={() => setSettingsOpen(true)}
              className="btn btn-secondary px-3 py-1.5 h-8 text-xs ml-1"
            >
              <Settings2 size={14} />
              <span>设置</span>
            </button>
          </div>
        </header>

        {/* Global Notice Bar */}
        {notice && (
          <div
            role="status"
            className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-[#ff6161]/30 bg-[#ff6161]/10 px-4 py-3 text-xs text-[#ff6161]"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="flex-shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice('')} className="text-[#ff6161]/80 hover:text-[#ff6161]">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Pending Share Notification from uTools */}
        {pending && (
          <div
            className={`raycast-card mb-6 overflow-hidden border p-4 ${
              pending.status === 'error' ? 'border-[#ff6161]/40' : 'border-[#59d499]/40'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`app-icon-tile h-9 w-9 ${
                    pending.status === 'error' ? 'bg-[#ff6161]/15 text-[#ff6161]' : 'bg-[#59d499]/15 text-[#59d499]'
                  }`}
                >
                  {pending.type === 'files' ? <Folder size={18} /> : <FileText size={18} />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#f4f4f6]">
                    {pending.status === 'processing'
                      ? '正在导入 uTools 选中的项目…'
                      : pending.status === 'error'
                      ? '自动分享失败'
                      : pending.autoStarted
                      ? '服务已就绪，分享项目已自动就位'
                      : '文件已同步至分享列表'}
                  </div>
                  <div className="text-xs text-[#9c9c9d] mt-0.5">
                    {pending.type === 'files' ? `${pending.paths.length} 个本地文件/文件夹` : `文本内容：${pending.text.slice(0, 48)}...`}
                    {pending.error ? ` · ${pending.error}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost text-xs px-2.5 py-1.5 h-7" onClick={() => api.consumePending()}>
                  <X size={13} /> 忽略
                </button>
                {(pending.type !== 'files' || pending.status === 'error') && (
                  <button
                    className="btn btn-primary text-xs px-3 py-1.5 h-7"
                    onClick={async () => {
                      if (pending.type === 'files') await sharePaths(pending.paths)
                      else {
                        setText(pending.text)
                        setTab('create')
                      }
                      api.consumePending()
                    }}
                  >
                    {pending.type === 'files' ? '重试添加' : '编辑文本'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hero Card: Share Endpoint Showcase */}
        <section className="raycast-card relative mb-7 overflow-hidden p-6">
          <div className="raycast-hero-stripe" />
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-[#9c9c9d]">
                  {isTunnelActive ? '公网穿透访问通道' : '局域网极速访问通道'}
                </span>
                {isTunnelActive ? (
                  <span className="badge-info-soft">
                    <Globe2 size={11} /> Cloudflare Quick Tunnel
                  </span>
                ) : (
                  <span className="badge-neutral">
                    <Wifi size={11} /> 本地无线局域网
                  </span>
                )}
              </div>

              {data?.settings?.hasPassword ? (
                <span className="badge-neutral text-xs">
                  <ShieldCheck size={12} className="text-[#59d499]" /> 密码保护中
                </span>
              ) : (
                <span className="badge-neutral text-xs text-[#ffc533]">
                  <ShieldAlert size={12} /> 无密码 (公开访问)
                </span>
              )}
            </div>

            {/* URL Display Box */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[#242728] bg-[#101111] p-3 md:p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm md:text-base font-medium text-[#f4f4f6] truncate select-all">
                    {isTunnelActive ? data.tunnel.url : isTunnelStarting ? '正在分配临时公网域名…' : data?.url || '服务未启动'}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    disabled={!shareBaseUrl}
                    onClick={() => copy(shareBaseUrl)}
                    className="btn btn-primary px-3 py-1.5 h-8 text-xs font-semibold"
                    title="复制完整分享链接"
                  >
                    <Copy size={13} />
                    <span>复制链接</span>
                  </button>

                  <button
                    disabled={!shareBaseUrl}
                    onClick={() =>
                      setQr({
                        url: shareBaseUrl,
                        title: isTunnelActive ? '扫码访问公网分享空间' : '扫码访问局域网分享空间',
                      })
                    }
                    className="btn btn-secondary px-2.5 py-1.5 h-8 text-xs"
                    title="显示访问二维码"
                  >
                    <QrCode size={14} />
                    <span className="hidden sm:inline">二维码</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between text-xs text-[#9c9c9d] px-1">
                <span>
                  {isTunnelActive
                    ? '公网临时分享已激活，任何互联网设备均可访问'
                    : isTunnelStarting
                    ? 'Cloudflare 正在握手，通常需要 2-5 秒…'
                    : '同一 Wi-Fi 或热点下的手机、平板、电脑均可直接打开'}
                </span>

                {isTunnelActive && data?.url && (
                  <div className="flex items-center gap-2 mt-1 sm:mt-0">
                    <span className="text-[#6a6b6c]">LAN: {data.url}</span>
                    <button onClick={() => copy(data.url)} className="text-[#f4f4f6] hover:underline">
                      复制
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Action & Tab Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-[#0d0d0d] p-1 rounded-lg border border-[#242728]">
            <button
              onClick={() => setTab('overview')}
              className={`pill-tab ${tab === 'overview' ? 'pill-tab-active' : ''}`}
            >
              <HardDrive size={13} />
              <span>分享项目 ({data?.shares?.length || 0})</span>
            </button>
            <button
              onClick={() => setTab(tab === 'create' ? 'overview' : 'create')}
              className={`pill-tab ${tab === 'create' ? 'pill-tab-active' : ''}`}
            >
              <Plus size={13} />
              <span>新建分享</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'overview' && data?.shares?.length > 3 && (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a6b6c]" />
                <input
                  type="text"
                  placeholder="过滤项目..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="raycast-input pl-8 py-1 h-7 text-xs w-36 sm:w-48"
                />
              </div>
            )}

            {!!data?.shares?.length && (
              <button
                className="btn btn-ghost text-xs px-2.5 py-1.5 h-7 text-[#9c9c9d] hover:text-[#ff6161]"
                onClick={() => {
                  if (window.confirm(`确定清空全部 ${data.shares.length} 个分享项吗？`)) {
                    action(() => api.clear(), '列表已清空')
                  }
                }}
              >
                <Trash2 size={13} />
                <span>清空</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content: Create Share */}
        {tab === 'create' && (
          <section className="raycast-card mb-6 p-5 border border-[#242728]">
            <div className="mb-4 flex items-center justify-between border-b border-[#242728]/70 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#f4f4f6]">添加新的分享内容</h3>
                <p className="text-xs text-[#9c9c9d] mt-0.5">选择本地资源或直接分发富文本片段</p>
              </div>
              <button onClick={() => setTab('overview')} className="btn btn-ghost px-2 py-1 text-xs">
                <X size={15} />
              </button>
            </div>

            {/* Two Drop/Pick Action Tiles */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => api.chooseFiles().then(sharePaths)}
                className="group flex flex-col items-start justify-center rounded-lg border border-[#242728] bg-[#101111] p-4 text-left transition hover:border-white/30 hover:bg-[#141517]"
              >
                <div className="app-icon-tile mb-2.5 h-9 w-9 bg-[#121212] group-hover:border-white/20">
                  <File size={17} className="text-[#57c1ff]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#f4f4f6]">选择本地文件</span>
                  <span className="keycap">多选</span>
                </div>
                <span className="text-[11px] text-[#9c9c9d] mt-1">支持任何格式，单次可选取多个文件</span>
              </button>

              <button
                onClick={() => api.chooseFolder().then(sharePaths)}
                className="group flex flex-col items-start justify-center rounded-lg border border-[#242728] bg-[#101111] p-4 text-left transition hover:border-white/30 hover:bg-[#141517]"
              >
                <div className="app-icon-tile mb-2.5 h-9 w-9 bg-[#121212] group-hover:border-white/20">
                  <Folder size={17} className="text-[#ffc533]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#f4f4f6]">选择本地文件夹</span>
                  <span className="keycap">目录</span>
                </div>
                <span className="text-[11px] text-[#9c9c9d] mt-1">保留层级结构，访客可逐级浏览与下载</span>
              </button>
            </div>

            {/* Direct Text Sharing Section */}
            <div className="mt-5 border-t border-[#242728]/70 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-[#b388ff]" />
                <span className="text-xs font-semibold text-[#f4f4f6]">分享文本片段</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-[#9c9c9d]">标题 (可选)</label>
                  <input
                    className="raycast-input mt-1 h-9"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="例如：Wi-Fi 密码、API 配置、备忘片段"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-[#9c9c9d]">文本内容</label>
                  <textarea
                    className="raycast-input mt-1 min-h-[120px] resize-y font-mono text-xs leading-relaxed"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="直接在此粘贴要分享的代码、链接、密码或笔记..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setTab('overview')} className="btn btn-secondary text-xs">
                    取消
                  </button>
                  <button
                    disabled={busy || !text.trim()}
                    onClick={() =>
                      action(async () => {
                        await api.createText(name, text)
                        setName('')
                        setText('')
                        setTab('overview')
                      }, '文本已成功发布')
                    }
                    className="btn btn-primary text-xs"
                  >
                    发布文本
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Tab Content: Shares List (Raycast Command Palette Rows) */}
        {tab === 'overview' && (
          <section className="raycast-card overflow-hidden">
            {filteredShares.length > 0 ? (
              <div className="divide-y divide-[#242728]/60">
                {filteredShares.map(item => {
                  const Icon = typeIcon[item.type] || File
                  const iconColor =
                    item.type === 'directory'
                      ? 'text-[#ffc533] bg-[#ffc533]/10'
                      : item.type === 'text'
                      ? 'text-[#b388ff] bg-[#b388ff]/10'
                      : 'text-[#57c1ff] bg-[#57c1ff]/10'

                  return (
                    <div
                      key={item.id}
                      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[#121212]"
                    >
                      <div className={`app-icon-tile h-9 w-9 ${iconColor} border-transparent`}>
                        <Icon size={17} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-[#f4f4f6]" title={item.name}>
                            {item.name}
                          </span>
                          {item.status !== 'active' && (
                            <span className="badge-red-soft text-[10px] py-0.5">源文件缺失</span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[#9c9c9d]">
                          <span className="text-[#f4f4f6]/70">{typeLabel[item.type]}</span>
                          <span className="text-[#434345]">·</span>
                          <span>{formatSize(item.size)}</span>
                          <span className="text-[#434345]">·</span>
                          <span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </div>

                      {/* Row Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          title={item.type === 'file' ? '复制直接下载链接' : '复制项目访问链接'}
                          disabled={!shareBaseUrl}
                          className="btn btn-ghost px-2 py-1 h-7 text-xs text-[#9c9c9d] hover:text-white"
                          onClick={() => copy(itemUrl(item))}
                        >
                          <Copy size={13} />
                          <span className="hidden sm:inline text-[11px]">复制</span>
                        </button>

                        <button
                          title="查看二维码"
                          disabled={!shareBaseUrl}
                          className="btn btn-ghost px-2 py-1 h-7 text-xs text-[#9c9c9d] hover:text-white"
                          onClick={() =>
                            setQr({
                              url: itemUrl(item),
                              title: item.type === 'file' ? `扫码下载: ${item.name}` : `扫码访问: ${item.name}`,
                            })
                          }
                        >
                          <QrCode size={13} />
                        </button>

                        <button
                          title="删除分享"
                          className="btn btn-danger-ghost px-2 py-1 h-7 text-xs"
                          onClick={() => action(() => api.remove(item.id), '已删除分享项')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <div className="app-icon-tile mb-3 h-12 w-12 bg-[#121212] border-[#242728] text-[#9c9c9d]">
                  <HardDrive size={22} />
                </div>
                <h3 className="text-sm font-medium text-[#f4f4f6]">
                  {searchQuery ? '没有找到符合条件的项目' : '暂无分享项目'}
                </h3>
                <p className="mt-1 max-w-xs text-xs text-[#9c9c9d]">
                  {searchQuery
                    ? '请尝试不同的关键词'
                    : '点击右上角“新建分享”，或在 uTools 中直接唤醒选取文件与文件夹。'}
                </p>
                {!searchQuery && (
                  <button onClick={() => setTab('create')} className="btn btn-secondary mt-4 text-xs">
                    <Plus size={13} /> 立即添加
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Raycast Preferences Window (Settings Modal) */}
      {settingsOpen && data && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="raycast-card max-h-[88vh] w-full max-w-lg overflow-y-auto border border-[#242728] bg-[#0d0d0d] shadow-raycast-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#242728] bg-[#0d0d0d]/95 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <div className="app-icon-tile h-7 w-7 bg-[#121212] text-white">
                  <Settings2 size={14} />
                </div>
                <h2 className="text-sm font-semibold text-[#f4f4f6]">偏好设置 · Preferences</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="keycap">ESC</span>
                <button
                  className="btn btn-ghost px-1.5 py-1 text-[#9c9c9d] hover:text-white"
                  title="关闭"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-5">
              {/* 1. Core Service */}
              <section>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9c9c9d]">
                  <Power size={13} className="text-[#59d499]" />
                  <span>服务运行</span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-lg border border-[#242728] bg-[#101111] p-3.5">
                    <div>
                      <div className="text-xs font-semibold text-[#f4f4f6]">
                        本地共享服务状态：{data.running ? '运行中' : '已停止'}
                      </div>
                      <div className="text-[11px] text-[#9c9c9d] mt-0.5">
                        在 uTools 中通过全局快捷方式触发分享时会自动按需唤醒
                      </div>
                    </div>
                    <button
                      onClick={() => action(() => (data.running ? api.stop() : api.start()), data.running ? '服务已停止' : '服务已启动')}
                      disabled={busy}
                      className={`btn text-xs h-8 ${data.running ? 'btn-secondary text-[#ff6161]' : 'btn-primary'}`}
                    >
                      {data.running ? <Pause size={13} /> : <Play size={13} />}
                      <span>{data.running ? '停止服务' : '启动服务'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[#242728] bg-[#101111] p-3.5">
                    <div>
                      <div className="text-xs font-semibold text-[#f4f4f6]">插件开启时自动启动</div>
                      <div className="text-[11px] text-[#9c9c9d] mt-0.5">
                        无需等待手动点击，打开 LocalDrop 插件立即监听本地网络
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-white cursor-pointer"
                      checked={!!data.settings.autoStart}
                      onChange={e => action(() => api.updateSettings({ autoStart: e.target.checked }))}
                    />
                  </div>
                </div>
              </section>

              {/* 2. Network & Binding */}
              <section className="border-t border-[#242728]/70 pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9c9c9d]">
                  <Wifi size={13} className="text-[#57c1ff]" />
                  <span>局域网网络绑定</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-[#9c9c9d]">监听 IP 地址</label>
                    <select
                      className="raycast-input mt-1 h-9"
                      value={config?.ip || ''}
                      onChange={e => setConfig({ ...config, ip: e.target.value })}
                    >
                      <option value="127.0.0.1">127.0.0.1 · 仅本机内部访问</option>
                      {data.addresses.map(x => (
                        <option key={`${x.name}-${x.address}`} value={x.address}>
                          {x.address} · {x.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#9c9c9d]">服务端口</label>
                    <input
                      className="raycast-input mt-1 h-9"
                      type="number"
                      min="1024"
                      max="65535"
                      value={config?.port || ''}
                      onChange={e => setConfig({ ...config, port: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      className="btn btn-secondary text-xs h-8"
                      disabled={busy || !config}
                      onClick={saveConfig}
                    >
                      <RefreshCw size={12} />
                      <span>保存网络设置</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* 3. Public Cloudflare Tunnel */}
              <section className="border-t border-[#242728]/70 pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9c9c9d]">
                  <Globe2 size={13} className="text-[#57c1ff]" />
                  <span>Cloudflare 临时公网穿透</span>
                </div>

                <div className="rounded-lg border border-[#242728] bg-[#101111] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-[#f4f4f6]">快速安全隧道 (Quick Tunnel)</div>
                      <div className="text-[11px] text-[#9c9c9d] mt-0.5">
                        自动创建 HTTPS 临时隧道。出于安全保护，开启公网前必须先设置站点密码。
                      </div>
                    </div>
                    <button
                      className={`btn text-xs h-8 ${data.tunnel?.running ? 'btn-secondary text-[#ff6161]' : 'btn-primary'}`}
                      disabled={busy || data.tunnel?.starting || !data.settings.hasPassword}
                      onClick={toggleTunnel}
                    >
                      {data.tunnel?.starting ? (
                        '连接中…'
                      ) : data.tunnel?.running ? (
                        '关闭公网'
                      ) : (
                        '开启公网'
                      )}
                    </button>
                  </div>

                  {!data.settings.hasPassword && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#ffc533]">
                      <ShieldAlert size={12} />
                      <span>请先在下方“安全与密码”模块设定访问密码</span>
                    </div>
                  )}

                  {data.tunnel?.url && (
                    <div className="mt-3 rounded border border-[#242728] bg-[#07080a] p-2.5">
                      <div className="font-mono text-xs text-[#59d499] break-all select-all">{data.tunnel.url}</div>
                      <div className="mt-2 flex gap-2">
                        <button className="btn btn-secondary text-xs h-7 py-0" onClick={() => copy(data.tunnel.url)}>
                          <Copy size={12} /> 复制
                        </button>
                        <button
                          className="btn btn-secondary text-xs h-7 py-0"
                          onClick={() => setQr({ url: data.tunnel.url, title: '扫码访问公网分享' })}
                        >
                          <QrCode size={12} /> 二维码
                        </button>
                      </div>
                    </div>
                  )}

                  {data.tunnel?.error && (
                    <div className="mt-2.5 text-[11px] text-[#ff6161]">{data.tunnel.error}</div>
                  )}
                </div>
              </section>

              {/* 4. Visitor Uploads */}
              <section className="border-t border-[#242728]/70 pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9c9c9d]">
                  <Upload size={13} className="text-[#59d499]" />
                  <span>访客上传权限</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[#242728] bg-[#101111] p-3.5">
                  <div>
                    <div className="text-xs font-semibold text-[#f4f4f6]">允许连接的访客上传文件</div>
                    <div className="text-[11px] text-[#9c9c9d] mt-0.5">
                      访客上传的所有文件均安全保存在本地插件数据目录 uploads 文件夹中
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-white cursor-pointer"
                    checked={!!data.settings.allowUpload}
                    onChange={e => action(() => api.updateSettings({ allowUpload: e.target.checked }))}
                  />
                </div>
              </section>

              {/* 5. Password & Security */}
              <section className="border-t border-[#242728]/70 pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9c9c9d]">
                  <ShieldCheck size={13} className="text-[#ff6161]" />
                  <span>站点安全密码</span>
                </div>

                <div className="rounded-lg border border-[#242728] bg-[#101111] p-3.5 space-y-3">
                  <p className="text-[11px] text-[#9c9c9d]">
                    {data.settings.hasPassword
                      ? '当前站点已由密码保护。访客打开页面时须输入密码验证；若修改密码，已有会话将失效。'
                      : '当前未设置密码，局域网内的设备可直接打开网页浏览或下载。'}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="raycast-input h-9 text-xs flex-1"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="设置新密码 (至少 6 位)"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-secondary text-xs h-9"
                        onClick={savePassword}
                        disabled={busy || password.length < 6}
                      >
                        <KeyRound size={13} />
                        <span>{data.settings.hasPassword ? '更新密码' : '设置密码'}</span>
                      </button>
                      {data.settings.hasPassword && (
                        <button
                          className="btn btn-ghost text-xs h-9 text-[#ff6161] hover:bg-[#ff6161]/10"
                          onClick={() => {
                            if (window.confirm('确定清除站点密码吗？清除后所有访客将无需验证。')) {
                              action(() => api.updateSettings({ password: '' }), '站点密码已清除')
                            }
                          }}
                        >
                          清除密码
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Raycast Command Palette QR Code Modal */}
      {qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setQr(null)}
        >
          <div
            className="raycast-card relative w-full max-w-sm border border-[#242728] bg-[#0d0d0d] p-6 text-center shadow-raycast-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="raycast-hero-stripe" />
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs font-semibold text-[#f4f4f6] truncate max-w-[240px] text-left">
                {qr.title}
              </div>
              <span className="keycap">ESC</span>
            </div>

            {/* QR Code Container */}
            <div className="mx-auto my-3 flex items-center justify-center rounded-xl bg-white p-4 shadow-sm w-fit">
              <QRCodeSVG value={qr.url} size={200} level="M" />
            </div>

            <div className="mt-4 rounded border border-[#242728] bg-[#101111] p-2.5 font-mono text-[11px] text-[#cdcdcd] break-all select-all">
              {qr.url}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="btn btn-secondary flex-1 text-xs h-9"
                onClick={() => copy(qr.url)}
              >
                <Copy size={13} />
                <span>复制链接</span>
              </button>
              <button className="btn btn-primary flex-1 text-xs h-9" onClick={() => setQr(null)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
