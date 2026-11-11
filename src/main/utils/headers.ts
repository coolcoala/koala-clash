const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

// Decodes a text subscription header (profile-title, announce, ...). The value is either
// `base64:<utf-8 in base64>` or plain text. Node's HTTP parser exposes header values as latin1
// (one char per byte), so plain UTF-8 text such as Cyrillic arrives garbled and has to be
// re-decoded from its raw bytes. Values that are not valid UTF-8 are kept as latin1.
export function decodeHeaderText(value: string): string {
  if (value.startsWith('base64:')) {
    return Buffer.from(value.slice(7), 'base64').toString('utf-8')
  }
  if (!/[\u0080-ÿ]/.test(value) || /[Ā-￿]/.test(value)) {
    return value
  }
  try {
    return utf8Decoder.decode(Buffer.from(value, 'latin1'))
  } catch {
    return value
  }
}
