import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import nextjsConfig from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // .open-next and .wrangler are the Cloudflare build output (cf:build).
        // worker.ts imports that output, so it is outside tsconfig and the
        // typed lint; what it runs is lib/page-cache/, linted and tested.
        ignores: [".next/**", ".open-next/**", ".wrangler/**", "worker.ts"],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
    ...restrictEnvAccess,
];
