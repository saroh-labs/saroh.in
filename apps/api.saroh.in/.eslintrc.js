/* eslint-disable no-undef */
module.exports = {
    root: true,
    extends: ["@saroh/eslint-config/library"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
    },
    env: {
        node: true,
    },
    ignorePatterns: ["dist/", "node_modules/", ".eslintrc.js"],
    rules: {
        "@typescript-eslint/no-console": [
            "warn",
            { allow: ["warn", "error", "info"] },
        ],
    },
};
