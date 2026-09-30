import baseConfig from "@saroh/eslint-config/base";
import reactConfig from "@saroh/eslint-config/react";

/**
 * Gate G1 (#252) — what a site block may import.
 *
 * React, `next/link`, `clsx`/`tailwind-merge`, and `@saroh/block-contract`.
 * Nothing else from the workspace, and `@saroh/ui` above all.
 *
 * (The blocks draw plain `<img>` elements for publication images, which come
 * from arbitrary tenant origins that next/image's per-domain allowlist cannot
 * express. Each one says so at the call site. No Next lint rules run over this
 * package, so no disable directive is needed to permit it.)
 *
 * This is not tidiness. `@saroh/ui` IS Saroh's brand layer — `bg-primary`,
 * `text-muted-foreground` — and these components render MERCHANTS' websites,
 * which must never inherit it. `apps/app.saroh.in`'s section preview was built
 * from 35 usages of that palette, so a merchant previewing their bakery saw
 * Saroh's colours and nothing they chose could change them. That was found by
 * a person reading the file. A rule finds it on the commit.
 */
const message =
    "A site block may import React, next, clsx/tailwind-merge and @saroh/block-contract — nothing else. @saroh/ui is Saroh's brand layer and merchant sites must never inherit it (#252). If a block needs a button, it draws one from the --site-* tokens.";

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
                            group: [
                                "@saroh/*",
                                "!@saroh/block-contract",
                                "!@saroh/block-contract/*",
                            ],
                            message,
                        },
                    ],
                },
            ],
        },
    },
    /*
     * A TEST may also draw a shipped site template through the blocks
     * (`starter-template.test.tsx`, DEC-070 K10): what a new site opens with
     * is only proven by rendering it. `@saroh/templates` is pure data, and a
     * test ships nothing to a merchant's page, so G1's reason does not reach
     * it. Everything else stays shut, `@saroh/ui` included.
     */
    {
        files: ["src/**/*.test.tsx"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@saroh/*",
                                "!@saroh/block-contract",
                                "!@saroh/block-contract/*",
                                "!@saroh/templates",
                            ],
                            message,
                        },
                    ],
                },
            ],
        },
    },
];
