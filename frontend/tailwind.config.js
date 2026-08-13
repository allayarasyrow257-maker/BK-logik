/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        gold: {
          400: '#F5C518',
          500: '#E6B800',
          600: '#C9A000',
        },
        dark: {
          900: '#080808',
          800: '#111111',
          700: '#1A1A1A',
          600: '#222222',
          500: '#2E2E2E',
        },
      },
    },
  },
  plugins: [],
}
