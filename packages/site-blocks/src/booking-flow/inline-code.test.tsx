import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    CodeRequestResult,
    SignInApi,
    VerifyResult,
} from "../account/api";
import {
    CODE_LEAD,
    codeSentText,
    InlineCode,
    waitClock,
    WRONG_CODE,
} from "./inline-code";

/**
 * The code inside Your details (DEC-172, R9, KD9, plan U10): every email
 * gets one with the same words, sent when the field is left, checked at
 * the sixth digit; a wrong code is said in words with no shake; another
 * waits out the API's limit; Change starts again.
 */

const OPTIONS = {
    businessName: "Prana Yoga",
    phone: null,
    challenge: { required: false, siteKey: null },
};

function api(
    verify: VerifyResult = {
        ok: true,
        customer: { email: "asha.kumar@example.com", name: "Asha Kumar" },
    },
) {
    // What was asked of the site's server: the emails a code went to, and
    // each code checked.
    const sent: string[] = [];
    const checked: [string, string][] = [];
    const sheet: SignInApi = {
        requestCode: (email: string): Promise<CodeRequestResult> => {
            sent.push(email);
            return Promise.resolve({ ok: true, resendAfterSeconds: 30 });
        },
        verifyCode: (email: string, code: string): Promise<VerifyResult> => {
            checked.push([email, code]);
            return Promise.resolve(verify);
        },
    };
    return { sheet, sent, checked };
}

function draw(a = api(), onSignedIn = vi.fn()) {
    const view = render(
        <InlineCode
            ids="t"
            options={OPTIONS}
            api={a.sheet}
            onSignedIn={onSignedIn}
        />,
    );
    return { ...view, a, onSignedIn };
}

async function leaveWith(email: string) {
    const field = screen.getByLabelText("Email");
    fireEvent.change(field, { target: { value: email } });
    await act(async () => {
        fireEvent.blur(field);
        await Promise.resolve();
    });
}

afterEach(() => vi.useRealTimers());

describe("the code inside Your details", () => {
    it("says the same words for a new and a returning email", async () => {
        const first = draw();
        expect(screen.getByText(CODE_LEAD)).toBeVisible();
        await leaveWith("new.person@example.com");
        const newText = first.container.textContent.replace(
            "new.person@example.com",
            "{email}",
        );
        first.unmount();
        window.sessionStorage.clear();

        const second = draw();
        await leaveWith("asha.kumar@example.com");
        const knownText = second.container.textContent.replace(
            "asha.kumar@example.com",
            "{email}",
        );
        expect(knownText).toBe(newText);
        expect(knownText).not.toMatch(/before|welcome back|again/i);
        expect(
            screen.getByText(codeSentText("asha.kumar@example.com")),
        ).toBeVisible();
    });

    it("sends nothing while the address is typed, once when the field is left", async () => {
        const { a } = draw();
        const field = screen.getByLabelText("Email");
        for (const v of ["a", "asha@", "asha@example.com"]) {
            fireEvent.change(field, { target: { value: v } });
        }
        expect(a.sent).toHaveLength(0);
        await act(async () => {
            fireEvent.blur(field);
            await Promise.resolve();
        });
        await act(async () => {
            fireEvent.blur(field);
            await Promise.resolve();
        });
        expect(a.sent).toHaveLength(1);
    });

    it("sends nothing for an address that isn't whole", async () => {
        const { a } = draw();
        await leaveWith("asha@example");
        expect(a.sent).toHaveLength(0);
    });

    it("is one field for the code, checked at the sixth digit", async () => {
        const { a, onSignedIn } = draw();
        await leaveWith("asha.kumar@example.com");
        const code = screen.getByLabelText("Code");
        expect(code).toHaveAttribute("autocomplete", "one-time-code");
        expect(code).toHaveAttribute("inputmode", "numeric");
        fireEvent.change(code, { target: { value: "12345" } });
        expect(a.checked).toHaveLength(0);
        await act(async () => {
            fireEvent.change(code, { target: { value: "123456" } });
            await Promise.resolve();
        });
        expect(a.checked).toEqual([["asha.kumar@example.com", "123456"]]);
        expect(onSignedIn).toHaveBeenCalledOnce();
    });

    it("says a wrong code in words and the field's edge, with no shake", async () => {
        draw(api({ ok: false, reason: "invalid" }));
        await leaveWith("asha.kumar@example.com");
        const code = screen.getByLabelText("Code");
        await act(async () => {
            fireEvent.change(code, { target: { value: "000000" } });
            await Promise.resolve();
        });
        expect(screen.getByRole("alert")).toHaveTextContent(WRONG_CODE);
        expect(code).toHaveAttribute("aria-invalid", "true");
        expect(code.className).not.toMatch(/animate|shake/);
    });

    it("waits 30 seconds before another code, with the wait in words", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { a } = draw();
        await leaveWith("asha.kumar@example.com");
        const again = screen.getByRole("button", { name: "Send a new code" });
        expect(again).toHaveAttribute("aria-disabled", "true");
        expect(
            screen.getByText(/You can send another in 0:3\d|0:2\d/),
        ).toBeVisible();
        fireEvent.click(again);
        expect(a.sent).toHaveLength(1);
        await act(async () => {
            vi.advanceTimersByTime(31_000);
            await Promise.resolve();
        });
        expect(
            screen.getByRole("button", { name: "Send a new code" }),
        ).toHaveAttribute("aria-disabled", "false");
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Send a new code" }),
            );
            await Promise.resolve();
        });
        expect(a.sent).toHaveLength(2);
    });

    it("Change clears the code and the wait, and asks for the email again", async () => {
        draw();
        await leaveWith("asha.kumar@example.com");
        fireEvent.change(screen.getByLabelText("Code"), {
            target: { value: "12" },
        });
        fireEvent.click(
            screen.getByRole("button", {
                name: "Change email, asha.kumar@example.com",
            }),
        );
        expect(screen.queryByLabelText("Code")).toBeNull();
        expect(screen.queryByText(/You can send another/)).toBeNull();
        expect(screen.getByText(CODE_LEAD)).toBeVisible();
        expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    });

    it("never keeps the code for the visit, only the email and the step", async () => {
        draw();
        await leaveWith("asha.kumar@example.com");
        fireEvent.change(screen.getByLabelText("Code"), {
            target: { value: "1234" },
        });
        const kept = window.sessionStorage.getItem("saroh.sign-in") ?? "";
        expect(kept).toContain("asha.kumar@example.com");
        expect(kept).not.toContain("1234");
    });

    it("writes the wait as a clock", () => {
        expect(waitClock(24)).toBe("0:24");
        expect(waitClock(60)).toBe("1:00");
        expect(waitClock(0)).toBe("0:00");
    });
});
