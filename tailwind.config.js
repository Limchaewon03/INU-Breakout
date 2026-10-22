/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        inu: {
          blue: '#003876',
          sky: '#0072CE',
          accent: '#00C4B4',
          gold: '#FFB81C',
          dark: '#050c1e',
        }
      }
    },
  },
  plugins: [],
}
