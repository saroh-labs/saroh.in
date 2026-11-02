import baseConfig from "@saroh/eslint-config/base";
import nextjsConfig from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        ignores: [
            ".next/**",
            "out/**",
            ".wrangler/**",
            "worker/**",
            "scripts/**",
        ],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
];
