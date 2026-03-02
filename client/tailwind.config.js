/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#7ed957',
        secondary: '#0097b2',
        tertiary: '#8baf3f',
        lime: '#b0cf53',
      },
    },
  },
  plugins: [],
}
