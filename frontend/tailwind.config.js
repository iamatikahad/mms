/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff', 100: '#d9edff', 200: '#bce0ff', 300: '#8ecdff',
          400: '#59b0ff', 500: '#338ffc', 600: '#1d71f0', 700: '#155cdc',
          800: '#184cb4', 900: '#1a428e', 950: '#142956',
        },
      },
      fontFamily: {
        bn: ['"Hind Siliguri"', '"Noto Sans Bengali"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
