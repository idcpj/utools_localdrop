const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')

async function copy(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true })
  await fsp.copyFile(from, to)
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(name, data) {
  const type = Buffer.from(name)
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([length, type, data, check])
}

function logoPng() {
  const width = 64, height = 64, rows = []
  const nearLine = (x, y, ax, ay, bx, by, radius = 2.5) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) <= radius
  }
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4)
    for (let x = 0; x < width; x++) {
      const dx = Math.max(16 - x, 0, x - 47), dy = Math.max(16 - y, 0, y - 47)
      const visible = dx * dx + dy * dy <= 16 * 16
      const mint = nearLine(x, y, 15, 32, 37, 32) || nearLine(x, y, 29, 24, 37, 32) || nearLine(x, y, 37, 32, 29, 40) || nearLine(x, y, 49, 23, 49, 41)
      const offset = 1 + x * 4
      row[offset] = mint ? 137 : 22
      row[offset + 1] = mint ? 240 : 27
      row[offset + 2] = mint ? 190 : 46
      row[offset + 3] = visible ? 255 : 0
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

async function main() {
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'plugin.json'), 'utf8'))
  manifest.main = 'index.html'
  manifest.logo = 'logo.png'
  manifest.preload = 'plugin.js'
  await fsp.writeFile(path.join(dist, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (fs.existsSync(path.join(root, 'logo.png'))) {
    await copy(path.join(root, 'logo.png'), path.join(dist, 'logo.png'))
  } else {
    await fsp.writeFile(path.join(dist, 'logo.png'), logoPng())
  }
  if (fs.existsSync(path.join(root, 'logo.svg'))) {
    await copy(path.join(root, 'logo.svg'), path.join(dist, 'logo.svg'))
  }
  await fsp.cp(path.join(root, 'server'), path.join(dist, 'server'), { recursive: true, force: true })
  const cloudflaredPkg = require.resolve('cloudflared/package.json', { paths: [root] })
  const cloudflaredDir = path.dirname(cloudflaredPkg)
  const packagedCloudflared = path.join(dist, 'node_modules', 'cloudflared')
  await fsp.mkdir(packagedCloudflared, { recursive: true })
  await copy(cloudflaredPkg, path.join(packagedCloudflared, 'package.json'))
  await fsp.cp(path.join(cloudflaredDir, 'lib'), path.join(packagedCloudflared, 'lib'), { recursive: true, force: true, dereference: true })

  // uTools loads the preload entry from the plugin package root. Keep both names
  // because older local plugin templates use preload.js while this project uses plugin.js.
  const source = await fsp.readFile(path.join(root, 'preload.cjs'), 'utf8')
  const packaged = source.replace("siteDir: path.join(__dirname, 'dist')", 'siteDir: __dirname')
  await fsp.writeFile(path.join(dist, 'plugin.js'), packaged)
  await fsp.writeFile(path.join(dist, 'preload.js'), packaged)
  // Keep the preload entry CommonJS even though the development project uses ESM.
  await fsp.writeFile(path.join(dist, 'package.json'), '{\n  "type": "commonjs"\n}\n')
  console.log('uTools plugin package created:', dist)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
