/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // You already have this
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // NEW COLORS - Added to your existing ones
      colors: {
        // Keep ALL your existing colors
        // These are ADDITIONS for the new design system
        
        // Card & Background (NEW)
        'card-bg': 'rgba(40, 40, 40, 0.9)',
        'header-bg': 'rgba(30, 30, 30, 0.95)',
        
        // Sage Green - Primary Accent (NEW)
        'sage-light': 'rgba(212, 232, 229, 0.15)',
        'sage-medium': 'rgba(212, 232, 229, 0.25)',
        'sage-strong': 'rgba(212, 232, 229, 0.35)',
        
        // Teal - Coach (matches your existing rgba(134,199,194,...))
        'teal-light': 'rgba(134, 199, 194, 0.2)',
        'teal-medium': 'rgba(134, 199, 194, 0.3)',
        'teal-strong': 'rgba(134, 199, 194, 0.5)',
        'teal-border': 'rgba(134, 199, 194, 0.6)',
        
        // Borders (NEW)
        'border-light': 'rgba(212, 232, 229, 0.2)',
        'border-medium': 'rgba(212, 232, 229, 0.25)',
        
        // Text (NEW - cleaner naming)
        'text-primary': '#EBEBEB',
        'text-secondary': '#A0A0A0',
        'text-tertiary': '#858585',
      },
      // Your existing config stays here...
    },
  },
  plugins: [],
}
