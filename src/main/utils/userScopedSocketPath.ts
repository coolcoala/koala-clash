export function userScopedSocketPath(name: string, uid?: number): string {
  return `/tmp/${name}${uid === undefined ? '' : `-${uid}`}.sock`
}
