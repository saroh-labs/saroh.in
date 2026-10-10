import { corsOptionsFor } from "./cors";

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
});
