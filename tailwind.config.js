/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Ethical Aiditor Design System - Warm, approachable palette
      colors: {
        // Primary backgrounds
        cream: {
          50: '#faf8f5',   // Main background
          100: '#f5f3ef',  // Chat sidebar bg
          200: '#f0ebe3',  // Toolbar bg / hover states
          300: '#e3ddd1',  // Button hover
        },
        // Borders & dividers
        warm: {
          100: '#e8e3db',  // Primary border
          200: '#d4cec0',  // Input border
        },
        // Text colors
        ink: {
          DEFAULT: '#3d3d3d',  // Primary text
          light: '#5a5a5a',    // Secondary text
          muted: '#6b6b6b',    // Icons, tertiary
          placeholder: '#a8a8a8',
        },
        // Accent - Sage green for AI/active states
        sage: {
          DEFAULT: '#8b9d8b',  // Primary accent
          light: '#a8b5a8',    // Active button bg
          dark: '#7a8c7a',     // Hover state
          darker: '#2d3d2d',   // Text on sage bg
        },
        // Semantic colors
        destructive: {
          DEFAULT: '#d4183d',
          foreground: '#ffffff',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.625rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}
