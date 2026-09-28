/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './site.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        raycast: {
          canvas: '#07080a',
          surface: '#0d0d0d',
          elevated: '#101111',
          card: '#121212',
          cardHover: '#18191b',
          hairline: '#242728',
          'hairline-soft': 'rgba(255, 255, 255, 0.08)',
          'hairline-strong': 'rgba(255, 255, 255, 0.16)',
          ink: '#f4f4f6',
          body: '#cdcdcd',
          charcoal: '#d3d3d4',
          mute: '#9c9c9d',
          ash: '#6a6b6c',
          stone: '#434345',
          blue: '#57c1ff',
          'blue-soft': 'rgba(87, 193, 255, 0.14)',
          red: '#ff6161',
          'red-soft': 'rgba(255, 97, 97, 0.14)',
          green: '#59d499',
          'green-soft': 'rgba(89, 212, 153, 0.14)',
          yellow: '#ffc533',
          'yellow-soft': 'rgba(255, 197, 51, 0.14)',
        },
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        'raycast-card': '0 0 0 1px #242728, 0 8px 24px -4px rgba(0, 0, 0, 0.6)',
        'raycast-modal': '0 0 0 1px #242728, 0 24px 64px 0 rgba(0, 0, 0, 0.85)',
        'raycast-hud': '0 0 0 1px #242728, 0 12px 32px rgba(0, 0, 0, 0.7)',
        'raycast-input': '0 0 0 1px rgba(255, 255, 255, 0.18)',
      },
    },
  },
  plugins: [],
}
