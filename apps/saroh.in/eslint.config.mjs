import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import nextjsConfig from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // .open-next and .wrangler are the Cloudflare build output (cf:build).
        // worker.ts imports the Cloudflare build output (cf:build), so it
        // is outside tsconfig and the typed lint, as in saroh.app.
        // lib/{docs-content,search-content}.gen.* are generated
        // (docs-content.config.ts); the project sees only one of each pair at a time.
        ignores: [
            ".next/**",
            ".open-next/**",
            ".wrangler/**",
            "worker.ts",
            "lib/docs-content.gen.ts",
            "lib/docs-content.gen.d.ts",
            "lib/search-content.gen.ts",
            "lib/search-content.gen.d.ts",
        ],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
    ...restrictEnvAccess,
];
