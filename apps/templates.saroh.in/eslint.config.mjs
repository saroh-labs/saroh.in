import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import nextjsConfig from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        ignores: [".next/**"],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
    ...restrictEnvAccess,
];
