/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary Background
        'primary-bg': '#1A1A1A',
        
        // Card & Elevated Surfaces
        'card-bg': 'rgba(40, 40, 40, 0.9)',
        'header-bg': 'rgba(30, 30, 30, 0.95)',
        
        // Sage Green (Primary Accent)
        'sage-light': 'rgba(212, 232, 229, 0.15)',
        'sage-medium': 'rgba(212, 232, 229, 0.25)',
        'sage-strong': 'rgba(212, 232, 229, 0.35)',
        
        // Teal (Coach Identity)
        'teal-light': 'rgba(134, 199, 194, 0.2)',
        'teal-medium': 'rgba(134, 199, 194, 0.3)',
        'teal-strong': 'rgba(134, 199, 194, 0.5)',
        'teal-border': 'rgba(134, 199, 194, 0.6)',
        
        // Warning (Yellow - Behavioral)
        'warning-light': 'rgba(100, 85, 30, 0.4)',
        'warning-medium': 'rgba(120, 100, 40, 0.5)',
        'warning-strong': 'rgba(200, 160, 60, 0.6)',
        'warning-text': '#E8D4A0',
        
        // Error (Red - System Only)
        'error-light': 'rgba(100, 40, 40, 0.4)',
        'error-medium': 'rgba(120, 50, 50, 0.5)',
        'error-strong': 'rgba(200, 80, 80, 0.6)',
        'error-text': '#FCA5A5',
        
        // Success (Green)
        'success-light': 'rgba(40, 100, 60, 0.4)',
        'success-medium': 'rgba(50, 120, 70, 0.5)',
        'success-strong': 'rgba(80, 200, 120, 0.6)',
        'success-text': '#86EFAC',
        
        // Borders
        'border-light': 'rgba(212, 232, 229, 0.2)',
        'border-medium': 'rgba(212, 232, 229, 0.25)',
        'border-strong': 'rgba(212, 232, 229, 0.4)',
        
        // Text
        'text-primary': '#EBEBEB',
        'text-secondary': '#A0A0A0',
        'text-tertiary': '#858585',
      },
      backdropBlur: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
    },
  },
  plugins: [],
}