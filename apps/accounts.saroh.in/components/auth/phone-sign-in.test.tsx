// @vitest-environment jsdom
/**
 * "Use phone instead" on Sign in (DEC-196): the number, then the shared
 * code step in its phone words, and the API's sentence when it refuses.
 * WhatsApp first (owner, 28 Oct); SMS through the widget after the link.
 * Under the stand-in (the fake provider) nothing is sent.
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
import { PhoneSignIn } from "./phone-sign-in";

const api = vi.hoisted(() => ({
    startPhone: vi.fn(),
    signInWithPhone: vi.fn(),
}));
vi.mock("@/lib/phone-sign-in", () => api);
vi.mock("@saroh/site-blocks/challenge", () => ({
    ChallengeWidget: () => null,
}));

beforeEach(() => {
    setUp();
    api.startPhone.mockResolvedValue({
        data: { standIn: { token: "stand-in-1" } },
        error: null,
    });
    api.signInWithPhone.mockResolvedValue({
        data: { signedIn: true },
        error: null,
    });
});
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

const onUseEmail = vi.fn();
function drawIt(channels: { sms?: boolean } = {}) {
    draw(
        <PhoneSignIn
            {...channels}
            turnstileSiteKey={null}
            doneLine="Taking you to Saroh…"
            onDone={vi.fn()}
            onUseEmail={onUseEmail}
        />,
    );
}

const numberBox = () =>
    must(host.querySelector<HTMLInputElement>("#phone"), "phone box");

async function sendFor(digits: string) {
    type(numberBox(), digits);
    await act(async () => {
        must(host.querySelector("form")).requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}

describe("signing in with a phone", () => {
    it("says a phone is a second way in, and offers the email back", async () => {
        drawIt();
        expect(text(host)).toContain("Sign in with your phone");
        expect(text(host)).toContain(
            "No phone on your account yet? Sign in with your email, then add one in Account.",
        );
        await press(button("Use email instead", host));
        expect(onUseEmail).toHaveBeenCalled();
    });

    it("sends on WhatsApp first, and hands the API the typed code", async () => {
        api.startPhone.mockResolvedValue({
            data: { whatsapp: { resendAfterSeconds: 30 } },
            error: null,
        });
        drawIt();
        expect(button("Send code on WhatsApp", host)).toBeTruthy();
        await sendFor("98450 12345");
        expect(api.startPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            channel: "whatsapp",
            purpose: "sign-in",
            turnstileToken: null,
        });
        expect(text(host)).toContain("Check your WhatsApp");
        expect(text(host)).toContain(
            "We sent a 6-digit code on WhatsApp to +91",
        );
        const code = must(
            host.querySelector<HTMLInputElement>("input[name=code]"),
        );
        await act(async () => {
            type(code, "654321");
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(api.signInWithPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            code: "654321",
        });
        expect(text(host)).toContain("You're signed in");
    });

    it("says a failed WhatsApp send in the API's words, and offers SMS", async () => {
        api.startPhone.mockResolvedValue({
            data: null,
            error: {
                code: "WHATSAPP_FAILED",
                status: 422,
                words: "Couldn't send on WhatsApp. Try SMS instead.",
            },
            retryAfter: null,
        });
        drawIt();
        await sendFor("9845012345");
        expect(text(host)).toContain(
            "Couldn't send on WhatsApp. Try SMS instead.",
        );
        expect(button("Get the code by SMS instead", host)).toBeTruthy();
    });

    it("hides the SMS link when the widget isn't set up", () => {
        drawIt({ sms: false });
        expect(text(host)).not.toContain("Get the code by SMS instead");
    });

    it("by SMS: sends for the number as E.164, then shows the code step in phone words", async () => {
        drawIt();
        await press(button("Get the code by SMS instead", host));
        expect(button("Send me a code", host)).toBeTruthy();
        await sendFor("98450 12345");
        expect(api.startPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            channel: "sms",
            purpose: "sign-in",
            turnstileToken: null,
        });
        expect(text(host)).toContain("Check your phone");
        expect(text(host)).toContain("We sent a 6-digit code to +91");
        expect(text(host)).toContain("Change number");
    });

    it("by SMS: hands the token to the API with the number, and signs in only on its yes", async () => {
        drawIt();
        await press(button("Get the code by SMS instead", host));
        await sendFor("9845012345");
        const code = must(
            host.querySelector<HTMLInputElement>("input[name=code]"),
        );
        await act(async () => {
            type(code, "123456");
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(api.signInWithPhone).toHaveBeenCalledWith({
            phone: "+919845012345",
            accessToken: "stand-in-1",
        });
        expect(text(host)).toContain("You're signed in");
    });

    it("shows the API's sentence for a phone with no account", async () => {
        api.signInWithPhone.mockResolvedValue({
            data: null,
            error: {
                code: "NO_ACCOUNT",
                words: "Use your email to sign in, then add this phone in your account.",
            },
            retryAfter: null,
        });
        drawIt();
        await sendFor("9845012345");
        const code = must(
            host.querySelector<HTMLInputElement>("input[name=code]"),
        );
        await act(async () => {
            type(code, "123456");
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(text(host)).toContain(
            "Use your email to sign in, then add this phone in your account.",
        );
        expect(text(host)).not.toContain("You're signed in");
    });

    it("says what is wrong with a number before asking the API", async () => {
        drawIt();
        await sendFor("123");
        expect(api.startPhone).not.toHaveBeenCalled();
        expect(host.querySelector("[role=alert]")).not.toBeNull();
    });

    it("shows a refused start in the API's words", async () => {
        api.startPhone.mockResolvedValue({
            data: null,
            error: {
                code: "TOO_MANY_REQUESTS",
                words: "Too many tries for now. Try again in 20 seconds.",
            },
            retryAfter: 20,
        });
        drawIt();
        await sendFor("9845012345");
        expect(text(host)).toContain(
            "Too many tries for now. Try again in 20 seconds.",
        );
        expect(text(host)).toContain("Sign in with your phone");
    });
});
