# Koala Clash
<p align="center">
  <img src="./resources/icon.png" alt="Clash" width="128" />
  <br>
  <br>
  <a href="https://github.com/coolcoala/koala-clash/releases">
    <img src="https://img.shields.io/github/release/coolcoala/koala-clash/all.svg">
  </a>
</p>
<h3 align="center">GUI client for <a href="https://github.com/MetaCubeX/mihomo">Mihomo</a></h3>

## Disclaimer

THIS REPOSITORY IS AN OPEN-SOURCE GUI CLIENT FOR LEARNING, PERSONAL USE, AND LOCAL CONFIGURATION WORK.
IT IS NOT A COMMERCIAL PANEL, NOT A BILLING SYSTEM, AND NOT A PLATFORM FOR SELLING SUBSCRIPTIONS, VPN ACCESS, PROXY ACCESS, OR OTHER NETWORK SERVICES.
DO NOT TREAT THIS PROJECT AS A READY-MADE BUSINESS SOLUTION.
IF YOU DO NOT UNDERSTAND HOW THE APP, CORES, OR CONFIGURATION WORK, THAT IS YOUR RESPONSIBILITY.
USE AT YOUR OWN RISK.

## Features

- [x] Out-of-the-box Tun mode without service mode
- [x] Multiple color themes
- [x] Support for most Mihomo configuration options
- [x] Built-in Mihomo cores (stable and alpha)

## Screenshots
![Preview](./docs/preview.png)

## Themes

Custom theme authors can start from `themes/template.css`.

- Put your wallpaper into `--koala-theme-background`
- If needed, set a separate image for the announce block with `--koala-theme-announce-background`
- Adjust the top token block (`--base-*`, `--surface-*`, `--accent-*`, `--highlight-*`, `--info-*`) instead of hardcoding colors across the file
- See `themes/AGENTS.md` for the recommended workflow and checklist

## Development

### Requirements

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Git**

### Tech Stack

Koala Clash is built with Electron + React + TypeScript.

**Frontend:** React 19, shadcn/UI, Tailwind CSS, Monaco Editor

**Backend:** Electron, Mihomo Core, sysproxy-go

### Quick Start

```bash
git clone https://github.com/coolcoala/koala-clash.git
cd koala-clash
pnpm install
pnpm dev
```

If Electron fails to install:

```bash
cd node_modules/electron && node install.js && cd ../..
```

### Project Structure

```
src/
├── main/               # Electron main process
│   ├── core/           # Mihomo core management
│   ├── config/         # Configuration management
│   ├── resolve/        # Tray, shortcuts, auto-updater, floating window
│   ├── sys/            # System integration (sysproxy, autorun)
│   └── utils/          # Utilities
├── renderer/           # React frontend
│   └── src/
│       ├── components/ # React components
│       ├── pages/      # Page components
│       ├── hooks/      # Hooks and context providers
│       └── utils/      # Frontend utilities
├── preload/            # Preload scripts (IPC bridge)
└── shared/types/       # Shared TypeScript types
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (renderer hot reloads, main requires restart) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Run Prettier |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm build:win` | Build for Windows |
| `pnpm build:mac` | Build for macOS |
| `pnpm build:linux` | Build for Linux |

Architecture and format can be specified via flags:

```bash
pnpm build:win nsis --x64
pnpm build:mac pkg --arm64
pnpm build:linux deb --x64
```

### Build Artifacts

- **Windows**: `.exe` (NSIS installer), `.7z` (portable)
- **macOS**: `.pkg`
- **Linux**: `.deb`, `.rpm`, `.pkg.tar.xz` (pacman)

## Credits

Based on [Sparkle](https://github.com/xishang0128/sparkle) by [xishang0128](https://github.com/xishang0128).
