import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { init, platform } from '@renderer/utils/init'
import '@renderer/assets/main.css'
import App from '@renderer/App'
import BaseErrorBoundary from './components/base/base-error-boundary'
import { Toaster } from './components/ui/sonner'
import { openDevTools, quitApp } from './utils/ipc'
import { AppConfigProvider } from './hooks/use-app-config'
import { ControledMihomoConfigProvider } from './hooks/use-controled-mihomo-config'
import { ProfileConfigProvider } from './hooks/use-profile-config'
import { RulesProvider } from './hooks/use-rules'
import { GroupsProvider } from './hooks/use-groups'
import { TotalTrafficProvider } from './hooks/use-total-traffic'

let F12Count = 0

init().then(() => {
  const handleKeydown = (e: KeyboardEvent): void => {
    if (platform !== 'darwin' && e.ctrlKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (platform === 'darwin' && e.metaKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (e.key === 'F12') {
      e.preventDefault()
      F12Count++
      if (F12Count >= 5) {
        openDevTools()
        F12Count = 0
      }
    }
  }
  document.addEventListener('keydown', handleKeydown)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NextThemesProvider attribute="class" enableSystem defaultTheme="dark">
        <BaseErrorBoundary>
          <HashRouter>
            <AppConfigProvider>
              <ControledMihomoConfigProvider>
                <ProfileConfigProvider>
                  <GroupsProvider>
                    <RulesProvider>
                      <TotalTrafficProvider>
                        <App />
                        <Toaster richColors position="bottom-right" />
                      </TotalTrafficProvider>
                    </RulesProvider>
                  </GroupsProvider>
                </ProfileConfigProvider>
              </ControledMihomoConfigProvider>
            </AppConfigProvider>
          </HashRouter>
        </BaseErrorBoundary>
      </NextThemesProvider>
  </React.StrictMode>
)
