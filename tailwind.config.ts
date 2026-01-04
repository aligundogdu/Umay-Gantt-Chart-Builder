import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace']
      },
      colors: {
        // Monochrome palette
        surface: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a'
        },
        // Soft Gantt bar colors (Mor hariç)
        gantt: {
          mint: '#A8E6CF',
          blue: '#88D8F5',
          peach: '#FFCBA4',
          yellow: '#FFF3B0',
          pink: '#FFB6C1',
          slate: '#B4C7E7',
          teal: '#81D4D4',
          coral: '#FFB5A7',
          sage: '#C5D5CB'
        }
      },
      spacing: {
        'gantt-row': '40px',
        'gantt-header': '60px'
      }
    }
  },
  plugins: []
} satisfies Config

