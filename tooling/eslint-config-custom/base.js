/// <reference types="./types.d.ts" />

import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import turboPlugin from "eslint-plugin-turbo";
import * as path from "node:path";
import tseslint from "typescript-eslint";

/**
 * All packages that leverage t3-env should use this rule
 */
export const restrictEnvAccess = tseslint.config({
    files: ["**/*.js", "**/*.ts", "**/*.tsx"],
    // env.ts is the one file that SHOULD read process.env — it is the
    // validated boundary every other module imports from. Exempt it from
    // these two rules only.
    //
    // This was previously a standalone `{ ignores: ["**/env.ts"] }` config
    // object. In flat config a config object with only `ignores` is a
    // GLOBAL ignore, not a scoped one — and because restrictEnvAccess is
    // spread last in every app's eslint.config.mjs, it dropped every
    // apps/*/env.ts from linting entirely. That silently exempted the exact
    // files the frontend DB-import ban most needs to see: an env schema is
    // where a DATABASE_URL would first appear in a frontend.
    ignores: ["**/env.ts"],
    rules: {
        "no-restricted-properties": [
            "error",
            {
                object: "process",
                property: "env",
                message:
                    "Use `import { env } from '~/env'` instead to ensure validated types.",
            },
        ],
        "no-restricted-imports": [
            "error",
            {
                name: "process",
                importNames: ["env"],
                message:
                    "Use `import { env } from '~/env'` instead to ensure validated types.",
            },
        ],
    },
});

export default tseslint.config(
    // Ignore files not tracked by VCS and any config files
    includeIgnoreFile(path.join(import.meta.dirname, "../../.gitignore")),
    { ignores: ["**/*.config.*"] },
    {
        files: ["**/*.js", "**/*.ts", "**/*.tsx"],
        plugins: {
            import: importPlugin,
            turbo: turboPlugin,
        },
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommended,
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        rules: {
            ...turboPlugin.configs.recommended.rules,
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/consistent-type-imports": [
                "warn",
                { prefer: "type-imports", fixStyle: "separate-type-imports" },
            ],
            "@typescript-eslint/no-misused-promises": [
                2,
                { checksVoidReturn: { attributes: false } },
            ],
            "@typescript-eslint/no-unnecessary-condition": [
                "error",
                {
                    allowConstantLoopConditions: true,
                },
            ],
            "@typescript-eslint/no-non-null-assertion": "error",
            // This used to carry an `allow` entry exempting better-auth's
            // `APIError`, which IS an Error at runtime but whose shipped types
            // did not say so. That exemption no longer works and has been moved
            // to the single call site that needs it.
            //
            // The reason it stopped working: `allow: [{ from: "package", ... }]`
            // matches a named class declaration. As of better-call 1.3.7,
            // APIError is not a class — it is a type alias plus a const with a
            // construct signature returning `InternalAPIError & { errorStack }`.
            // There is no named class for the matcher to key on, so no package
            // name (better-auth, @better-auth/core, better-call — all tried)
            // matches it. Re-adding an `allow` entry here will silently do
            // nothing; put a scoped disable at the throw site instead.
            "@typescript-eslint/only-throw-error": "error",
            "import/consistent-type-specifier-style": [
                "error",
                "prefer-top-level",
            ],
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
        languageOptions: { parserOptions: { projectService: true } },
    },
);
