// @vitest-environment jsdom
/**
 * The phone flow (DEC-196, DEC-199): Account › Phone's sheet and the add
 * phone step. India only, checked before anything is sent; a code the API
 * checks; the number refused when another account has it.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOT_A_MOBILE } from "@/lib/indian-phone";
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

import { PHONE_WORDS, PhoneChange } from "./phone-section";

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
        data: { whatsapp: { resendAfterSeconds: 30 } },
        error: null,
    });
    api.addPhone.mockResolvedValue({
        data: {
            phoneE164: "+919845012345",
            phoneVerifiedAt: "2026-10-27T06:00:00.000Z",
        },
        error: null,
    });
});
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

const saved = vi.fn();
function drawIt() {
    draw(
        <PhoneChange
            turnstileSiteKey={null}
            onSaved={saved}
            onCancel={() => undefined}
        />,
    );
}
const phoneBox = () =>
    must(host.querySelector<HTMLInputElement>("input[type=tel]"));
const codeBox = () =>
    must(
        host.querySelector<HTMLInputElement>(
            "input[autocomplete=one-time-code]",
        ),
    );

async function submitForm() {
    await act(async () => {
        must(host.querySelector("form")).requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}

describe("the phone flow", () => {
    it("is India only: a fixed +91, no country picker", () => {
        drawIt();
        expect(text(host)).toContain("+91");
        expect(host.querySelector("[data-slot=phone-country]")?.tagName).toBe(
            "SPAN",
        );
        expect(text(host)).toContain(PHONE_WORDS.hint);
    });

    it("refuses a number that isn't an Indian mobile before anything is sent, under the field", async () => {
        drawIt();
        type(phoneBox(), "22 4567 8901");
        await submitForm();
        expect(api.startPhone).not.toHaveBeenCalled();
        const box = phoneBox();
        expect(box.getAttribute("aria-invalid")).toBe("true");
        const said = (box.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent)
            .join(" ");
        expect(said).toContain(NOT_A_MOBILE);
    });

    it("adds a phone with a WhatsApp code, only after the API took it", async () => {
        drawIt();
        type(phoneBox(), "9845012345");
        await submitForm();
        expect(api.startPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            channel: "whatsapp",
            purpose: "add",
            turnstileToken: null,
        });
        expect(text(host)).toContain(
            "We sent a 6-digit code on WhatsApp to +91 98450 12345",
        );
        type(codeBox(), "123456");
        await submitForm();
        expect(api.addPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            code: "123456",
        });
        expect(saved).toHaveBeenCalledWith(
            expect.objectContaining({ phoneE164: "+919845012345" }),
        );
    });

    it("gets the code by SMS through the widget after the link", async () => {
        api.startPhone.mockResolvedValue({
            data: { standIn: { token: "stand-in-2" } },
            error: null,
        });
        drawIt();
        await press(button("Get the code by SMS instead", host));
        type(phoneBox(), "9845012345");
        await submitForm();
        expect(api.startPhone).toHaveBeenCalledWith(
            expect.objectContaining({ channel: "sms", purpose: "add" }),
        );
        type(codeBox(), "123456");
        await submitForm();
        expect(api.addPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            accessToken: "stand-in-2",
        });
    });

    it("goes back to the number, saying why, when another account has it", async () => {
        api.addPhone.mockResolvedValue({
            data: null,
            error: {
                code: "PHONE_TAKEN",
                words: "That phone is already on another Saroh account. Use a different one.",
            },
            retryAfter: null,
        });
        drawIt();
        type(phoneBox(), "9845012345");
        await submitForm();
        type(codeBox(), "123456");
        await submitForm();
        expect(text(host)).toContain(
            "That phone is already on another Saroh account. Use a different one.",
        );
        expect(host.querySelector("input[type=tel]")).not.toBeNull();
    });

    it("can change the number from the code step", async () => {
        drawIt();
        type(phoneBox(), "9845012345");
        await submitForm();
        await press(button(PHONE_WORDS.changeNumber, host));
        expect(host.querySelector("input[type=tel]")).not.toBeNull();
    });
});
