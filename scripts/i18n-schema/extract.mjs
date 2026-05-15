#!/usr/bin/env node
// Extracts unique translatable strings (title / description / markdownDescription)
// from src/renderer/src/assets/schemas/meta-json-scheme-cn.json into
// scripts/i18n-schema/strings.cn.json.
//
// Run: node scripts/i18n-schema/extract.mjs
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

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const cnPath = resolve(root, 'src/renderer/src/assets/schemas/meta-json-scheme-cn.json')
const outPath = resolve(here, 'strings.cn.json')

const schema = JSON.parse(readFileSync(cnPath, 'utf8'))
const seen = new Set()

const walk = (node) => {
  if (Array.isArray(node)) {
    for (const x of node) walk(x)
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (TRANSLATABLE.has(k) && typeof v === 'string' && HAN.test(v)) {
        seen.add(v)
      } else if (TRANSLATABLE_ARRAYS.has(k) && Array.isArray(v)) {
        for (const s of v) if (typeof s === 'string' && HAN.test(s)) seen.add(s)
      }
      walk(v)
    }
  }
}

walk(schema)

const sorted = [...seen].sort()
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
console.log(`extracted ${sorted.length} unique strings -> ${outPath}`)
