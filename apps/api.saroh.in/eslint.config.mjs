import baseConfig from "@saroh/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // Spec files are excluded from tsconfig (build must not compile tests),
        // so the type-aware project service can't parse them. Lint of tests can
        // be reintroduced with the S0-003 isolated test harness.
        ignores: ["dist/**", "**/*.spec.ts", "test/**"],
    },
    ...baseConfig,
    {
        rules: {
            "no-console": ["warn", { allow: ["warn", "error", "info"] }],
        },
    },
];
