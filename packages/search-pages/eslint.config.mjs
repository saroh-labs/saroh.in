import baseConfig from "@saroh/eslint-config/base";
import reactConfig from "@saroh/eslint-config/react";

/**
 * The /for/ pages are Saroh's own marketing pages, drawn the same in
 * saroh.in and the admin preview from one stylesheet (`src/styles.css`).
 * Nothing from the workspace: no `@saroh/ui` (its tokens would draw them
 * differently in each app) and no app env.
 */
export default [
    ...baseConfig,
    ...reactConfig,
    {
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@saroh/*"],
                            message:
                                "@saroh/search-pages draws itself from src/styles.css so it looks the same in saroh.in and admin; it imports nothing from the workspace.",
                        },
                    ],
                },
            ],
        },
    },
];
