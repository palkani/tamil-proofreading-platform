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
          50:  '#eef3ff',
          100: '#dce6ff',
          200: '#b3caff',
          300: '#7aa6ff',
          400: '#4d88ff',
          500: '#3395ff', // Razorpay accent blue
          600: '#1e2d7d', // Razorpay dark navy (primary brand)
          700: '#162065', // Deeper navy (hover)
          800: '#0d1b50', // Darkest navy
          900: '#080f30',
        },
        accent: {
          50:  '#eef3ff',
          100: '#dce6ff',
          200: '#b3caff',
          300: '#7aa6ff',
          400: '#4d88ff',
          500: '#3395ff', // Razorpay accent blue
          600: '#1e2d7d',
          700: '#162065',
          800: '#0d1b50',
          900: '#080f30',
        },
      },
    },
  },
  plugins: [],
}
