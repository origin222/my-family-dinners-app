/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('daisyui'),
  ],
  // Add this daisyui config block
  daisyui: {
    themes: ["cupcake"], // Sets "cupcake" as the default theme
  },
}

