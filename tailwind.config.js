/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: 'rgb(var(--c-dark-bg) / <alpha-value>)',
          surface: 'rgb(var(--c-dark-surface) / <alpha-value>)',
          'surface-high': 'rgb(var(--c-dark-surface-high) / <alpha-value>)',
          border: 'rgb(var(--c-dark-border) / <alpha-value>)',
          text: 'rgb(var(--c-dark-text) / <alpha-value>)',
          muted: 'rgb(var(--c-dark-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#FF8A1F',
          hover: '#E67716',
          active: '#CC6610',
        },
        info: '#4C9AFF',
        status: {
          green: '#34C58B',
          yellow: '#F5B83D',
          red: '#F0616D',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
      },
      fontSize: {
        'page-title': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'section-title': ['16px', { lineHeight: '22px', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '16px', fontWeight: '400' }],
      }
    },
  },
  plugins: [],
}
