/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stone: {
          // Paleta neutra cálida, afinada al beige de identidad Petravia
          50:  '#faf8f5',
          100: '#f3efe8',
          200: '#e6ddd0',
          300: '#d3c4ae',
          400: '#a99a82',
          500: '#7d7062',
          600: '#5c5347',
          700: '#453f37',
          800: '#2c2822',
          900: '#1c1a16',
          950: '#100e0b',
        },
        // Paleta oficial de identidad corporativa Petravia
        petravia: {
          azul:        '#4e5b73', // Pantone 2376-C
          'azul-dark': '#37414f',
          'azul-light':'#7c8798',
          beige:       '#cab6a1', // Pantone beige (tono suavizado, menos amarillo)
          'beige-dark':'#a48f77',
          'beige-light':'#e4dacc',
        },
      },
      fontFamily: {
        display: ['"Hind"', 'sans-serif'],
        body:    ['"Hind"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
