import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
    CodeRequestResult,
    SignInApi,
    SignInOptions,
    VerifyResult,
} from "./api";
import { callLine, codeDigits, retryText } from "./api";
import { CODE_STEP_MS, parseSignInDraft } from "./sign-in-draft";
import { resendDelayMs, resendWait, SignInSheet } from "./sign-in-sheet";

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
 * The sign-in sheet in jsdom (round-2 plan A, A3): the two steps, every
 * answer the site's server can give, and the sheet's keyboard rules. The
 * look is the browser pass's; this pins the words and the calls.
 */
const OPTIONS: SignInOptions = {
    businessName: "Kavi Dental",
    phone: null,
    challenge: { required: false, siteKey: null },
};

function setup(
    input: {
        options?: Partial<SignInOptions>;
        code?: CodeRequestResult;
        verify?: VerifyResult;
        purpose?: "book" | "sign-in" | "change-email";
    } = {},
) {
    const requestCode = vi
        .fn<SignInApi["requestCode"]>()
        .mockResolvedValue(input.code ?? { ok: true, resendAfterSeconds: 30 });
    const verifyCode = vi.fn<SignInApi["verifyCode"]>().mockResolvedValue(
        input.verify ?? {
            ok: true,
            customer: { email: "farah@example.in", name: "Farah" },
        },
    );
    const api: SignInApi = { requestCode, verifyCode };
    const onClose = vi.fn();
    const onSignedIn = vi.fn();
    render(
        <SignInSheet
            open
            onClose={onClose}
            options={{ ...OPTIONS, ...input.options }}
            api={api}
            purpose={input.purpose}
            onSignedIn={onSignedIn}
        />,
    );
    return { requestCode, verifyCode, onClose, onSignedIn };
}

const emailField = () => screen.getByLabelText("Email");
const sendButton = () => screen.getByRole("button", { name: "Send code" });

/** Click, and let the action it starts settle. */
async function press(element: HTMLElement) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

async function askForCode(email = "farah@example.in") {
    fireEvent.change(emailField(), { target: { value: email } });
    await press(sendButton());
}

describe("SignInSheet: the email step", () => {
    it("asks for an email, says it creates an account, and sends the code", async () => {
        const { requestCode } = setup();
        expect(
            screen.getByRole("dialog", { name: "Sign in to Kavi Dental" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("No password. We'll send you a one-time code."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("New here? The same code creates your account."),
        ).toBeInTheDocument();
        expect(emailField()).toHaveAttribute("type", "email");
        expect(emailField()).toHaveAttribute("autocomplete", "email");
        // Nothing to send until it looks like an email.
        expect(sendButton()).toBeDisabled();
        fireEvent.change(emailField(), { target: { value: "farah@" } });
        expect(sendButton()).toBeDisabled();

        await askForCode(" farah@example.in ");
        expect(requestCode).toHaveBeenCalledWith("farah@example.in", undefined);
        expect(
            screen.getByRole("heading", { name: "Enter the code" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("We sent a 6-digit code to farah@example.in."),
        ).toBeInTheDocument();
    });

    it("leads with the last step when it's asked for at booking", () => {
        setup({ purpose: "book" });
        expect(
            screen.getByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeInTheDocument();
    });

    it("says a code couldn't be sent, and gives the business's phone when there is one", async () => {
        setup({
            options: { phone: "+91 80 4000 1234" },
            code: { ok: false, reason: "unavailable" },
        });
        await askForCode();
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent(
            "We couldn't send your code — try again in a few minutes",
        );
        const call = screen.getByRole("link", {
            name: "Or call Kavi Dental on +91 80 4000 1234",
        });
        expect(call).toHaveAttribute("href", "tel:+918040001234");
        // Still on the email step: nothing else happens.
        expect(emailField()).toBeInTheDocument();
    });

    it("says only the sentence when the business has no phone", async () => {
        setup({ code: { ok: false, reason: "unavailable" } });
        await askForCode();
        expect(screen.getByRole("alert")).toHaveTextContent(
            /^We couldn't send your code — try again in a few minutes$/,
        );
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("says when the visitor can try again", async () => {
        setup({ code: { ok: false, reason: "limit", retryAfterSeconds: 700 } });
        await askForCode();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Try again in 12 minutes.",
        );
    });

    it("shows the challenge when asked, and sends its token with the next request", async () => {
        const { requestCode } = setup({
            code: { ok: false, reason: "challenge", siteKey: "0x4AAA" },
        });
        await askForCode();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Confirm you're not a robot, then send the code again.",
        );
        // Waits for the challenge before it can ask again.
        expect(sendButton()).toBeDisabled();
        requestCode.mockResolvedValue({
            ok: true,
            resendAfterSeconds: 30,
        });
        fireEvent.click(
            screen.getByRole("button", { name: "I'm not a robot" }),
        );
        await press(sendButton());
        expect(requestCode).toHaveBeenLastCalledWith(
            "farah@example.in",
            "challenge-ok",
        );
    });

    it("shows the challenge up front when the options say it's needed", () => {
        setup({
            options: { challenge: { required: true, siteKey: "0x4AAA" } },
        });
        expect(
            screen.getByRole("button", { name: "I'm not a robot" }),
        ).toBeInTheDocument();
    });

    it("keeps what was typed and shows the challenge when the options land late (#838)", () => {
        const api: SignInApi = {
            requestCode: vi.fn<SignInApi["requestCode"]>(),
            verifyCode: vi.fn<SignInApi["verifyCode"]>(),
        };
        const sheet = (options: SignInOptions) => (
            <SignInSheet
                open
                onClose={vi.fn()}
                options={options}
                api={api}
                onSignedIn={vi.fn()}
            />
        );
        const { rerender } = render(sheet(OPTIONS));
        fireEvent.change(emailField(), {
            target: { value: "farah@example.in" },
        });
        rerender(
            sheet({
                ...OPTIONS,
                challenge: { required: true, siteKey: "0x4AAA" },
            }),
        );
        expect(emailField()).toHaveValue("farah@example.in");
        expect(
            screen.getByRole("button", { name: "I'm not a robot" }),
        ).toBeInTheDocument();
        expect(sendButton()).toBeDisabled();
    });
});

describe("SignInSheet: the code step", () => {
    async function toCode(verify?: VerifyResult) {
        const t = setup({ verify });
        await askForCode();
        return t;
    }

    const codeField = () => screen.getByLabelText("Code");
    const signIn = () => screen.getByRole("button", { name: "Sign in" });

    /** Type a code, and let the check its sixth digit starts settle. */
    async function typeCode(value: string) {
        await act(async () => {
            fireEvent.change(codeField(), { target: { value } });
            await Promise.resolve();
        });
    }

    it("checks the code when its sixth digit is typed, then hands over the customer and closes", async () => {
        const { verifyCode, onSignedIn, onClose } = await toCode();
        expect(codeField()).toHaveAttribute("inputmode", "numeric");
        expect(codeField()).toHaveAttribute("autocomplete", "one-time-code");
        expect(codeField()).toHaveAttribute("maxlength", "6");
        expect(signIn()).toBeDisabled();
        await typeCode("12 34-5");
        expect(signIn()).toBeDisabled();
        expect(verifyCode).not.toHaveBeenCalled();
        // Pasted with more than it needs: the first six digits, sent at once.
        await typeCode("123456789");
        expect(verifyCode).toHaveBeenCalledTimes(1);
        expect(verifyCode).toHaveBeenCalledWith("farah@example.in", "123456");
        expect(onSignedIn).toHaveBeenCalledWith({
            email: "farah@example.in",
            name: "Farah",
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("keeps the button for a refused code, and never checks one code twice at once", async () => {
        let answer: (result: VerifyResult) => void = () => undefined;
        const t = await toCode();
        t.verifyCode.mockImplementation(
            () => new Promise<VerifyResult>((resolve) => (answer = resolve)),
        );
        await typeCode("000000");
        // The check is under way: a press of the button starts no second.
        expect(
            screen.getByRole("button", { name: "Checking…" }),
        ).toBeDisabled();
        // Enter in the field, as a keyboard's Go sends it.
        const form = codeField().closest("form");
        expect(form).not.toBeNull();
        if (form) fireEvent.submit(form);
        expect(t.verifyCode).toHaveBeenCalledTimes(1);
        await act(async () => {
            answer({ ok: false, reason: "invalid" });
            await Promise.resolve();
        });
        // Refused: the same six digits can be sent again with the button.
        expect(signIn()).toBeEnabled();
        await press(signIn());
        expect(t.verifyCode).toHaveBeenCalledTimes(2);
    });

    async function tryCode(verify: VerifyResult) {
        const t = await toCode(verify);
        await typeCode("000000");
        return t;
    }

    it("says a wrong code is wrong, and stays open", async () => {
        const { onSignedIn } = await tryCode({ ok: false, reason: "invalid" });
        expect(screen.getByRole("alert")).toHaveTextContent(
            "That code isn't right. Check the email and try again.",
        );
        expect(onSignedIn).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Send a new code" })).toBe(
            null,
        );
    });

    it("offers a new code when this one has expired", async () => {
        const { requestCode } = await tryCode({ ok: false, reason: "expired" });
        expect(screen.getByRole("alert")).toHaveTextContent(
            "That code has expired. Send a new one.",
        );
        await press(screen.getByRole("button", { name: "Send a new code" }));
        expect(requestCode).toHaveBeenCalledTimes(2);
    });

    it("names the email a merge moved this one to", async () => {
        await tryCode({
            ok: false,
            reason: "merged",
            signsInAs: "f•••@example.in",
        });
        expect(screen.getByRole("alert")).toHaveTextContent(
            "This email now signs in as f•••@example.in. Use that email instead.",
        );
    });

    it("offers Resend once the API's wait has passed (UX-075)", async () => {
        vi.useFakeTimers({
            shouldAdvanceTime: false,
            toFake: ["Date", "setInterval", "clearInterval"],
        });
        try {
            const { requestCode } = await toCode();
            const wait = screen.getByRole("button", {
                name: /Resend code in \d+s/,
            });
            expect(wait).toBeDisabled();
            act(() => {
                vi.advanceTimersByTime(31_000);
            });
            const resend = screen.getByRole("button", { name: "Resend code" });
            expect(resend).toBeEnabled();
            await press(resend);
            expect(requestCode).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("goes back to change the email", async () => {
        await toCode();
        fireEvent.click(screen.getByRole("button", { name: "Change email" }));
        expect(emailField()).toHaveValue("farah@example.in");
    });

    it("says so when the site's server can't be reached", async () => {
        const t = await toCode();
        t.verifyCode.mockRejectedValue(new Error("offline"));
        await typeCode("123456");
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't reach the business. Try again in a moment.",
        );
    });
});

describe("SignInSheet: focus and keys", () => {
    it("takes focus, keeps Tab inside, closes on Escape", () => {
        const { onClose } = setup();
        expect(emailField()).toHaveFocus();
        const close = screen.getByRole("button", { name: "Close" });
        const dialog = screen.getByRole("dialog");
        // With an email typed, Send code is enabled and is the last stop.
        fireEvent.change(emailField(), {
            target: { value: "farah@example.in" },
        });
        sendButton().focus();
        fireEvent.keyDown(dialog, { key: "Tab" });
        expect(close).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
        expect(sendButton()).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });

    it("closes from the backdrop and the close button", () => {
        const { onClose } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalledTimes(1);
        const backdrop = screen.getByRole("dialog").previousElementSibling;
        if (!backdrop) throw new Error("no backdrop");
        expect(backdrop).toHaveAttribute("aria-hidden", "true");
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("gives focus back to whatever opened it", async () => {
        function Host() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>
                        Continue to sign in
                    </button>
                    <SignInSheet
                        open={open}
                        onClose={() => setOpen(false)}
                        options={OPTIONS}
                        api={{
                            requestCode: vi.fn(),
                            verifyCode: vi.fn(),
                        }}
                        onSignedIn={vi.fn()}
                    />
                </>
            );
        }
        render(<Host />);
        const opener = screen.getByRole("button", {
            name: "Continue to sign in",
        });
        opener.focus();
        fireEvent.click(opener);
        expect(emailField()).toHaveFocus();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await waitFor(() => expect(opener).toHaveFocus());
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("draws nothing while closed", () => {
        render(
            <SignInSheet
                open={false}
                onClose={vi.fn()}
                options={OPTIONS}
                api={{ requestCode: vi.fn(), verifyCode: vi.fn() }}
                onSignedIn={vi.fn()}
            />,
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

describe("the resend wait", () => {
    it("counts whole seconds down to zero", () => {
        expect(resendWait(null, 5_000)).toBe(0);
        expect(resendWait(30_000, 0)).toBe(30);
        expect(resendWait(30_000, 29_100)).toBe(1);
        expect(resendWait(30_000, 31_000)).toBe(0);
    });

    it("takes the API's wait, else its own limit's", () => {
        expect(resendDelayMs(60)).toBe(60_000);
        expect(resendDelayMs(undefined)).toBe(30_000);
        expect(resendDelayMs(0)).toBe(30_000);
    });
});

describe("the sheet's words", () => {
    it("says when to try again, in seconds or minutes", () => {
        expect(retryText(1)).toBe("Try again in 1 second");
        expect(retryText(40)).toBe("Try again in 40 seconds");
        expect(retryText(60)).toBe("Try again in 1 minute");
        expect(retryText(700)).toBe("Try again in 12 minutes");
    });

    it("gives the call line only with a phone", () => {
        expect(callLine("Kavi Dental", "+91 80 4000 1234")).toBe(
            "Or call Kavi Dental on +91 80 4000 1234",
        );
        expect(callLine("Kavi Dental", null)).toBe(null);
        expect(callLine("Kavi Dental", "  ")).toBe(null);
    });

    it("keeps six digits of whatever was pasted", () => {
        expect(codeDigits("Your code: 123 456")).toBe("123456");
        expect(codeDigits("1234567")).toBe("123456");
    });
});

// ── Kept for the visit ────────────────────────────────────────────────────

describe("SignInSheet: through a reload (the code is read in another app)", () => {
    const codeField = () => screen.getByLabelText("Code");

    it("opens on Enter the code with the email still there, and keeps no code", async () => {
        setup({ purpose: "book" });
        await askForCode();
        fireEvent.change(codeField(), { target: { value: "12345" } });
        const kept = window.sessionStorage.getItem("saroh.sign-in") ?? "";
        expect(JSON.parse(kept)).toMatchObject({
            email: "farah@example.in",
            step: "code",
        });
        expect(kept).not.toContain("12345");
        expect(document.cookie).toBe("");
        expect(window.localStorage.length).toBe(0);

        // The page loads again: a new sheet, the same tab.
        cleanup();
        const { requestCode, verifyCode, onSignedIn } = setup({
            purpose: "book",
        });
        expect(
            screen.getByRole("dialog", { name: "Enter the code" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("We sent a 6-digit code to farah@example.in."),
        ).toBeInTheDocument();
        expect(codeField()).toHaveValue("");
        // No second code is sent for it.
        expect(requestCode).not.toHaveBeenCalled();
        await act(async () => {
            fireEvent.change(codeField(), { target: { value: "123456" } });
            await Promise.resolve();
        });
        expect(verifyCode).toHaveBeenCalledWith("farah@example.in", "123456");
        expect(onSignedIn).toHaveBeenCalled();
    });

    it("asks for a new code, email still filled in, once the old one has likely run out", () => {
        window.sessionStorage.setItem(
            "saroh.sign-in",
            JSON.stringify({
                email: "farah@example.in",
                step: "code",
                sentAt: Date.now() - CODE_STEP_MS - 1_000,
            }),
        );
        setup();
        expect(emailField()).toHaveValue("farah@example.in");
        expect(sendButton()).toBeEnabled();
        // Opening it again doesn't make the old code new.
        cleanup();
        setup();
        expect(emailField()).toHaveValue("farah@example.in");
    });

    it("keeps an email typed before the code was asked for", () => {
        setup();
        fireEvent.change(emailField(), {
            target: { value: "farah@example.in" },
        });
        cleanup();
        setup();
        expect(emailField()).toHaveValue("farah@example.in");
    });

    it("forgets it once signed in", async () => {
        setup();
        await askForCode();
        expect(window.sessionStorage.getItem("saroh.sign-in")).not.toBe(null);
        await act(async () => {
            fireEvent.change(codeField(), { target: { value: "123456" } });
            await Promise.resolve();
        });
        expect(window.sessionStorage.getItem("saroh.sign-in")).toBe(null);
        cleanup();
        setup();
        expect(emailField()).toHaveValue("");
    });

    it("goes back to the email step when Change email is pressed, and keeps that", async () => {
        setup();
        await askForCode();
        fireEvent.click(screen.getByRole("button", { name: "Change email" }));
        cleanup();
        setup();
        expect(emailField()).toHaveValue("farah@example.in");
    });

    it("keeps nothing of a change of sign-in email", async () => {
        setup({ purpose: "change-email" });
        fireEvent.change(screen.getByLabelText("New email"), {
            target: { value: "new@example.in" },
        });
        await press(sendButton());
        expect(window.sessionStorage.length).toBe(0);
    });
});

describe("parseSignInDraft", () => {
    const at = 1_800_000_000_000;
    const kept = (over: object = {}) =>
        JSON.stringify({
            email: "farah@example.in",
            step: "code",
            sentAt: at,
            ...over,
        });

    it("reads nothing kept, and anything strange, as nothing", () => {
        const none = { email: "", step: "email", sentAt: null };
        expect(parseSignInDraft(null, at)).toEqual(none);
        expect(parseSignInDraft("not json", at)).toEqual(none);
        expect(parseSignInDraft("[]", at)).toEqual(none);
        expect(parseSignInDraft(kept({ email: 7 }), at)).toEqual(none);
        expect(parseSignInDraft(kept({ email: "a".repeat(300) }), at)).toEqual(
            none,
        );
    });

    it("restores the code step while the code is likely still good", () => {
        expect(parseSignInDraft(kept(), at + 60_000)).toEqual({
            email: "farah@example.in",
            step: "code",
            sentAt: at,
        });
    });

    it("comes back as the email step, email kept, once the code has likely run out", () => {
        const stale = {
            email: "farah@example.in",
            step: "email",
            sentAt: null,
        };
        expect(parseSignInDraft(kept(), at + CODE_STEP_MS + 1)).toEqual(stale);
        // A clock that went backwards, or no time at all, is not trusted.
        expect(parseSignInDraft(kept(), at - 1)).toEqual(stale);
        expect(parseSignInDraft(kept({ sentAt: "soon" }), at)).toEqual(stale);
    });

    it("never hands back a code, whatever was stored beside it", () => {
        expect(parseSignInDraft(kept({ code: "123456" }), at)).toEqual({
            email: "farah@example.in",
            step: "code",
            sentAt: at,
        });
    });
});

describe("SignInSheet: on a phone", () => {
    it("sets both fields at 16px or more, so iOS doesn't zoom on focus", async () => {
        setup();
        expect(emailField()).toHaveAttribute("autocomplete", "email");
        expect(emailField().className).toMatch(/text-\[17px\]/);
        await askForCode();
        expect(screen.getByLabelText("Code").className).toMatch(
            /text-\[17px\]/,
        );
    });
});
