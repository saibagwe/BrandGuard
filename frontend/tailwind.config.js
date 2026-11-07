export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#003366',
          blue: '#0066CC',
          gold: '#F5A623',
          green: '#4CAF50',
        },
        // Legacy aliases kept for existing JSX components that still use nimbus-*
        nimbus: {
          navy: '#003366',
          blue: '#0066CC',
          gold: '#F5A623',
          green: '#4CAF50',
        }
      }
    }
  },
  plugins: []
}
