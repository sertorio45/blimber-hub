import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetAnimations from 'unocss-preset-animations'
import { builtinColors, presetShadcn } from 'unocss-preset-shadcn'

export default defineConfig({
  variants: [
    {
      // nth-[]:class
      name: ':nth-child()',
      match: (matcher: string) => {
        const match = matcher.match(/^nth-\[(.+?):/)
        if (!match)
          return matcher
        return {
          // slice `hover:` prefix and passed to the next variants and rules
          matcher: matcher.substring(match[0].length),
          selector: s => `${s}:nth-child(${match[1]})`,
        }
      },
      multiPass: true,
    },
  ],
  theme: {
    animation: {
      keyframes: {
        'spin-slow': '{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
        'shimmer': '{0%{background-position:-200% 0}100%{background-position:200% 0}}',
      },
      counts: {
        'spin-slow': 'infinite',
        'shimmer': 'infinite',
      },
      durations: {
        'spin-slow': '3s',
        'shimmer': '1.6s',
      },
      timingFns: {
        shimmer: 'ease-in-out',
      },
    },
  },
  shortcuts: {
    'media-skeleton-shimmer':
      'bg-muted bg-[linear-gradient(90deg,hsl(var(--muted))_0%,hsl(var(--muted-foreground)/0.14)_50%,hsl(var(--muted))_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none',
  },
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    // Do not fetch Google Fonts at build time — Vercel CI often times out
    // (`[unocss] Fetch web fonts timeout`) and fails the whole Nuxt build.
    // Runtime @import keeps Chivo without a build-time network dependency.
    presetWebFonts({
      fonts: {
        sans: 'Chivo',
        mono: 'Chivo Mono',
      },
      inlineImports: false,
    }),
    presetAnimations(),
    presetShadcn(builtinColors.map(c => ({ color: c }))),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup({ separators: [':'] })],
  content: {
    pipeline: {
      include: [
        // the default
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // include js/ts files
        'components/ui/**/*.{js,ts}',
        'constants/**/*.{js,ts}',
      ],
    },
  },
  preflights: [
    {
      getCSS: () => `
        :root {
          --sidebar-background: 0 0% 98%;
          --sidebar-foreground: 240 5.3% 26.1%;
          --sidebar-primary: 240 5.9% 10%;
          --sidebar-primary-foreground: 0 0% 98%;
          --sidebar-accent: 240 4.8% 95.9%;
          --sidebar-accent-foreground: 240 5.9% 10%;
          --sidebar-border: 220 13% 91%;
          --sidebar-ring: 217.2 91.2% 59.8%;
        }

        .dark {
          --sidebar-background: 240 5.9% 10%;
          --sidebar-foreground: 240 4.8% 95.9%;
          --sidebar-primary: 224.3 76.3% 48%;
          --sidebar-primary-foreground: 0 0% 100%;
          --sidebar-accent: 240 3.7% 15.9%;
          --sidebar-accent-foreground: 240 4.8% 95.9%;
          --sidebar-border: 240 3.7% 15.9%;
          --sidebar-ring: 217.2 91.2% 59.8%;
        }
      `,
    },
  ],
})
