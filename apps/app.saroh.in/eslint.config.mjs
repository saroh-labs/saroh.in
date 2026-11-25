import { readFileSync } from "node:fs";

import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";
import controlsConfig from "@saroh/eslint-config/controls";
import nextjsConfig, {
    restrictedImportOptions,
} from "@saroh/eslint-config/nextjs";
import reactConfig from "@saroh/eslint-config/react";

/**
 * React Query's boundary (DEC-259). The domains on React Query, read from
 * `lib/query/rq-routes.ts` as text: a component there reads through the
 * domain's queries, never its server `service` or `read` module.
 */
const rqDomains = [
    ...(
        /export const RQ_DOMAINS[^=]*=\s*\[([\s\S]*?)\]\s*;/.exec(
            readFileSync(
                new URL("./lib/query/rq-routes.ts", import.meta.url),
                "utf8",
            ),
        )?.[1] ?? ""
    ).matchAll(/["']([^"']+)["']/g),
].map((m) => m[1]);

/** nextjs's import bans, plus React Query's; one rule, so one option object. */
const queryImports = (patterns = []) => [
    "error",
    {
        ...restrictedImportOptions,
        paths: [
            ...restrictedImportOptions.paths,
            {
                // A QueryClient is made in lib/query only: one per request on
                // the server, one per visit in the browser. A module-scope one
                // would hand one person's rows to the next request.
                name: "@tanstack/react-query",
                importNames: ["QueryClient"],
                allowTypeImports: true,
                message:
                    "Make a QueryClient only in lib/query/client.ts (makeQueryClient) or server-client.ts (getServerQueryClient); use useQueryClient() in a component.",
            },
            {
                // Nothing in the app is fetched ahead just for being on
                // screen: every prefetch of a page is two Worker requests,
                // and the sidebar, Home and list rows started ~35 a page.
                // IntentLink fetches ahead on pointer, touch or focus.
                name: "next/link",
                importNames: ["default"],
                message:
                    'Use IntentLink from "@saroh/ui/intent-link": it prefetches on intent, not on sight.',
            },
        ],
        patterns: [...restrictedImportOptions.patterns, ...patterns],
    },
];

const TESTS = ["**/*.test.ts", "**/*.test.tsx", "lib/query/test-utils.tsx"];

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // .open-next and .wrangler are the Cloudflare build output (cf:build).
        // worker.ts imports the Cloudflare build output (cf:build), so it
        // is outside tsconfig and the typed lint, as in saroh.app.
        ignores: [".next/**", ".open-next/**", ".wrangler/**", "worker.ts"],
    },
    ...baseConfig,
    ...reactConfig,
    ...nextjsConfig,
    ...restrictEnvAccess,
    // One Button, one Input, one Field: no hand-made controls, no disabled
    // fade, no focus ring for the mouse (tooling/eslint-config-custom/controls.js).
    ...controlsConfig,
    {
        files: ["**/*.ts", "**/*.tsx"],
        ignores: [
            ...TESTS,
            "lib/query/client.ts",
            "lib/query/server-client.ts",
        ],
        rules: { "@typescript-eslint/no-restricted-imports": queryImports() },
    },
    {
        files: ["components/**/*.ts", "components/**/*.tsx"],
        ignores: TESTS,
        rules: {
            "@typescript-eslint/no-restricted-imports": queryImports(
                rqDomains.length
                    ? [
                          {
                              group: rqDomains.flatMap((d) => [
                                  `@/lib/${d}/service`,
                                  `@/lib/${d}/service-*`,
                                  `@/lib/${d}/read`,
                                  `@/lib/${d}/reads`,
                              ]),
                              // Types carry no server code.
                              allowTypeImports: true,
                              message:
                                  "This domain is on React Query: read through its lib/<domain>/queries.ts, not the server service.",
                          },
                      ]
                    : [],
            ),
        },
    },
];
