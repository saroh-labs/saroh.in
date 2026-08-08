import { Test } from "@nestjs/testing";

/**
 * API bootstrap smoke test (issue #90 / S0-011).
 *
 * Compiling AppModule resolves the ENTIRE Nest DI graph — every provider in
 * every module is instantiated. That is exactly the step that failed at
 * startup when a service declared a typed-but-not-injected constructor param
 * (the `FixedWindowRateLimiter` boot crash fixed in `0fc8f72`), yet 500+ unit
 * specs and the S3-008 E2E all missed it because they construct services
 * directly with `new`, never through the container. This spec is the guardrail
 * for that whole class of "the app doesn't even start" regressions.
 *
 * The auth boundary is ESM (`better-auth`) or an ESM-only Nest wrapper
 * (`@thallesp/nestjs-better-auth`) that the CommonJS ts-jest runner cannot load
 * — the sole reason no spec could import AppModule before. We mock that boundary
 * (the same approach the guard specs use): the bootstrap test's job is the
 * first-party DI graph, not the third-party auth internals, which are covered by
 * their own specs.
 *
 * We `compile()` rather than `init()`: compile resolves the DI graph (where an
 * `UnknownDependenciesException` throws) WITHOUT running lifecycle hooks, so it
 * needs no database and never starts the job worker.
 */

jest.mock("@thallesp/nestjs-better-auth", () => {
    // Minimal Nest module so AppModule's `AuthModule.forRoot(...)` is valid.
    const { Module } = require("@nestjs/common");
    class StubAuthModule {}
    Module({})(StubAuthModule);
    return { AuthModule: { forRoot: () => ({ module: StubAuthModule }) } };
});
jest.mock("./common/auth/auth", () => ({ auth: { api: {} } }));
jest.mock("@saroh/auth", () => ({
    getTrustedOrigins: () => [],
    isTrustedOrigin: () => true,
}));
jest.mock("better-auth/node", () => ({ fromNodeHeaders: (h: unknown) => h }));

// Must be set before AppModule (and its import-time env validation + Prisma
// adapter construction) loads — hence the dynamic import below. compile() never
// connects, so a syntactically valid but unreachable URL is enough.
if (!process.env.SKIP_ENV_VALIDATION) process.env.SKIP_ENV_VALIDATION = "1";
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        "postgresql://smoke:smoke@127.0.0.1:5432/saroh_bootstrap_smoke";
}

describe("API bootstrap", () => {
    it("compiles AppModule — the full DI graph resolves", async () => {
        const { AppModule } = await import("./app.module");
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        expect(moduleRef).toBeDefined();
        await moduleRef.close();
    });
});
