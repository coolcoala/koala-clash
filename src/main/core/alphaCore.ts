import axios, { AxiosRequestConfig } from 'axios'
import AdmZip from 'adm-zip'
import { gunzipSync } from 'zlib'
import { mkdir, rename, writeFile } from 'fs/promises'
import path from 'path'
import { getRuntimeConfig } from './factory'
import { downloadedCoreDir } from '../utils/dirs'
import { t } from '../utils/i18n'

const ALPHA_RELEASE_URL = 'https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha'

// The same assets scripts/prepare.mjs bundles into builds that opt into the alpha core
const ALPHA_ASSETS: Record<string, string> = {
  'win32-x64': 'mihomo-windows-amd64-v1',
  'win32-ia32': 'mihomo-windows-386',
  'win32-arm64': 'mihomo-windows-arm64',
  'darwin-x64': 'mihomo-darwin-amd64-v1',
  'darwin-arm64': 'mihomo-darwin-arm64',
  'linux-x64': 'mihomo-linux-amd64-v1',
  'linux-arm64': 'mihomo-linux-arm64'
}

export async function downloadAlphaCore(): Promise<void> {
  const asset = ALPHA_ASSETS[`${process.platform}-${process.arch}`]
  if (!asset) {
    throw new Error(t('error.alphaCoreNotSupported'))
  }
  const isWin = process.platform === 'win32'
  const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
  const requestConfig: AxiosRequestConfig = {
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    })
  }

  const { data: version } = await axios.get<string>(`${ALPHA_RELEASE_URL}/version.txt`, {
    ...requestConfig,
    responseType: 'text'
  })
  const { data: archive } = await axios.get<Buffer>(
    `${ALPHA_RELEASE_URL}/${asset}-${version.trim()}.${isWin ? 'zip' : 'gz'}`,
    { ...requestConfig, responseType: 'arraybuffer' }
  )
  const binary = isWin ? new AdmZip(archive).readFile(`${asset}.exe`) : gunzipSync(archive)
  if (!binary) {
    throw new Error(`${asset}.exe: ENOENT`)
  }

  const target = path.join(downloadedCoreDir(), `mihomo-alpha${isWin ? '.exe' : ''}`)
  await mkdir(downloadedCoreDir(), { recursive: true })
  // A binary cut off mid-write must never pass for an installed core
  await writeFile(`${target}.tmp`, binary, { mode: 0o755 })
  await rename(`${target}.tmp`, target)
}
