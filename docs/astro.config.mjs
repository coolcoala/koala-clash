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
import starlightThemeGalaxy from "starlight-theme-galaxy";

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
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      plugins: [
        starlightThemeGalaxy(),
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
      favicon: "/favicon.ico",
      logo: {
        src: "./src/assets/logo.png",
      },
      customCss: ["./src/styles/custom.css"],
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
          ],
        },
      ],
    }),
  ],
});
