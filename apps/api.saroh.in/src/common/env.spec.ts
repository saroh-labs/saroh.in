import { parseEnv } from "../env";

/**
 * A deployed API (NODE_ENV=production) refuses to boot without the
 * addresses it puts in customers' and staff's emails, and its sender
 * (plan 2026-10-05-001 KTD-2). Unset, they used to fall back to production's
 * sites from any host.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@localhost:5432/saroh-test" };
const DEPLOYED = {
    ...BASE,
    NODE_ENV: "production",
    RENDERER_URL: "https://saroh.app",
    APP_URL: "https://app.saroh.in",
    EMAIL_FROM: "Saroh <noreply@saroh.in>",
};

const missing = (source: Record<string, string | undefined>) => {
    const parsed = parseEnv(source);
    return parsed.success
        ? []
        : parsed.error.issues.map((issue) => issue.path.join("."));
};

describe("the API's environment", () => {
    it("boots in production with its addresses and sender", () => {
        expect(missing(DEPLOYED)).toEqual([]);
    });

    it("refuses production without each of them, by name", () => {
        expect(
            missing({
                ...DEPLOYED,
                RENDERER_URL: undefined,
                APP_URL: undefined,
                EMAIL_FROM: undefined,
            }),
        ).toEqual(["RENDERER_URL", "APP_URL", "EMAIL_FROM"]);
    });

    it("lets development and tests go without them", () => {
        expect(missing({ ...BASE, NODE_ENV: "development" })).toEqual([]);
        expect(missing({ ...BASE, NODE_ENV: "test" })).toEqual([]);
    });

    it("defaults Cashfree to production and takes sandbox", () => {
        const live = parseEnv(DEPLOYED);
        const test = parseEnv({ ...DEPLOYED, CASHFREE_ENV: "sandbox" });
        expect(live.success && live.data.CASHFREE_ENV).toBe("production");
        expect(test.success && test.data.CASHFREE_ENV).toBe("sandbox");
        expect(parseEnv({ ...DEPLOYED, CASHFREE_ENV: "live" }).success).toBe(
            false,
        );
    });
});
