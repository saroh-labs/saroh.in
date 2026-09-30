import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SignInApi } from "../account/api";
import { SignInSheet } from "../account/sign-in-sheet";
import EnquirySection from "../blocks/enquiry";
import { testReleaseBookingLine } from "../booking-flow/flow-helpers";
import { testStopLine } from "../shop/bag";
import { TestReleaseProvider } from "./context";
import { TestReleaseStop } from "./test-release-stop";
import {
    isTestReleaseRefusal,
    SIGN_IN_OFF_TEXT,
    TEST_RELEASE_MESSAGE,
} from "./words";

/**
 * A test release in the blocks (DEC-071, T6): the stop says what the live
 * site would do, with the total and the items it is given; the enquiry
 * form posts nothing; and the sign-in sheet says signing in is off.
 */

afterEach(() => {
    vi.restoreAllMocks();
});

const inRelease = (children: ReactNode) => (
    <TestReleaseProvider release={{ name: "Diwali menu" }}>
        {children}
    </TestReleaseProvider>
);

const FORM = {
    title: "Send an enquiry",
    formId: "form-1",
    submitLabel: "Send enquiry",
    fields: [
        { name: "email", label: "Email", type: "email" as const },
        { name: "message", label: "Message", type: "textarea" as const },
    ],
};

async function sendEnquiry() {
    fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "asha@example.in" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "Twenty cartons, please" },
    });
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
        await Promise.resolve();
    });
}

describe("the stop", () => {
    it("says what the live site would do, with the total and the items", () => {
        render(
            <TestReleaseStop
                live={testStopLine({ total: "₹1,240", count: 3 })}
                nothing="ordered"
            />,
        );
        const stop = screen.getByRole("status");
        expect(stop.textContent).toContain(
            "On the live site, the customer signs in here and pays ₹1,240 for 3 items.",
        );
        expect(stop.textContent).toContain(
            "Nothing is ordered on a test release.",
        );
    });

    it("says one item, and a booking's service, time and payment", () => {
        expect(testStopLine({ total: "₹250", count: 1 })).toBe(
            "the customer signs in here and pays ₹250 for 1 item",
        );
        expect(
            testReleaseBookingLine({
                serviceName: "Haircut",
                whenText: "Sat 4 Oct at 11:00 with Asha",
                waitlist: false,
                pay: "NOW",
                payingNow: "₹500",
            }),
        ).toBe(
            "the customer signs in here and books Haircut, Sat 4 Oct at 11:00 with Asha and pays ₹500",
        );
        expect(
            testReleaseBookingLine({
                serviceName: "HIIT class",
                whenText: "Sun 20 Sep at 18:30",
                waitlist: true,
                pay: "DESK",
                payingNow: "",
            }),
        ).toBe(
            "the customer signs in here and joins the waitlist for HIIT class, Sun 20 Sep at 18:30",
        );
    });

    it("knows the API's refusal from a test host, and nothing else", () => {
        const refused = {
            error: {
                message: TEST_RELEASE_MESSAGE,
                details: { code: "TEST_RELEASE" },
            },
        };
        expect(isTestReleaseRefusal(409, refused)).toBe(true);
        expect(
            isTestReleaseRefusal(409, { details: { code: "TEST_RELEASE" } }),
        ).toBe(true);
        expect(isTestReleaseRefusal(400, refused)).toBe(false);
        expect(
            isTestReleaseRefusal(409, { error: { details: { reason: "x" } } }),
        ).toBe(false);
        expect(isTestReleaseRefusal(409, null)).toBe(false);
    });
});

describe("the enquiry form on a test release", () => {
    it("never posts, and says what the live site would do", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        render(inRelease(<EnquirySection content={FORM} />));
        await sendEnquiry();
        expect(fetch).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toContain(
            "Nothing is sent on a test release.",
        );
        // The form stays, as it was filled in.
        expect(screen.getByLabelText("Message")).toHaveValue(
            "Twenty cartons, please",
        );
    });

    it("reads the API's refusal the same way on a page that missed it", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        message: TEST_RELEASE_MESSAGE,
                        details: { code: "TEST_RELEASE" },
                    },
                }),
                { status: 409 },
            ),
        );
        render(<EnquirySection content={FORM} />);
        await sendEnquiry();
        expect(screen.getByRole("status").textContent).toContain(
            "Nothing is sent on a test release.",
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("posts as always on a live page", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 201 }));
        render(<EnquirySection content={FORM} />);
        await sendEnquiry();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe("the sign-in sheet on a test release (KTD-9)", () => {
    it("says signing in is off, and sends no code", async () => {
        const requestCode = vi.fn();
        const api: SignInApi = { requestCode, verifyCode: vi.fn() };
        render(
            inRelease(
                <SignInSheet
                    open
                    onClose={() => undefined}
                    options={{
                        businessName: "Northwind Supply",
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    }}
                    api={api}
                    onSignedIn={() => undefined}
                />,
            ),
        );
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Send code" }));
            await Promise.resolve();
        });
        expect(requestCode).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toBe(SIGN_IN_OFF_TEXT);
        // Still the email step: no code to wait for.
        expect(screen.queryByLabelText("Code")).toBeNull();
    });
});
