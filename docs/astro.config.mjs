// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightScrollToTop from "starlight-scroll-to-top";
import starlightUtils from "@lorenzo_lewis/starlight-utils";
import starlightLinksValidator from "starlight-links-validator";
import starlightSidebarTopics from "starlight-sidebar-topics";
import starlightKbd from "starlight-kbd";
import autoImport from "astro-auto-import";
import starlightGitHubAlerts from "starlight-github-alerts";

export default defineConfig({
  site: "https://prettyleaf.github.io",
  base: "/",
  vite: {
    resolve: {
      alias: {
        "@components": "/src/components",
      },
    },
  },
  integrations: [
    autoImport({
      imports: [],
    }),
    starlight({
      components: {
        Header: "./src/components/Header.astro",
        Hero: "./src/components/Hero.astro",
        LanguageSelect: "./src/components/LanguageSelect.astro",
        MobileMenuFooter: "./src/components/MobileMenuFooter.astro",
        PageTitle: "./src/components/PageTitle.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      plugins: [
        starlightGitHubAlerts(),
        starlightScrollToTop({
          showTooltip: false,
          borderRadius: "25",
        }),
        starlightKbd({
          globalPicker: false,
          types: [
            { id: "mac", label: "macOS" },
            { id: "windows", label: "Windows", default: true },
            { id: "linux", label: "Linux" },
          ],
        }),
      ],
      title: "Koala Clash",
      description:
        "A geeked Mihomo client with features which improve the user experience",
      favicon: "/favicon.ico",
      // Our own 404 lives in src/pages/404.astro.
      disable404Route: true,
      customCss: [
        "@fontsource-variable/inter",
        "@fontsource-variable/manrope",
        "./src/styles/custom.css",
      ],
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        styleOverrides: {
          borderRadius: "0.875rem",
          borderColor: "var(--kc-border)",
          codeBackground: "var(--kc-surface)",
          codeFontSize: "0.875rem",
          frames: {
            shadowColor: "transparent",
            editorTabBarBackground: "var(--kc-muted)",
            editorActiveTabBackground: "var(--kc-surface)",
            editorActiveTabIndicatorTopColor: "var(--kc-brand-text)",
            editorTabBarBorderBottomColor: "var(--kc-border)",
            terminalTitlebarBackground: "var(--kc-muted)",
            terminalTitlebarBorderBottomColor: "var(--kc-border)",
            terminalBackground: "var(--kc-surface)",
            inlineButtonBorder: "var(--kc-border)",
          },
        },
      },
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        ru: {
          label: "Русский",
          lang: "ru",
        },
      },
      editLink: {
        baseUrl: "https://github.com/prettyleaf/koala-clash/edit/docs/docs/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/prettyleaf/koala-clash/",
        },
      ],
      sidebar: [
        {
          label: "Introduction",
          translations: { ru: "Введение" },
          items: [
            {
              label: "Overview",
              slug: "introduction/overview",
              translations: { ru: "Обзор" },
            },
            {
              label: "Installation",
              slug: "introduction/installation",
              translations: { ru: "Установка" },
            },
          ],
        },
        {
          label: "Using the app",
          translations: { ru: "Использование" },
          items: [
            {
              label: "Adding a subscription",
              slug: "usage/subscriptions",
              translations: { ru: "Добавление подписки" },
            },
            {
              label: "Connecting",
              slug: "usage/connecting",
              translations: { ru: "Подключение" },
            },
            {
              label: "Choosing a server",
              slug: "usage/proxies",
              translations: { ru: "Выбор сервера" },
            },
            {
              label: "Routing rules",
              slug: "usage/rules",
              translations: { ru: "Правила маршрутизации" },
            },
            {
              label: "Connections and logs",
              slug: "usage/connections-logs",
              translations: { ru: "Подключения и логи" },
            },
            {
              label: "Settings",
              slug: "usage/settings",
              translations: { ru: "Настройки" },
            },
            {
              label: "Themes",
              slug: "usage/themes",
              translations: { ru: "Темы" },
            },
          ],
        },
        {
          label: "For providers",
          translations: { ru: "Для провайдеров" },
          items: [
            {
              label: "Subscription headers",
              slug: "providers/headers",
              translations: { ru: "Заголовки подписки" },
            },
            {
              label: "Import links",
              slug: "providers/deep-links",
              translations: { ru: "Ссылки для импорта" },
            },
          ],
        },
        {
          label: "Help",
          translations: { ru: "Помощь" },
          items: [
            {
              label: "FAQ",
              slug: "help/faq",
              translations: { ru: "Частые вопросы" },
            },
          ],
        },
        {
          label: "Project",
          translations: { ru: "Проект" },
          items: [
            {
              label: "Contributors",
              slug: "project/contributors",
              translations: { ru: "Контрибьюторы" },
            },
          ],
        },
      ],
    }),
  ],
});
