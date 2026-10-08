import { existsSync } from 'fs'
import { copyFile, link, rename, rm, stat } from 'fs/promises'
import path from 'path'
import { mihomoWorkDir } from './dirs'

export const GEO_FILES = ['country.mmdb', 'geoip.dat', 'geosite.dat', 'ASN.mmdb']

// mihomo takes country.mmdb ahead of geoip.metadb, so a metadb next to it is never read
export async function removeUnusedMetadb(dir: string): Promise<void> {
  if (existsSync(path.join(dir, 'country.mmdb'))) {
    await rm(path.join(dir, 'geoip.metadb'), { force: true }).catch(() => {})
  }
}

async function linkGeoFile(file: string, targetDir: string): Promise<void> {
  const sourcePath = path.join(mihomoWorkDir(), file)
  const targetPath = path.join(targetDir, file)
  const [source, target] = await Promise.all([
    stat(sourcePath, { bigint: true }).catch(() => null),
    stat(targetPath, { bigint: true }).catch(() => null)
  ])
  if (!source || (target && target.ino === source.ino && target.dev === source.dev)) return
  try {
    if (target && target.mtimeMs > source.mtimeMs) {
      // A copy updated on its own is the freshest one, so it becomes the shared file
      await rename(targetPath, sourcePath)
    } else if (target) {
      await rm(targetPath)
    }
    await link(sourcePath, targetPath)
  } catch {
    // No hard links on FAT drives, and Windows refuses to replace a file the core holds open
    if (!existsSync(targetPath)) {
      await copyFile(sourcePath, targetPath).catch(() => {})
    }
  }
}

// Other mihomo home dirs hard-link the databases in work/ instead of copying tens of MB.
// mihomo rewrites them in place on update, so every link sees the new data.
export async function linkGeoFiles(targetDir: string): Promise<void> {
  await removeUnusedMetadb(targetDir)
  await Promise.all(GEO_FILES.map((file) => linkGeoFile(file, targetDir)))
}
