import { afterEach, describe, expect, it, vi } from "vitest";

import {
    isBookResult,
    resultOf,
    TEST_RELEASE_MESSAGE,
} from "@saroh/site-blocks";

import { emailChangeAnswer, refusalMessage } from "./account-shape";
import { joinStartAnswer } from "./plan-join-shape";
import { problemOf } from "./shop-checkout-shape";
import { codeResult, sessionAnswer } from "./sign-in";

/**
 * The API's own refusal of a write from a test host (DEC-071, T4): a 409
 * whose `details.code` is `TEST_RELEASE`. The site's actions refuse before
 * they get that far (`test-mode-actions.test.ts`); should one ever reach
 * the API, every answer reads it as a test release, never as a bag that
 * changed, a failed sign-in or "something went wrong" (T6).
 */

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_API_URL: "https://api.test", NODE_ENV: "test" },
}));

/** The envelope `AllExceptionsFilter` sends. */
const REFUSED = {
    error: {
        code: "CONFLICT",
        message: TEST_RELEASE_MESSAGE,
        details: { code: "TEST_RELEASE", reason: "test-release" },
    },
};

describe("a test host's write, refused by the API", () => {
    it("the bag says it is a test release, not that the bag changed", () => {
        expect(problemOf(409, REFUSED)).toEqual({
            ok: false,
            reason: "test-release",
            message: TEST_RELEASE_MESSAGE,
        });
        // Any other 409 is still the bag that changed.
        expect(problemOf(409, {}).reason).toBe("bag-changed");
    });

    it("sign-in and a change of email say signing in is off", () => {
        expect(codeResult(409, REFUSED)).toEqual({
            ok: false,
            reason: "test-release",
        });
        expect(sessionAnswer(409, REFUSED)).toEqual({
            ok: false,
            reason: "test-release",
        });
        expect(emailChangeAnswer(409, REFUSED)).toEqual({
            ok: false,
            reason: "test-release",
        });
    });

    it("the booking page gets the reason it shows its stop for", () => {
        expect(resultOf(409, REFUSED, isBookResult)).toMatchObject({
            ok: false,
            reason: "test-release",
            message: TEST_RELEASE_MESSAGE,
        });
    });

    it("a join and the account's changes pass the test release's words on", () => {
        expect(joinStartAnswer(409, REFUSED)).toEqual({
            ok: false,
            reason: "test-release",
            message: TEST_RELEASE_MESSAGE,
        });
        expect(refusalMessage(409, REFUSED, "fallback")).toBe(
            TEST_RELEASE_MESSAGE,
        );
    });
});

describe("the order page's Pay, refused by the API", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("says it is a test release", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    new Response(JSON.stringify(REFUSED), { status: 409 }),
                ),
            ),
        );
        const { createPaymentIntent } = await import("./checkout");
        expect(
            await createPaymentIntent("ord_1", { idempotencyKey: "k" }),
        ).toEqual({ ok: false, error: TEST_RELEASE_MESSAGE });
    });
});
