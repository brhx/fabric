/** @type {import("prettier").Config} */
export default {
  experimentalTernaries: true,
  plugins: [
    // first loaded; order doesn't matter
    "@prettier/plugin-xml",

    // essentially last; where chaining order is vital
    "prettier-plugin-organize-imports",
    "prettier-plugin-jsdoc", // must come after organize-imports
    "prettier-plugin-embed", // must come last except for tailwind
    "prettier-plugin-tailwindcss", // must come absolutely last

    // very last; only allowed if they don't interfere with those before
    "prettier-plugin-packagejson", // isolated grammar
  ],
  tailwindFunctions: ["cva", "cx"],
};
