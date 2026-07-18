import nextPlugin from "@next/eslint-plugin-next";

/** @type {Awaited<import('typescript-eslint').Config>} */
export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            "@next/next": nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs["core-web-vitals"].rules,
            // TypeError: context.getAncestors is not a function
            "@next/next/no-duplicate-head": "off",
            // Package boundary: frontends must never touch the database directly —
            // all data access goes through the API (api.saroh.in). Uses the
            // @typescript-eslint variant so it doesn't collide with the base
            // `no-restricted-imports` that restrictEnvAccess sets. The @typescript-eslint
            // plugin is registered by the base config, always spread before this one.
            "@typescript-eslint/no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@saroh/database",
                                "@saroh/database/*",
                                "@prisma/client",
                                "prisma/client",
                                ".prisma",
                                ".prisma/*",
                            ],
                            message:
                                "Frontend apps must not import the database/Prisma directly. Call the API (api.saroh.in) instead — see docs/architecture (API owns all DB access).",
                        },
                    ],
                },
            ],
        },
    },
];
