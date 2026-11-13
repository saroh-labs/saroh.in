import { corsDelegate, corsOptionsFor, storefrontKeyOf } from "./cors";

const TRUSTED = ["https://app.saroh.in"];

/** The session, the trusted origins, and the limiter's wait made readable. */
const WORKSPACE = {
    origin: TRUSTED,
    credentials: true,
    exposedHeaders: ["X-Retry-After"],
};

describe("corsOptionsFor (U19)", () => {
    it("lets any merchant site call a public route, without credentials", () => {
        expect(corsOptionsFor("/public/services/svc_1/days", TRUSTED)).toEqual({
            origin: true,
            credentials: false,
        });
        expect(
            corsOptionsFor("/public/sites/site_1/booking?x=1", TRUSTED),
        ).toEqual({ origin: true, credentials: false });
    });

    it("keeps the workspace routes to the trusted origins, with the session", () => {
        expect(
            corsOptionsFor("/organizations/org_1/services", TRUSTED),
        ).toEqual(WORKSPACE);
        // A path that only looks public is not.
        expect(corsOptionsFor("/publicity", TRUSTED)).toEqual(WORKSPACE);
        // The sign-in pages read the limiter's wait off a refusal.
        expect(
            corsOptionsFor("/api/auth/email-otp/send-verification-otp", TRUSTED)
                .exposedHeaders,
        ).toEqual(["X-Retry-After"]);
    });

    it("keeps webhooks strict: providers call them server to server", () => {
        expect(
            corsOptionsFor("/public/webhooks/razorpay/org_1", TRUSTED),
        ).toEqual(WORKSPACE);
    });

    it('answers any origin with "*" on a live read the edge may keep (review #4)', () => {
        for (const path of [
            "/public/sites/site_1/today",
            "/public/sites/site_1/timetable?services=a,b",
            "/public/sites/site_1/shop/stock",
        ]) {
            expect(corsOptionsFor(path, TRUSTED)).toEqual({
                origin: "*",
                credentials: false,
            });
        }
        // The rest of the public reads still echo the caller.
        expect(
            corsOptionsFor("/public/sites/site_1/shop/products", TRUSTED),
        ).toEqual({ origin: true, credentials: false });
        expect(
            corsOptionsFor("/public/sites/site_1/today/extra", TRUSTED),
        ).toEqual({ origin: true, credentials: false });
    });

    it('answers any origin with "*" on a share picture (#1375)', () => {
        for (const path of [
            "/public/share/site_1/product/bun/image?style=price",
            "/public/share/own/sp_1/image",
        ]) {
            expect(corsOptionsFor(path, TRUSTED)).toEqual({
                origin: "*",
                credentials: false,
            });
        }
    });
});

describe("the keyed public API's CORS (plan 2026-11-10-001, U6)", () => {
    const pk = `pk_live_${"Ab9".repeat(14)}z`;
    const SITE = "https://shop.example.com";

    it("answers a storefront path only for its key's origins, without credentials", () => {
        expect(
            corsOptionsFor(`/v1/storefront/${pk}/products`, TRUSTED, [SITE]),
        ).toEqual({ origin: [SITE], credentials: false });
        // A key that opens nothing lists no origin.
        expect(
            corsOptionsFor(`/v1/storefront/${pk}/products`, TRUSTED),
        ).toEqual({ origin: [], credentials: false });
    });

    it("answers a storefront write's preflight for any origin, without credentials (U7)", () => {
        // The token is in Authorization, which no preflight carries; the
        // token's guard refuses an origin outside its list.
        expect(
            corsOptionsFor("/v1/storefront/write/bookings", TRUSTED),
        ).toEqual({ origin: true, credentials: false });
    });

    it("gives secret routes no CORS, and /mcp no credentials", () => {
        expect(corsOptionsFor("/v1/products", TRUSTED)).toEqual({
            origin: false,
        });
        expect(corsOptionsFor("/v1/storefront-tokens", TRUSTED)).toEqual({
            origin: false,
        });
        expect(corsOptionsFor("/mcp", TRUSTED)).toMatchObject({
            origin: TRUSTED,
            credentials: false,
        });
        // Only the prefix itself: /v1beta is the workspace's answer.
        expect(corsOptionsFor("/v1beta", TRUSTED)).toEqual(WORKSPACE);
    });

    it("reads the publishable key from the path, never a secret one", () => {
        expect(storefrontKeyOf(`/v1/storefront/${pk}/products?x=1`)).toBe(pk);
        expect(storefrontKeyOf(`/v1/storefront/${pk}`)).toBe(pk);
        expect(
            storefrontKeyOf(`/v1/storefront/${pk.replace("pk_", "sk_")}/x`),
        ).toBeUndefined();
        expect(storefrontKeyOf(`/v1/storefront/write/holds`)).toBeUndefined();
    });

    it("looks the key up for a storefront path and refuses on a failed lookup", async () => {
        const answer = (
            lookup: (t: string) => Promise<readonly string[]>,
            url: string,
        ) =>
            new Promise((resolve) =>
                corsDelegate(TRUSTED, lookup)({ url }, (_e, o) => resolve(o)),
            );
        const lookup = jest.fn().mockResolvedValue([SITE]);
        expect(await answer(lookup, `/v1/storefront/${pk}/products`)).toEqual({
            origin: [SITE],
            credentials: false,
        });
        expect(lookup).toHaveBeenCalledWith(pk);
        expect(
            await answer(
                () => Promise.reject(new Error("down")),
                `/v1/storefront/${pk}/products`,
            ),
        ).toEqual({ origin: [], credentials: false });
        // Everything else is answered without a lookup, as before.
        expect(await answer(lookup, "/organizations/o/services")).toEqual(
            WORKSPACE,
        );
        expect(lookup).toHaveBeenCalledTimes(1);
    });
});
