import yaml from 'yaml'
import { readFileSync, writeFileSync } from 'fs'

const pkg = readFileSync('package.json', 'utf-8')
let changelog = readFileSync('changelog.md', 'utf-8')
const { version } = JSON.parse(pkg)
const downloadUrl = `https://github.com/coolcoala/koala-clash/releases/download/${version}`
const latest = {
  version,
  changelog
}

const badge = (format, label, logo) =>
  `https://img.shields.io/badge/${format}-default?style=flat&logo=${logo}&label=${encodeURIComponent(label)}`

const link = (url, format, label, logo) =>
  `<a href="${url}"><img src="${badge(format, label, logo)}"></a>`

if (process.env.SKIP_CHANGELOG !== '1') {
  changelog += '\n### Download link：\n\n#### Windows10/11：\n\n'
  changelog += link(`${downloadUrl}/Koala.Clash_x64-setup.exe`, 'EXE', '64-bit', 'windows') + ' '
  changelog += link(`${downloadUrl}/Koala.Clash_arm64-setup.exe`, 'EXE', 'ARM64', 'windows') + '\n\n'
  changelog += '\n#### macOS 11+：\n\n'
  changelog += link(`${downloadUrl}/Koala.Clash_x64.pkg`, 'PKG', 'Intel', 'apple') + ' '
  changelog += link(`${downloadUrl}/Koala.Clash_arm64.pkg`, 'PKG', 'Apple Silicon', 'apple') + '\n\n'
  changelog += '\n#### Linux：\n\n'
  changelog += link(`${downloadUrl}/Koala.Clash_amd64.deb`, 'DEB', '64-bit', 'linux') + ' '
  changelog += link(`${downloadUrl}/Koala.Clash_arm64.deb`, 'DEB', 'ARM64', 'linux') + '\n\n'
  changelog += link(`${downloadUrl}/Koala.Clash_x86_64.rpm`, 'RPM', '64-bit', 'linux') + ' '
  changelog += link(`${downloadUrl}/Koala.Clash_aarch64.rpm`, 'RPM', 'ARM64', 'linux') + '\n\n'
  changelog += link(`${downloadUrl}/Koala.Clash_x64.pkg.tar.xz`, 'PACMAN', '64-bit', 'archlinux') + ' '
  changelog += link(`${downloadUrl}/Koala.Clash_aarch64.pkg.tar.xz`, 'PACMAN', 'ARM64', 'archlinux')
}
writeFileSync('latest.yml', yaml.stringify(latest))
writeFileSync('changelog.md', changelog)
