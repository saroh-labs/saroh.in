// @vitest-environment jsdom
/**
 * "Add your phone" (DEC-196): the step a required phone puts after sign-in.
 * It saves through the same code flow as Account › Phone, has no Cancel,
 * always offers Sign out, and lets the person go on when codes can't be sent.
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
import { ADD_PHONE_WORDS, AddPhoneStep } from "./add-phone-step";

const api = vi.hoisted(() => ({
    startPhone: vi.fn(),
    addPhone: vi.fn(),
    removePhone: vi.fn(),
    phoneOptions: vi.fn(),
}));
vi.mock("@/lib/phone-sign-in", () => api);
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth.client", () => ({ authClient: auth }));
vi.mock("@saroh/site-blocks/challenge", () => ({
    ChallengeWidget: () => null,
}));

const TO = "https://app.saroh.localhost/";
let href = "";

beforeEach(() => {
    setUp();
    href = "";
    vi.spyOn(window, "location", "get").mockReturnValue({
        set href(v: string) {
            href = v;
        },
        get href() {
            return href;
        },
    } as Location);
    api.startPhone.mockResolvedValue({
        data: { standIn: { token: "stand-in-1" } },
        error: null,
    });
    api.addPhone.mockResolvedValue({
        data: {
            phoneE164: "+919845012345",
            phoneVerifiedAt: "2026-10-27T06:00:00.000Z",
        },
        error: null,
    });
    auth.signOut.mockResolvedValue({});
});
afterEach(() => {
    tearDown();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

async function submitForm() {
    await act(async () => {
        must(host.querySelector("form")).requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}

function drawIt() {
    draw(<AddPhoneStep destination={TO} turnstileSiteKey={null} />);
}

describe("Add your phone", () => {
    it("asks for a phone with no Cancel and no way to skip, and offers Sign out", () => {
        drawIt();
        expect(text(host)).toContain(ADD_PHONE_WORDS.title);
        expect(host.querySelector("#new-phone")).not.toBeNull();
        expect(text(host)).not.toContain("Cancel");
        expect(text(host)).not.toContain(ADD_PHONE_WORDS.goOn);
        expect(button(ADD_PHONE_WORDS.signOut, host)).toBeTruthy();
    });

    it("goes on to where sign-in was going once the API saved the phone", async () => {
        drawIt();
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
        expect(api.addPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            accessToken: "stand-in-1",
        });
        expect(href).toBe(TO);
    });

    it("stays when the code is wrong", async () => {
        api.addPhone.mockResolvedValue({
            data: null,
            error: { code: "NOT_VERIFIED", status: 400 },
            retryAfter: null,
        });
        drawIt();
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
        expect(href).toBe("");
        expect(text(host)).not.toContain(ADD_PHONE_WORDS.goOn);
    });

    it("lets them go on when codes can't be sent", async () => {
        api.startPhone.mockResolvedValue({
            data: null,
            error: { code: "UNAVAILABLE", status: 503 },
            retryAfter: null,
        });
        drawIt();
        type(
            must(host.querySelector<HTMLInputElement>("#new-phone")),
            "9845012345",
        );
        await submitForm();
        expect(text(host)).toContain(ADD_PHONE_WORDS.downTitle);
        await press(button(ADD_PHONE_WORDS.goOn, host));
        expect(href).toBe(TO);
    });

    it("signs out", async () => {
        drawIt();
        await press(button(ADD_PHONE_WORDS.signOut, host));
        expect(auth.signOut).toHaveBeenCalled();
        expect(href).toBe("/login");
    });
});
