import { controledMihomoConfigPath } from '../utils/dirs'
import { readFile, writeFile } from 'fs/promises'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { generateProfile } from '../core/factory'
import { getAppConfig } from './app'
import { defaultControledMihomoConfig } from '../utils/template'
import { deepMerge } from '../utils/merge'

let controledMihomoConfig: Partial<MihomoConfig> // mihomo.yaml

export async function getControledMihomoConfig(force = false): Promise<Partial<MihomoConfig>> {
  if (force || !controledMihomoConfig) {
    const data = await readFile(controledMihomoConfigPath(), 'utf-8')
    controledMihomoConfig = parseYaml<Partial<MihomoConfig>>(data) || defaultControledMihomoConfig
  }
  if (typeof controledMihomoConfig !== 'object')
    controledMihomoConfig = defaultControledMihomoConfig
  return controledMihomoConfig
}

export async function patchControledMihomoConfig(patch: Partial<MihomoConfig>): Promise<void> {
  await getControledMihomoConfig()
  const previousTunEnabled = controledMihomoConfig.tun?.enable ?? false
  const patchToMerge = JSON.parse(JSON.stringify(patch)) as Partial<MihomoConfig>
  const { controlDns = false, controlSniff = false, controlTun = false } = await getAppConfig()
  if (!controlDns) {
    delete controledMihomoConfig.dns
    delete controledMihomoConfig.hosts
  } else {
    // 从不接管状态恢复
    if (controledMihomoConfig.dns?.ipv6 === undefined) {
      controledMihomoConfig.dns = defaultControledMihomoConfig.dns
    }
  }
  if (!controlSniff) {
    delete controledMihomoConfig.sniffer
  } else {
    // 从不接管状态恢复
    if (!controledMihomoConfig.sniffer) {
      controledMihomoConfig.sniffer = defaultControledMihomoConfig.sniffer
    }
  }
  if (!controlTun) {
    const previousTunEnable = controledMihomoConfig.tun?.enable ?? false
    const nextTunEnable = patchToMerge.tun?.enable ?? previousTunEnable
    const routeExcludeAddress = controledMihomoConfig.tun?.['route-exclude-address']
    controledMihomoConfig.tun = {
      enable: nextTunEnable,
      'route-exclude-address': routeExcludeAddress
    } as MihomoTunConfig
    if (patchToMerge.tun) {
      patchToMerge.tun = { enable: nextTunEnable } as MihomoTunConfig
    }
  } else {
    if (!controledMihomoConfig.tun) {
      controledMihomoConfig.tun = defaultControledMihomoConfig.tun as MihomoTunConfig
    }
  }
  if (patchToMerge.dns?.['nameserver-policy']) {
    controledMihomoConfig.dns = controledMihomoConfig.dns || {}
    controledMihomoConfig.dns['nameserver-policy'] = patchToMerge.dns['nameserver-policy']
  }
  if (patchToMerge.dns?.['use-hosts']) {
    controledMihomoConfig.hosts = patchToMerge.hosts
  }
  controledMihomoConfig = deepMerge(controledMihomoConfig, patchToMerge)
  await generateProfile()
  await writeFile(controledMihomoConfigPath(), stringifyYaml(controledMihomoConfig), 'utf-8')

  const currentTunEnabled = controledMihomoConfig.tun?.enable ?? false
  if (currentTunEnabled !== previousTunEnabled) {
    const { setPublicDNS, recoverDNS } = await import('../core/manager')
    if (currentTunEnabled) {
      await setPublicDNS().catch(() => {})
    } else {
      await recoverDNS().catch(() => {})
    }
  }

  try {
    const { patchMihomoConfig } = await import('../core/mihomoApi')
    await patchMihomoConfig(patch as Partial<ControllerConfigs>)
  } catch {
    // running core may not be ready; changes will apply on next restart/reload
  }
}
