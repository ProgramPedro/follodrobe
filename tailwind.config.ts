import type { Config } from "tailwindcss";

export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        sans: ["Manrope", "sans-serif"]
      },
      colors: {
        ink: "#171512",
        paper: "#fbf8f1",
        oat: "#ede2cf",
        moss: "#6d7b58",
        clay: "#b76e55",
        denim: "#415a77"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(23, 21, 18, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
