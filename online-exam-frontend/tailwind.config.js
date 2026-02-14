// tailwind.config.js
module.exports = {
  // IMPORTANT: Tell Tailwind where your component files are
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {
      // Define a 'primary' color for a consistent, elegant look
      colors: {
        primary: {
          DEFAULT: '#3B82F6', // A clean blue for buttons and links
          hover: '#2563EB',
          light: '#60A5FA',
        },
      },
    },
  },
  // Include the forms plugin you just installed
  plugins: [
    require('@tailwindcss/forms'),
  ],
};