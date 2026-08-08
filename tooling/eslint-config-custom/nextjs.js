import nextPlugin from "@next/eslint-plugin-next";

const DB_IMPORT_BAN_MESSAGE =
    "Frontend apps must not import the database/Prisma directly. Call the API (api.saroh.in) instead — see docs/architecture (API owns all DB access).";

const AUTH_ROOT_BAN_MESSAGE =
    "Import a specific @saroh/auth entry — /client, /middleware, /next, /auth-status, or /constants. The root and /server both resolve to dist/server.mjs, which re-imports @saroh/database and would pull Prisma into a frontend bundle.";

/**
 * Package groups a frontend must never import, matched as patterns. Shared by
 * the TypeScript and JSX blocks below so the two can't drift apart.
 *
 * Bare `prisma` and `@prisma/*` cover the specifiers the frontends' own
 * next.config files used to externalize — `prisma/client` alone missed both.
 * Subpath coverage is automatic: no-restricted-imports matches `group` entries
 * with gitignore semantics, so "@saroh/database" already bans everything under
 * it. That is what we want for these packages.
 */
const DB_IMPORT_BAN_PATTERNS = [
    "@saroh/database",
    "@saroh/database/*",
    "@saroh/templates",
    "@prisma/client",
    "@prisma/*",
    "prisma",
    "prisma/client",
    ".prisma",
    ".prisma/*",
];

/**
 * Exact specifiers, deliberately NOT patterns.
 *
 * packages/auth declares @saroh/database as a runtime dependency, but only its
 * root and `./server` exports resolve to dist/server.mjs — the build that
 * actually re-imports it. `./client`, `./middleware`, `./next`,
 * `./auth-status`, and `./constants` are plain source and are the sanctioned
 * way for a frontend to use auth.
 *
 * These must go through `paths` (exact match) rather than `patterns`: the same
 * gitignore semantics that make pattern subpath coverage automatic above would
 * here ban every safe entry too. An earlier revision of this rule did exactly
 * that and broke templates.saroh.in's import of @saroh/auth/auth-status.
 */
const AUTH_ROOT_BAN_PATHS = ["@saroh/auth", "@saroh/auth/server"];

/** Shared option object for both the TypeScript and JSX rule blocks. */
const restrictedImportOptions = {
    paths: AUTH_ROOT_BAN_PATHS.map((name) => ({
        name,
        message: AUTH_ROOT_BAN_MESSAGE,
    })),
    patterns: [
        { group: DB_IMPORT_BAN_PATTERNS, message: DB_IMPORT_BAN_MESSAGE },
    ],
};

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
                restrictedImportOptions,
            ],
        },
    },
    {
        // The block above is TypeScript-only, so it never matched a single file
        // in docs.saroh.in or help.saroh.in — both are written entirely in
        // .jsx, and their only .ts file is next-env.d.ts. `pnpm lint` there
        // reported "No issues found" while linting zero files, which read as a
        // passing boundary check that had in fact never run.
        //
        // Two deliberate differences from the block above:
        //   - the CORE no-restricted-imports rule, since the @typescript-eslint
        //     variant needs the TS parser these files don't go through;
        //   - projectService disabled, because base.js turns it on for every
        //     file and these .jsx sources are not in any tsconfig (the same
        //     parse failure that made docs/help ignore their .js files).
        //
        // .js is intentionally absent: restrictEnvAccess is spread after this
        // config in every app and sets its own core no-restricted-imports for
        // **/*.js, which would clobber this one. The .js files in these apps
        // (mdx-components.js, content/**/*.js) are already ignored per-app.
        files: ["**/*.jsx", "**/*.mjs"],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: false,
                // These files go through the default parser rather than
                // typescript-eslint's, and espree does not accept JSX unless
                // asked to.
                ecmaFeatures: { jsx: true },
            },
        },
        rules: {
            "no-restricted-imports": ["error", restrictedImportOptions],
        },
    },
];
