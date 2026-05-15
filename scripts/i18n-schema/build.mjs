#!/usr/bin/env node
// Apply translations.json onto meta-json-scheme-cn.json and emit
// meta-json-scheme-en.json and meta-json-scheme-ru.json.
//
// Run: node scripts/i18n-schema/build.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TRANSLATABLE = new Set([
  'title',
  'description',
  'markdownDescription',
  'errorMessage',
  'patternErrorMessage',
  'deprecationMessage'
])
const TRANSLATABLE_ARRAYS = new Set(['enumDescriptions', 'markdownEnumDescriptions'])
const HAN = /[一-鿿]/
const TARGETS = ['en', 'ru']

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const schemasDir = resolve(root, 'src/renderer/src/assets/schemas')
const cnPath = resolve(schemasDir, 'meta-json-scheme-cn.json')
const trPath = resolve(here, 'translations.json')

const cn = JSON.parse(readFileSync(cnPath, 'utf8'))
const translations = JSON.parse(readFileSync(trPath, 'utf8'))

const missing = { en: new Set(), ru: new Set() }

const translate = (str, lang) => {
  const entry = translations[str]
  if (!entry || typeof entry[lang] !== 'string') {
    missing[lang].add(str)
    return str
  }
  return entry[lang]
}

const transform = (node, lang) => {
  if (Array.isArray(node)) return node.map((x) => transform(x, lang))
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      if (TRANSLATABLE.has(k) && typeof v === 'string' && HAN.test(v)) {
        out[k] = translate(v, lang)
      } else if (TRANSLATABLE_ARRAYS.has(k) && Array.isArray(v)) {
        out[k] = v.map((s) => (typeof s === 'string' && HAN.test(s) ? translate(s, lang) : s))
      } else {
        out[k] = transform(v, lang)
      }
    }
    return out
  }
  return node
}

for (const lang of TARGETS) {
  const out = transform(cn, lang)
  const outPath = resolve(schemasDir, `meta-json-scheme-${lang}.json`)
  writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf8')
  console.log(`wrote ${outPath} (${missing[lang].size} missing strings)`)
}

let exitCode = 0
for (const lang of TARGETS) {
  if (missing[lang].size > 0) {
    exitCode = 1
    console.error(`\nmissing ${lang} translations (${missing[lang].size}):`)
    for (const s of [...missing[lang]].slice(0, 10)) {
      console.error('  ' + JSON.stringify(s))
    }
    if (missing[lang].size > 10) {
      console.error(`  ... and ${missing[lang].size - 10} more`)
    }
  }
}
process.exit(exitCode)
