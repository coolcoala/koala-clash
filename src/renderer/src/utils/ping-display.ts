// Colour of a measured delay in ms (0 is a timeout), shared by the proxies page and the tray menu
export function delayColorClass(delay: number): string {
  if (delay === -1) return 'text-primary'
  if (delay === 0) return 'text-destructive'
  if (delay < 500) return 'text-success'
  return 'text-warning'
}

// The `ping-display` header of the current profile, if the subscription sent one
export function profilePingDisplay(profileConfig?: ProfileConfig): PingDisplay | undefined {
  return profileConfig?.items?.find((i) => i.id === profileConfig.current)?.pingDisplay
}

// While the current profile has the header it wins over the user's own choice, as on Android
export function resolvePingDisplay(
  appConfig?: AppConfig,
  profileConfig?: ProfileConfig
): PingDisplay {
  return profilePingDisplay(profileConfig) ?? appConfig?.pingDisplay ?? 'ping'
}
