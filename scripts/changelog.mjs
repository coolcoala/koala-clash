export const extractVersionSection = (text, version) => {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const lines = text.split('\n')
  const escapedVer = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const headingRe = new RegExp(`^(#{1,6})\\s.*?v?${escapedVer}(?![\\w.-])`)

  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRe)
    if (match) {
      start = i
      level = match[1].length
      break
    }
  }

  if (start === -1) return trimmed

  const boundaryRe = new RegExp(`^#{1,${level}}\\s`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (boundaryRe.test(lines[i])) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join('\n').trim()
}
