import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SignInApi, SignInOptions } from "./api";
import { sheetWays } from "./api";
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
 * The sheet follows the business's ways and their order (DEC-196): the
 * first opens, the rest are "Use … instead" in order, and email comes back
 * when WhatsApp can't send.
 */
const BASE: SignInOptions = {
    businessName: "Kavi Dental",
    phone: null,
    challenge: { required: false, siteKey: "site-key" },
};

function setup(options: Partial<SignInOptions>) {
    const requestPhoneCode = vi
        .fn<NonNullable<SignInApi["requestPhoneCode"]>>()
        .mockResolvedValue({ ok: false, reason: "unavailable" });
    const api: SignInApi = {
        requestCode: vi.fn().mockResolvedValue({ ok: true }),
        verifyCode: vi.fn(),
        requestPhoneCode,
        verifyPhoneCode: vi.fn(),
    };
    render(
        <SignInSheet
            open
            onClose={vi.fn()}
            options={{ ...BASE, ...options }}
            api={api}
            onSignedIn={vi.fn()}
        />,
    );
    return { requestPhoneCode };
}

const alternates = () =>
    screen
        .queryAllByRole("button", { name: /instead$/ })
        .map((b) => b.textContent);

afterEach(cleanup);

describe("sheetWays", () => {
    it("keeps the business's order and drops what can't be drawn", () => {
        expect(sheetWays({ ways: ["WHATSAPP", "EMAIL"] }, true)).toEqual([
            "phone",
            "email",
        ]);
        expect(sheetWays({ ways: ["SMS", "EMAIL"] }, true)).toEqual(["email"]);
        expect(sheetWays({ ways: ["WHATSAPP"] }, false)).toEqual(["email"]);
        // An older API: `whatsapp` alone, email first.
        expect(sheetWays({ whatsapp: true }, true)).toEqual(["email", "phone"]);
        expect(sheetWays({}, true)).toEqual(["email"]);
    });
});

describe("the sign-in sheet's ways (DEC-196)", () => {
    it("opens on WhatsApp when it is first, with email as the other way", () => {
        setup({ ways: ["WHATSAPP", "EMAIL"], phoneOnlySignUp: true });
        expect(screen.getByLabelText("Mobile number")).toBeTruthy();
        expect(screen.queryByLabelText("Email")).toBeNull();
        expect(alternates()).toEqual(["Use email instead"]);
        // A phone alone signs up here.
        expect(
            screen.getByText("New here? The same code creates your account."),
        ).toBeTruthy();
    });

    it("opens on email when it is first, with WhatsApp next", () => {
        setup({ ways: ["EMAIL", "WHATSAPP"] });
        expect(screen.getByLabelText("Email")).toBeTruthy();
        expect(alternates()).toEqual(["Use WhatsApp instead"]);
    });

    it("offers no other way when email is the only one", () => {
        setup({ ways: ["EMAIL"], whatsapp: false });
        expect(screen.getByLabelText("Email")).toBeTruthy();
        expect(alternates()).toEqual([]);
    });

    it("offers email when WhatsApp alone can't send, so nobody is stuck", async () => {
        const { requestPhoneCode } = setup({
            ways: ["WHATSAPP"],
            phoneOnlySignUp: true,
        });
        expect(alternates()).toEqual([]);
        await act(async () => {
            fireEvent.change(screen.getByLabelText("Mobile number"), {
                target: { value: "+91 98450 12345" },
            });
            await Promise.resolve();
        });
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "I'm not a robot" }),
            );
            await Promise.resolve();
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Send code" }));
            await Promise.resolve();
        });
        expect(requestPhoneCode).toHaveBeenCalled();
        expect(alternates()).toEqual(["Use email instead"]);
    });
});
