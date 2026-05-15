import axios from 'axios'
import { readFileSync } from 'fs'
import { extractVersionSection } from './changelog.mjs'

const chat_ids = [process.env.GROUP_ID, process.env.CHANNEL_ID]
const pkg = readFileSync('package.json', 'utf-8')
const rawChangelog = readFileSync('rawChangelog.md', 'utf-8')
const { version } = JSON.parse(pkg)
const changelog = extractVersionSection(rawChangelog, version)
let content = `<tg-emoji emoji-id='5258249368670073225'>❗️</tg-emoji>   <b><a href="https://github.com/coolcoala/koala-clash/releases/tag/${version}">New Release</a></b>\n\n`
for (const line of changelog.split('\n')) {
  if (line.length === 0) {
    content += '\n'
  } else if (line.startsWith('## ')) {
    content += `<b>${line.replace('## ', '')}</b>\n`
  } else {
    content += `${line}\n`
  }
}
for (const chat_id of chat_ids) {
  await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    chat_id,
    text: content,
    link_preview_options: {
      is_disabled: false,
      url: 'https://github.com/coolcoala/koala-clash',
      prefer_large_media: true
    },
    parse_mode: 'HTML'
  })
}
