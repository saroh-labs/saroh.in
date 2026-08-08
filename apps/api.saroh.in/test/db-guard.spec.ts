import { assertTestDatabase } from "./db-guard";

/**
 * Unit test for the non-test-DB guard. Needs NO database — it only exercises
 * the URL-vetting logic, so it runs in the fast unit project.
 */
describe("assertTestDatabase (non-test-DB guard)", () => {
    const env = (
        overrides: Record<string, string | undefined>,
    ): NodeJS.ProcessEnv => overrides as NodeJS.ProcessEnv;

    it("REJECTS when TEST_DATABASE_URL is missing (no fallback to DATABASE_URL)", () => {
        expect(() =>
            assertTestDatabase(
                env({
                    DATABASE_URL:
                        "postgresql://user:pass@prod-host:5432/saroh_prod",
                }),
            ),
        ).toThrow(/TEST_DATABASE_URL is not set/);
    });

    it("REJECTS a prod-looking database name (no test marker)", () => {
        expect(() =>
            assertTestDatabase(
                env({
                    TEST_DATABASE_URL:
                        "postgresql://user:pass@prod-host:5432/saroh_prod",
                }),
            ),
        ).toThrow(/not a recognized test database/);
    });

    it("REJECTS the dev database name", () => {
        expect(() =>
            assertTestDatabase(
                env({
                    TEST_DATABASE_URL:
                        "postgresql://user:pass@rds-host:5432/saroh_dev?sslmode=no-verify",
                }),
            ),
        ).toThrow(/not a recognized test database/);
    });

    it("REJECTS when TEST_DATABASE_URL equals DATABASE_URL", () => {
        const url = "postgresql://postgres:postgres@localhost:5432/saroh_test";
        expect(() =>
            assertTestDatabase(
                env({ TEST_DATABASE_URL: url, DATABASE_URL: url }),
            ),
        ).toThrow(/identical to DATABASE_URL/);
    });

    it("REJECTS when it resolves to the same host+db as DATABASE_URL", () => {
        expect(() =>
            assertTestDatabase(
                env({
                    TEST_DATABASE_URL:
                        "postgresql://a:a@db-host:5432/saroh_test",
                    // different creds, same host + same db name
                    DATABASE_URL: "postgresql://b:b@db-host:5432/saroh_test",
                }),
            ),
        ).toThrow(/same host\+database/);
    });

    it("REJECTS an invalid URL", () => {
        expect(() =>
            assertTestDatabase(env({ TEST_DATABASE_URL: "not-a-url" })),
        ).toThrow(/not a valid connection URL/);
    });

    it("ACCEPTS a proper local test URL and returns it", () => {
        const url = "postgresql://postgres:postgres@localhost:5432/saroh_test";
        expect(assertTestDatabase(env({ TEST_DATABASE_URL: url }))).toBe(url);
    });

    it("ACCEPTS a test URL that differs from DATABASE_URL", () => {
        const url = "postgresql://postgres:postgres@localhost:5432/saroh_test";
        expect(
            assertTestDatabase(
                env({
                    TEST_DATABASE_URL: url,
                    DATABASE_URL:
                        "postgresql://user:pass@rds-host:5432/saroh_dev?sslmode=no-verify",
                }),
            ),
        ).toBe(url);
    });

    it('ACCEPTS any name containing "test" (e.g. a _test suffix)', () => {
        const url = "postgresql://postgres:postgres@localhost:5432/myapp_test";
        expect(assertTestDatabase(env({ TEST_DATABASE_URL: url }))).toBe(url);
    });
});
