// @vitest-environment jsdom
/**
 * An address past its hourly code cap (owner, 30 Oct): the API answers
 * `CHALLENGE` rather than refusing, the screen shows the bot check, and the
 * code (or reset link) is asked for again with its token. Sign in, the code
 * step's Resend and Forgot password; sign-up is the same few lines as sign
 * in.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CodeClient } from "@/lib/sign-in-code";

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

import { CodeStep } from "./code-step";
import { ForgotPasswordForm } from "./forgot-password-form";
import { LoginForm } from "./login-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/phone-sign-in", async (original) => ({
    ...(await original<object>()),
    phoneOptions: () =>
        Promise.resolve({
            available: false,
            whatsapp: false,
            sms: false,
            turnstileSiteKey: "site-key",
            required: false,
        }),
}));
// The widget, as a button that hands back a token when pressed.
vi.mock("@saroh/site-blocks/challenge", () => ({
    ChallengeWidget: ({ onToken }: { onToken: (t: string) => void }) => (
        <button type="button" onClick={() => onToken("token-1")}>
            Pass the check
        </button>
    ),
}));
const auth = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/lib/auth.client", () => ({ authClient: auth }));

const CHALLENGE = { error: { code: "CHALLENGE", status: 400 } };
const SAID = "Confirm you're not a robot below, then we send it.";

function client(): CodeClient & { send: ReturnType<typeof vi.fn> } {
    return {
        send: vi
            .fn()
            .mockResolvedValueOnce(CHALLENGE)
            .mockResolvedValue({ error: null }),
        check: vi.fn().mockResolvedValue({ error: null }),
    };
}

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
    });
}

beforeEach(setUp);
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

describe("a code past the address's cap needs the bot check", () => {
    it("sign in: shows the check, then sends again with its token", async () => {
        const c = client();
        draw(<LoginForm client={c} />);
        type(
            must(host.querySelector<HTMLInputElement>("#email")),
            "asha@example.com",
        );
        await act(async () => {
            must(host.querySelector("form")).requestSubmit();
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(text(host)).toContain(SAID);
        expect(c.send).toHaveBeenCalledTimes(1);

        await press(button("Pass the check", host));
        await settle();
        expect(c.send).toHaveBeenLastCalledWith({
            email: "asha@example.com",
            kind: "sign-in",
            turnstileToken: "token-1",
        });
        expect(text(host)).toContain("Check your email");
        expect(text(host)).not.toContain("Pass the check");
    });

    it("the code step's Resend: the same, and the new code is said", async () => {
        const c = client();
        draw(
            <CodeStep
                email="asha@example.com"
                doneLine="Taking you to Saroh…"
                resendAfterSeconds={0}
                onChangeEmail={vi.fn()}
                onDone={vi.fn()}
                client={c}
            />,
        );
        await press(button("Resend code", host));
        expect(text(host)).toContain(SAID);
        await press(button("Pass the check", host));
        await settle();
        expect(c.send).toHaveBeenLastCalledWith(
            expect.objectContaining({ turnstileToken: "token-1" }),
        );
        expect(text(host)).toContain("We sent a new code to asha@example.com.");
    });

    it("forgot password: the link is asked for again with the token in the header", async () => {
        auth.requestPasswordReset
            .mockResolvedValueOnce(CHALLENGE)
            .mockResolvedValue({ data: { status: true }, error: null });
        draw(<ForgotPasswordForm />);
        type(
            must(host.querySelector<HTMLInputElement>("#email")),
            "asha@example.com",
        );
        await act(async () => {
            must(host.querySelector("form")).requestSubmit();
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(text(host)).toContain(SAID);
        expect(push).not.toHaveBeenCalled();

        await press(button("Pass the check", host));
        await settle();
        expect(auth.requestPasswordReset).toHaveBeenLastCalledWith(
            expect.objectContaining({
                email: "asha@example.com",
                fetchOptions: { headers: { "x-turnstile-token": "token-1" } },
            }),
        );
        expect(push).toHaveBeenCalledWith(
            "/forgot-password/sent?email=asha%40example.com",
        );
    });
});
