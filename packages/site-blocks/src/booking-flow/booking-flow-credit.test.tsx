import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { CreditFor, Result, SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { BookingPageData, CreditAnswer, OfferedCredit } from "./model";
import { isBookResult } from "./model";

/**
 * A class credit on the booking page (round-2 A10, the Pulse Fitness
 * design): a signed-in customer with a pack or a membership that covers the
 * class is offered "Use 1 credit" first, and books with it at no charge. The
 * API decides the credit (`account.credit`); the page sends back only what
 * it was given. Layout and the four scenes are the browser pass's.
 */

const API = "https://api.test";

const PAGE: BookingPageData = {
    businessName: "Pulse Fitness",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: true,
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 12,
    },
    services: [
        {
            id: "svc_hiit",
            name: "HIIT class",
            description: null,
            durationMinutes: 45,
            kind: "class",
            capacity: 12,
            priceCents: 50_000,
            currency: "INR",
            online: false,
            staff: ["Ritu Kapoor"],
        },
    ],
};

const CLASS_DAYS = {
    timezone: "Asia/Kolkata",
    kind: "class",
    capacity: 12,
    days: [
        {
            date: "2026-10-05",
            open: true,
            starts: [
                {
                    startAt: "2026-10-05T13:00:00.000Z",
                    endAt: "2026-10-05T13:45:00.000Z",
                    staffId: "staff_ritu",
                    staffName: "Ritu Kapoor",
                    placesLeft: 4,
                },
            ],
        },
    ],
};

const PACK: OfferedCredit = {
    kind: "PACK",
    id: "pp_1",
    name: "5 classes",
    left: 4,
    useBy: "2026-11-12",
};

const MEMBERSHIP: OfferedCredit = {
    kind: "MEMBERSHIP",
    id: "sub_1",
    name: "Monthly 8",
    left: 3,
    allowance: 8,
    resetsOn: "2026-11-01",
};

const ASHA: SignedInCustomer = { email: "asha@example.in", name: "Asha Rao" };

const booked = {
    reference: "bk_1",
    startAt: "2026-10-05T13:00:00.000Z",
    endAt: "2026-10-05T13:45:00.000Z",
    serviceName: "HIIT class",
    online: false,
    meetingUrl: null,
    state: "CONFIRMED",
    holdExpiresAt: null,
    payToken: null,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

let calls: { url: string; init?: RequestInit }[];

function serve(book: () => Response = () => json(booked, 201)) {
    calls = [];
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(
            url.endsWith("/days") ? json(CLASS_DAYS) : book(),
        );
    }) as unknown as typeof fetch;
}

const bookBodies = () =>
    calls
        .filter((c) => c.url.endsWith("/book"))
        .map(
            (c) =>
                JSON.parse(c.init?.body as string) as Record<string, unknown>,
        );

/** The credit read, answering these in turn (the last one after that). */
function creditReads(...answers: (OfferedCredit | null | "fail")[]) {
    let n = 0;
    return vi.fn<CreditFor>(() => {
        const answer = answers[Math.min(n, answers.length - 1)];
        n += 1;
        const result: Result<CreditAnswer> =
            answer === "fail"
                ? { ok: false, status: 0, message: "offline" }
                : { ok: true, value: { credit: answer ?? null } };
        return Promise.resolve(result);
    });
}

function account(over: Partial<BookingAccount> = {}): BookingAccount {
    return {
        customer: ASHA,
        options: {
            businessName: "Pulse Fitness",
            phone: null,
            challenge: { required: false, siteKey: null },
        },
        signIn: {
            requestCode: vi.fn(() =>
                Promise.resolve({ ok: true as const, resendAfterSeconds: 30 }),
            ),
            verifyCode: vi.fn(() =>
                Promise.resolve({ ok: true as const, customer: ASHA }),
            ),
        },
        book: async ({ serviceId, ...rest }: SignedInBookRequest) => {
            const res = await fetch(
                `${API}/signed-in/services/${serviceId}/book`,
                {
                    method: "POST",
                    body: JSON.stringify({ serviceId, ...rest }),
                },
            );
            return resultOf(
                res.status,
                await res.json().catch(() => null),
                isBookResult,
            );
        },
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
        ...over,
    };
}

async function pickSession() {
    fireEvent.click(screen.getByRole("radio", { name: /HIIT class/ }));
    fireEvent.click(
        await screen.findByRole("radio", { name: /18:30.*4 places left/ }),
    );
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("a class credit online (A10)", () => {
    it("offers the pack's credit first and chosen, with nothing to pay", async () => {
        serve();
        const credit = creditReads(PACK);
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ credit })}
            />,
        );
        await pickSession();

        const use = await screen.findByRole("radio", {
            name: /Use 1 credit \(4 left\)/,
        });
        expect(use).toHaveAttribute("aria-checked", "true");
        expect(use).toHaveTextContent("5 classes pack · use by 12 Nov");
        const options = within(
            screen.getByRole("radiogroup", { name: "Paying" }),
        ).getAllByRole("radio");
        expect(options[0]).toBe(use);
        expect(options.map((o) => o.textContent)).toEqual([
            expect.stringContaining("Use 1 credit"),
            expect.stringContaining("Pay ₹500 for this class"),
            expect.stringContaining("Pay at the desk"),
        ]);
        expect(screen.getByText("Uses 1 credit")).toBeInTheDocument();
        expect(screen.getByText("₹0")).toBeInTheDocument();
        expect(credit).toHaveBeenCalledWith({
            serviceId: "svc_hiit",
            startAt: "2026-10-05T13:00:00.000Z",
        });
    });

    it("books with the credit it was offered, and says what is left", async () => {
        serve();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ credit: creditReads(PACK) })}
            />,
        );
        await pickSession();
        await screen.findByRole("radio", { name: /Use 1 credit/ });
        fireEvent.click(
            screen.getByRole("button", { name: "Book with 1 credit" }),
        );

        expect(
            await screen.findByText(
                "Used 1 credit from your 5 classes pack — 3 left, use by 12 Nov.",
            ),
        ).toBeInTheDocument();
        const [body] = bookBodies();
        expect(body).toMatchObject({
            serviceId: "svc_hiit",
            pay: "CREDIT",
            packPurchaseId: "pp_1",
        });
        expect(body).not.toHaveProperty("subscriptionId");
        expect(body).not.toHaveProperty("amount");
    });

    it("a membership's class is Included, and books on the membership", async () => {
        serve();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ credit: creditReads(MEMBERSHIP) })}
            />,
        );
        await pickSession();
        const use = await screen.findByRole("radio", {
            name: /Use 1 credit \(3 left\)/,
        });
        expect(use).toHaveTextContent("Membership · resets 1 Nov");
        expect(use).toHaveTextContent("Included");
        fireEvent.click(
            screen.getByRole("button", { name: "Book with 1 credit" }),
        );

        expect(
            await screen.findByText(
                "Used 1 credit from your membership — 2 left in October.",
            ),
        ).toBeInTheDocument();
        expect(bookBodies()[0]).toMatchObject({
            pay: "CREDIT",
            subscriptionId: "sub_1",
        });
    });

    it("can still pay instead, sending no credit", async () => {
        serve();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ credit: creditReads(PACK) })}
            />,
        );
        await pickSession();
        await screen.findByRole("radio", { name: /Use 1 credit/ });
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        await screen.findByRole("heading", { name: "You're booked, Asha." });
        const [body] = bookBodies();
        expect(body).toMatchObject({ pay: "DESK" });
        expect(body).not.toHaveProperty("packPurchaseId");
    });

    it("offers no credit when there is none, or the read fails, and booking works", async () => {
        for (const answer of [null, "fail"] as const) {
            serve();
            const { unmount } = render(
                <BookingFlow
                    page={PAGE}
                    apiUrl={API}
                    account={account({ credit: creditReads(answer) })}
                />,
            );
            await pickSession();
            await screen.findByRole("radio", {
                name: /Pay ₹500 for this class/,
            });
            expect(
                screen.queryByRole("radio", { name: /Use 1 credit/ }),
            ).toBeNull();
            unmount();
        }
    });

    it("a credit spent meanwhile: says so, keeps the time, and asks again", async () => {
        serve(() =>
            json(
                {
                    error: {
                        message: "Your class pack has no classes left.",
                        details: { reason: "credit-gone" },
                    },
                },
                400,
            ),
        );
        const credit = creditReads(PACK, null);
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ credit })}
            />,
        );
        await pickSession();
        await screen.findByRole("radio", { name: /Use 1 credit/ });
        fireEvent.click(
            screen.getByRole("button", { name: "Book with 1 credit" }),
        );

        expect(
            await screen.findByText("Your class pack has no classes left."),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByRole("radio", { name: /Use 1 credit/ }),
            ).toBeNull(),
        );
        expect(credit).toHaveBeenCalledTimes(2);
        // The time is still chosen, and paying is back to the other ways.
        expect(
            screen.getByRole("radio", { name: /18:30.*4 places left/ }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByRole("radio", { name: /Pay ₹500 for this class/ }),
        ).toHaveAttribute("aria-checked", "true");
    });

    it("signing in at the last step with a credit: picks it and waits, charging nothing", async () => {
        serve();
        const credit = creditReads(PACK);
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ customer: null, credit })}
            />,
        );
        await pickSession();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Asha Rao" },
        });
        // Signed out, no credit is offered: paying is the only way.
        expect(
            screen.queryByRole("radio", { name: /Use 1 credit/ }),
        ).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );
        fireEvent.change(await within(sheet).findByLabelText("Code"), {
            target: { value: "123456" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

        expect(
            await screen.findByText(
                "You have a class credit for this, so we've picked it. Book with 1 credit, or choose another way to pay.",
            ),
        ).toBeInTheDocument();
        expect(bookBodies()).toHaveLength(0);
        const use = await screen.findByRole("radio", { name: /Use 1 credit/ });
        expect(use).toHaveAttribute("aria-checked", "true");

        fireEvent.click(
            screen.getByRole("button", { name: "Book with 1 credit" }),
        );
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(bookBodies()[0]).toMatchObject({
            pay: "CREDIT",
            packPurchaseId: "pp_1",
        });
    });

    it("signing in with no credit books straight after the code, as before", async () => {
        serve();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ customer: null, credit: creditReads(null) })}
            />,
        );
        await pickSession();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Asha Rao" },
        });
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );
        fireEvent.change(await within(sheet).findByLabelText("Code"), {
            target: { value: "123456" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(bookBodies()[0]).toMatchObject({ pay: "DESK" });
    });
});
