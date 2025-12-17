/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // TODO: Copy Purdue branding colors and fonts from django-react-template
      colors: {
        purdue: {
          gold: '#CEB888',
          'gold-light': '#DACC9F',
          'gold-dark': '#B59D6B',
          aged: '#8E6F3E',
          'aged-dark': '#6b5530',
        },
      },
    },
  },
  plugins: [],
};
