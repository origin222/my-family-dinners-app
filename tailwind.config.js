/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
		fontFamily: {
        sans: ['Inter', 'sans-serif'],
	},
  },
  },
  plugins: [
    require('daisyui'),
  ],
  // Add this daisyui config block
  daisyui: {
    themes: ["cupcake"], // Sets "cupcake" as the default theme
  },
}

