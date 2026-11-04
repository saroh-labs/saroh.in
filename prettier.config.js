// prettier.config.js
/* global module */
module.exports = {
    bracketSpacing: true,
    semi: true,
    trailingComma: "all",
    printWidth: 80,
    tabWidth: 4,
    plugins: [
        // comment for better diff
        "prettier-plugin-organize-imports",
        "prettier-plugin-tailwindcss",
    ],
    overrides: [
        {
            // No Tailwind config of its own: sorted by what the plugin defaults
            // to, its classes come out in another order, and cn() can then
            // draw them differently. saroh.in's is the config they're drawn by.
            files: "packages/marketing/**",
            options: { tailwindConfig: "./apps/saroh.in/tailwind.config.ts" },
        },
    ],
};
