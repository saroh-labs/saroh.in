import { describe, expect, it } from "vitest";

import { phoneStepVerdict, throughPhoneStep } from "./phone-step";

const ACCOUNTS = "https://accounts.saroh.localhost";
const base = {
    required: true,
    available: true,
    phoneVerified: false,
    staff: false,
};

describe("throughPhoneStep", () => {
    it("off: the destination is untouched", () => {
        expect(
            throughPhoneStep("https://app.saroh.localhost", ACCOUNTS, false),
        ).toBe("https://app.saroh.localhost");
        expect(throughPhoneStep("/account", ACCOUNTS, false)).toBe("/account");
    });

    it("on: goes by the step, carrying where it was going", () => {
        const via = new URL(
            throughPhoneStep(
                "https://app.saroh.localhost/onboarding?plan=grow",
                ACCOUNTS,
                true,
            ),
        );
        expect(via.origin).toBe(ACCOUNTS);
        expect(via.pathname).toBe("/add-phone");
        expect(via.searchParams.get("to")).toBe(
            "https://app.saroh.localhost/onboarding?plan=grow",
        );
    });
});

describe("phoneStepVerdict", () => {
    it("off changes nothing", () => {
        expect(phoneStepVerdict({ ...base, required: false })).toBe("pass");
    });

    it("on with no verified phone asks for one", () => {
        expect(phoneStepVerdict(base)).toBe("ask");
    });

    it("on with a verified phone passes", () => {
        expect(phoneStepVerdict({ ...base, phoneVerified: true })).toBe("pass");
    });

    it("on while codes can't be sent lets them through", () => {
        expect(phoneStepVerdict({ ...base, available: false })).toBe(
            "pass-unavailable",
        );
    });

    it("never holds Saroh's staff", () => {
        expect(phoneStepVerdict({ ...base, staff: true })).toBe("pass");
    });
});
