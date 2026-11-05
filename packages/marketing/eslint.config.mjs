import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import reactConfig from "@saroh/eslint-config/react";

/**
 * Drawn by every edition's public site, including static exports: no database,
 * no auth, no server-only Next API and no app code. What differs per site comes
 * in as props (README.md).
 */
export default [
    ...baseConfig,
    ...reactConfig,
    ...restrictEnvAccess,
    {
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@/*",
                                "@saroh/database",
                                "@saroh/database/*",
                                "@saroh/auth",
                                "@saroh/auth/*",
                                "next/headers",
                                "next/server",
                            ],
                            message:
                                "@saroh/marketing takes what differs per site as props (README.md); it imports no app code, database, auth or server API.",
                        },
                    ],
                },
            ],
        },
    },
];
