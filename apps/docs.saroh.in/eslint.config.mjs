import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import nextjsConfig from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // Nextra metadata files are plain JS outside the TS project; skip them
        // so the type-aware project service doesn't fail to parse them.
        ignores: [".next/**", "content/**/*.js", "mdx-components.js"],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
    ...restrictEnvAccess,
];
