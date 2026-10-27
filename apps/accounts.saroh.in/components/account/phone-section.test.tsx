// @vitest-environment jsdom
/**
 * Account › Phone (DEC-196): the row with and without a phone, adding one
 * with a code the API checks, and removing it.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    draw,
    host,
    must,
    press,
    setUp,
    tearDown,
    text,
    type,
} from "../billing-profiles/test-kit";
import { PHONE_WORDS, PhoneSection } from "./phone-section";

const api = vi.hoisted(() => ({
    startPhone: vi.fn(),
    addPhone: vi.fn(),
    removePhone: vi.fn(),
    phoneOptions: vi.fn(),
}));
vi.mock("@/lib/phone-sign-in", () => api);
vi.mock("@saroh/site-blocks/challenge", () => ({
    ChallengeWidget: () => null,
}));

beforeEach(() => {
    setUp();
    api.startPhone.mockResolvedValue({
        data: { standIn: { token: "stand-in-2" } },
        error: null,
    });
    api.addPhone.mockResolvedValue({
        data: {
            phoneE164: "+919845012345",
            phoneVerifiedAt: "2026-10-27T06:00:00.000Z",
        },
        error: null,
    });
    api.removePhone.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

function drawIt(phoneE164: string | null) {
    draw(
        <PhoneSection
            phoneE164={phoneE164}
            phoneVerifiedAt={phoneE164 ? "2026-10-27T06:00:00.000Z" : null}
            turnstileSiteKey={null}
        />,
    );
}

async function submitForm() {
    await act(async () => {
        must(host.querySelector("form")).requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}

describe("the Phone row", () => {
    it("with no phone: says so and offers Add phone", () => {
        drawIt(null);
        expect(text(host)).toContain(PHONE_WORDS.none);
        expect(button(PHONE_WORDS.add, host)).toBeTruthy();
        expect(text(host)).not.toContain(PHONE_WORDS.remove);
    });

    it("with a verified phone: shows it, its verified day, Change and Remove", () => {
        drawIt("+919845012345");
        expect(text(host)).toContain("+91 98450 12345");
        expect(text(host)).toContain("Verified 27 Oct 2026");
        expect(button(PHONE_WORDS.change, host)).toBeTruthy();
        expect(button(PHONE_WORDS.remove, host)).toBeTruthy();
    });

    it("adds a phone only after the API took the code", async () => {
        drawIt(null);
        await press(button(PHONE_WORDS.add, host));
        type(
            must(host.querySelector<HTMLInputElement>("#new-phone")),
            "9845012345",
        );
        await submitForm();
        expect(api.startPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            turnstileToken: null,
        });
        expect(text(host)).toContain("We sent a 6-digit code to +91");
        type(
            must(host.querySelector<HTMLInputElement>("#phone-code")),
            "123456",
        );
        await submitForm();
        expect(api.addPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            accessToken: "stand-in-2",
        });
        expect(text(host)).toContain(PHONE_WORDS.added);
        expect(text(host)).toContain("+91 98450 12345");
    });

    it("keeps the old phone and says why when the API refuses the new one", async () => {
        api.addPhone.mockResolvedValue({
            data: null,
            error: {
                code: "PHONE_TAKEN",
                words: "That phone is already on another Saroh account. Use a different one.",
            },
            retryAfter: null,
        });
        drawIt("+919800000001");
        await press(button(PHONE_WORDS.change, host));
        type(
            must(host.querySelector<HTMLInputElement>("#new-phone")),
            "9845012345",
        );
        await submitForm();
        type(
            must(host.querySelector<HTMLInputElement>("#phone-code")),
            "123456",
        );
        await submitForm();
        expect(text(host)).toContain(
            "That phone is already on another Saroh account. Use a different one.",
        );
        // Back on the number, to pick another.
        expect(host.querySelector("#new-phone")).not.toBeNull();
        await press(button("Cancel", host));
        expect(text(host)).toContain("+91 98000 00001");
    });

    it("removes the phone after asking in words", async () => {
        drawIt("+919845012345");
        await press(button(PHONE_WORDS.remove, host));
        expect(text(host)).toContain(PHONE_WORDS.removeAsk);
        await press(button(PHONE_WORDS.remove, host));
        expect(api.removePhone).toHaveBeenCalled();
        expect(text(host)).toContain(PHONE_WORDS.removed);
        expect(text(host)).toContain(PHONE_WORDS.none);
    });
});
