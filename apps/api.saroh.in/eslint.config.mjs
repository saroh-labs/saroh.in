import baseConfig, { restrictEnvAccess } from "@saroh/eslint-config/base";

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
            // The built API runs from dist, where only its own dependencies
            // resolve: `express` used through Nest's failed to boot on CI.
            "import/no-extraneous-dependencies": [
                "error",
                {
                    // A developer's tools, run where dev deps are installed.
                    devDependencies: ["src/cli/ask.cli.ts", "eval/**"],
                    packageDir: import.meta.dirname,
                },
            ],
            // 05-P-01: `@Ip()` is Express's `req.ip`, which a caller could
            // steer through X-Forwarded-For; limits key on `@ClientAddress()`.
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "ImportDeclaration[source.value='@nestjs/common'] > ImportSpecifier[imported.name='Ip']",
                    message:
                        "Use @ClientAddress() (common/decorators/client-address.decorator.ts): @Ip() trusts X-Forwarded-For, which a caller can write.",
                },
            ],
        },
    },
    ...restrictEnvAccess,
];
