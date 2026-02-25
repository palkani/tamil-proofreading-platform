/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EBF4FB',
          100: '#d6e9f7',
          200: '#b3d4f0',
          300: '#7ab8e6',
          400: '#4d9bdc',
          500: '#2979FF',  // Vibrant medium blue (accent)
          600: '#1A2B68',  // Deep navy (primary headings)
          700: '#152558',
          800: '#0f1a42',
          900: '#0a122e',
        },
        accent: {
          50:  '#EBF4FB',
          100: '#d6e9f7',
          200: '#b3d4f0',
          300: '#7ab8e6',
          400: '#4d9bdc',
          500: '#2979FF',
          600: '#1A2B68',
          700: '#152558',
          800: '#0f1a42',
          900: '#0a122e',
        },
        body: '#4A4A4A',
      },
    },
  },
  plugins: [],
}
