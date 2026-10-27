import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SignInApi, SignInOptions, VerifyResult } from "./api";
import { SignInSheet } from "./sign-in-sheet";

vi.mock("./challenge", () => ({
    ChallengeWidget: ({
        onToken,
    }: {
        siteKey: string;
        onToken: (token: string | null) => void;
    }) => (
        <button type="button" onClick={() => onToken("challenge-ok")}>
            I'm not a robot
        </button>
    ),
}));

/**
 * The WhatsApp way on the sign-in sheet (DEC-196): offered only when the
 * options say so and the site wired it, the number step with its challenge,
 * the shared code step, a number that needs an email, and the words.
 */
const OPTIONS: SignInOptions = {
    businessName: "Kavi Dental",
    phone: null,
    challenge: { required: false, siteKey: "site-key" },
    whatsapp: true,
};

const SIGNED_IN: VerifyResult = {
    ok: true,
    customer: { email: "farah@example.in", name: "Farah" },
};

function setup(
    input: {
        options?: Partial<SignInOptions>;
        phoneVerify?: VerifyResult;
        wired?: boolean;
    } = {},
) {
    const api = {
        requestCode: vi
            .fn<SignInApi["requestCode"]>()
            .mockResolvedValue({ ok: true, resendAfterSeconds: 30 }),
        verifyCode: vi
            .fn<SignInApi["verifyCode"]>()
            .mockResolvedValue(SIGNED_IN),
        requestPhoneCode: vi
            .fn<NonNullable<SignInApi["requestPhoneCode"]>>()
            .mockResolvedValue({ ok: true, resendAfterSeconds: 30 }),
        verifyPhoneCode: vi
            .fn<NonNullable<SignInApi["verifyPhoneCode"]>>()
            .mockResolvedValue(input.phoneVerify ?? SIGNED_IN),
    };
    const onSignedIn = vi.fn();
    render(
        <SignInSheet
            open
            onClose={vi.fn()}
            options={{ ...OPTIONS, ...input.options }}
            api={
                input.wired === false
                    ? {
                          requestCode: api.requestCode,
                          verifyCode: api.verifyCode,
                      }
                    : api
            }
            onSignedIn={onSignedIn}
        />,
    );
    return { ...api, onSignedIn };
}

async function press(element: HTMLElement) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

async function type(label: string, value: string) {
    await act(async () => {
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
        await Promise.resolve();
    });
}

const whatsappLink = () =>
    screen.queryByRole("button", { name: "Use WhatsApp instead" });
const whatsappButton = () =>
    screen.getByRole("button", { name: "Use WhatsApp instead" });

async function sendToPhone(phone = "+91 98450 12345") {
    await press(whatsappButton());
    await type("Mobile number", phone);
    await press(screen.getByRole("button", { name: "I'm not a robot" }));
    await press(screen.getByRole("button", { name: "Send code" }));
}

afterEach(cleanup);

describe("SignInSheet: the WhatsApp way", () => {
    it("is offered only when the options say so and the site wired it", () => {
        setup({ options: { whatsapp: false } });
        expect(whatsappLink()).toBeNull();
        cleanup();
        setup({ wired: false });
        expect(whatsappLink()).toBeNull();
        cleanup();
        setup();
        expect(whatsappLink()).not.toBeNull();
    });

    it("asks for a number and the challenge, then sends on WhatsApp", async () => {
        const api = setup();
        await press(whatsappButton());
        expect(
            screen.getByText(
                "No password. We'll send you a one-time code on WhatsApp.",
            ),
        ).toBeTruthy();
        await type("Mobile number", "+91 98450 12345");
        // The challenge comes first, even when the options don't ask it.
        expect(
            screen.getByRole("button", { name: "Send code" }),
        ).toHaveProperty("disabled", true);
        await press(screen.getByRole("button", { name: "I'm not a robot" }));
        await press(screen.getByRole("button", { name: "Send code" }));
        expect(api.requestPhoneCode).toHaveBeenCalledWith(
            "+91 98450 12345",
            "challenge-ok",
        );
        expect(api.requestCode).not.toHaveBeenCalled();
        expect(
            screen.getByText(
                "We sent a 6-digit code on WhatsApp to +91 98450 12345.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Change number" }),
        ).toBeTruthy();
    });

    it("signs in with the code from WhatsApp", async () => {
        const api = setup();
        await sendToPhone();
        await type("Code", "123456");
        expect(api.verifyPhoneCode).toHaveBeenCalledWith(
            "+91 98450 12345",
            "123456",
        );
        expect(api.onSignedIn).toHaveBeenCalledWith({
            email: "farah@example.in",
            name: "Farah",
        });
    });

    it("says a wrong code in WhatsApp's words", async () => {
        setup({ phoneVerify: { ok: false, reason: "invalid" } });
        await sendToPhone();
        await type("Code", "123456");
        expect(screen.getByRole("alert").textContent).toBe(
            "That code isn't right. Check WhatsApp and try again.",
        );
    });

    it("says a number that isn't on WhatsApp, or isn't a mobile", async () => {
        const api = setup();
        api.requestPhoneCode.mockResolvedValueOnce({
            ok: false,
            reason: "not-on-whatsapp",
        });
        await sendToPhone();
        expect(screen.getByRole("alert").textContent).toBe(
            "This number isn't on WhatsApp. Use your email instead.",
        );
        api.requestPhoneCode.mockResolvedValueOnce({
            ok: false,
            reason: "phone",
        });
        await press(screen.getByRole("button", { name: "I'm not a robot" }));
        await press(screen.getByRole("button", { name: "Send code" }));
        expect(screen.getByRole("alert").textContent).toBe(
            "Enter an Indian mobile number, like +91 98450 12345.",
        );
    });

    it("asks a new number for an email, and its code carries the proof", async () => {
        const api = setup({
            phoneVerify: {
                ok: false,
                reason: "email-needed",
                phoneProof: "proof-1",
            },
        });
        await sendToPhone();
        await type("Code", "123456");
        expect(screen.getByRole("heading").textContent).toBe("Add your email");
        expect(whatsappLink()).toBeNull();
        await type("Email", "farah@example.in");
        // Email asks the challenge only when the options say it's likely.
        await press(screen.getByRole("button", { name: "Send code" }));
        expect(api.requestCode).toHaveBeenCalledWith(
            "farah@example.in",
            undefined,
        );
        await type("Code", "654321");
        expect(api.verifyCode).toHaveBeenCalledWith(
            "farah@example.in",
            "654321",
            "proof-1",
        );
        expect(api.onSignedIn).toHaveBeenCalled();
    });

    it("goes back to email", async () => {
        setup();
        await press(whatsappButton());
        await press(screen.getByRole("button", { name: "Use email instead" }));
        expect(screen.getByLabelText("Email")).toBeTruthy();
    });
});
