import { defineConfig, passthroughImageService } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightThemeFlexoki from 'starlight-theme-flexoki'

export default defineConfig({
  site: 'https://openscribbler.github.io',
  base: process.env.ASTRO_BASE_PATH || '/',
  // The GIFs are animated and too large for sharp, so they ship as they are.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'Katharsis',
      description:
        'A Claude Code output style that classifies each message you send and shapes the reply to fit it.',
      plugins: [starlightThemeFlexoki()],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/OpenScribbler/Katharsis',
        },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'index' },
            { label: 'Install', slug: 'start/install' },
            { label: 'Uninstall', slug: 'start/uninstall' },
            { label: 'Upgrading from 0.2.x', slug: 'start/upgrading' },
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'How a turn works', slug: 'how/overview' },
            { label: 'Exchange types', slug: 'how/exchange-types' },
            { label: 'Reference codes', slug: 'how/reference-codes' },
            { label: 'kref', slug: 'how/kref' },
            { label: 'The drawer', slug: 'how/drawer' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Where things live', slug: 'reference/where-things-live' },
            { label: "What's included", slug: 'reference/whats-included' },
            { label: 'Provenance', slug: 'reference/provenance' },
            { label: 'Why Katharsis exists', slug: 'reference/why' },
          ],
        },
      ],
    }),
  ],
})
