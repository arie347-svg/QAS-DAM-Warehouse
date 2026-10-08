/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        // Design system mockup QAS (web & mobile)
        brand: {
          red: "#E11D2E",
          redDark: "#C8102E",
          redSoft: "#FDECEE",
          navy: "#1E3A8A",
          blue: "#2563EB",
          blueSoft: "#EAF1FF",
          green: "#16A34A",
          greenSoft: "#E8F7EE",
          amber: "#F59E0B",
          amberSoft: "#FEF4E2",
          purple: "#7C3AED",
          purpleSoft: "#F1EAFE",
          bg: "#F6F7F9",
          ink: "#0F172A",
          muted: "#64748B",
          line: "#E8EBF0",
        },
        qas: {
          navy: "#0B2D57",
          navy2: "#173B67",
          blue: "#2F75B5",
          green: "#70AD47",
          lightGreen: "#E2F0D9",
          cream: "#F7EBD2",
          lightBlue: "#EAF1F8",
          lightGrey: "#F2F4F7",
          midGrey: "#D9DEE7",
          dark: "#17243A",
          amber: "#F4B183",
          red: "#C00000",
          lightRed: "#FCE4D6",
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04)",
        float: "0 10px 30px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 280ms ease-out both',
      },
      screens: {
        'xs': '360px',
      }
    },
  },
  plugins: [],
}
