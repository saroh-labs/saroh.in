import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountEntry } from "../account/account-entry";
import type { SignedInCustomer } from "../account/api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { BookingPageData } from "./model";

/**
 * Signing in with the code inside a look's Your details: the Server Action
 * that sets the cookie draws the page again, and the booking stays where it
 * was, on the same later time, with what was typed (Classic is in
 * `booking-flow.test.tsx`).
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/book",
}));

const API = "https://api.test";

const PAGE: BookingPageData = {
    businessName: "Prana Yoga",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: false,
    rules: { bookAheadDays: 28, latestBookingMinutes: 60, freeCancelHours: 6 },
    services: [
        {
            id: "svc_private",
            name: "Private session",
            description: null,
            durationMinutes: 60,
            kind: "one",
            capacity: 1,
            priceCents: 250_000,
            currency: "INR",
            online: false,
            staff: ["Meera Iyer"],
        },
    ],
};

const ASHA: SignedInCustomer = {
    email: "asha.kumar@example.com",
    name: "Asha Kumar",
};

function account(customer: SignedInCustomer | null): BookingAccount {
    return {
        customer,
        options: {
            businessName: "Prana Yoga",
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
        book: vi.fn(),
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
    };
}

const daysOf = (date: string) => ({
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [
        {
            date,
            open: true,
            starts: [
                {
                    startAt: `${date}T02:30:00.000Z`,
                    endAt: `${date}T03:30:00.000Z`,
                    staffId: null,
                    staffName: null,
                    placesLeft: null,
                },
            ],
        },
    ],
});

let reads: string[];
const realFetch = globalThis.fetch;
beforeEach(() => {
    reads = [];
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/book");
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    globalThis.fetch = vi.fn((url: string) => {
        reads.push(url);
        return Promise.resolve(
            new Response(
                JSON.stringify(
                    daysOf(url.includes("skip=") ? "2026-11-30" : "2026-11-10"),
                ),
                {
                    status: 200,
                    headers: { "content-type": "application/json" },
                },
            ),
        );
    }) as unknown as typeof fetch;
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

const stepNow = () =>
    document
        .querySelector("[data-booking-step]")
        ?.getAttribute("data-booking-step");
const action = () => {
    const found = screen
        .getAllByRole("button")
        .find((b) => b.hasAttribute("data-booking-action"));
    if (!found) throw new Error("the step has no button");
    return found;
};

describe.each(["quiet", "live"] as const)("the header under %s", (look) => {
    const draw = () => {
        const flow = account(null);
        render(
            <>
                <AccountEntry
                    customer={null}
                    businessName="Prana Yoga"
                    api={flow.signIn}
                    loadOptions={vi.fn().mockResolvedValue(null)}
                />
                <BookingFlow
                    page={PAGE}
                    apiUrl={API}
                    account={flow}
                    look={look}
                />
            </>,
        );
    };
    const pressHeader = () =>
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    it("before Your details, opens the header's own sheet on the step", () => {
        draw();
        fireEvent.click(screen.getByRole("radio", { name: /Private session/ }));
        pressHeader();
        expect(screen.getByRole("dialog")).toHaveTextContent(
            "Sign in to Prana Yoga",
        );
        expect(screen.getByLabelText("Email")).toHaveFocus();
        expect(
            screen.getByRole("radio", { name: /Private session/ }),
        ).toHaveAttribute("aria-checked", "true");
    });

    it("on Your details, goes to the code there and keeps what was typed", async () => {
        draw();
        fireEvent.click(screen.getByRole("radio", { name: /Private session/ }));
        fireEvent.click(action());
        fireEvent.click(await screen.findByRole("radio", { name: /8:00/ }));
        await waitFor(() =>
            expect(action()).not.toHaveAttribute("aria-disabled"),
        );
        fireEvent.click(action());
        await waitFor(() => expect(stepNow()).toBe("details"));
        fireEvent.change(screen.getByLabelText("Anything we should know?"), {
            target: { value: "Bad knee" },
        });

        pressHeader();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByLabelText("Email")).toHaveFocus();
        expect(stepNow()).toBe("details");
        expect(screen.getByLabelText("Anything we should know?")).toHaveValue(
            "Bad knee",
        );
        // Nothing is said wrong for an empty field they only just reached.
        expect(screen.queryByRole("alert")).toBeNull();

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha.kumar@example.com" },
        });
        fireEvent.blur(screen.getByLabelText("Email"));
        fireEvent.change(await screen.findByLabelText("Code"), {
            target: { value: "123456" },
        });
        await screen.findByText(/Booking as/);
        expect(stepNow()).toBe("details");
        expect(screen.getByLabelText("Anything we should know?")).toHaveValue(
            "Bad knee",
        );
    });
});

describe.each(["folio", "quiet", "live"] as const)("under %s", (look) => {
    it("stays on Your details with the later time, what was typed and no new read", async () => {
        const { rerender } = render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account(null)}
                look={look}
            />,
        );
        fireEvent.click(screen.getByRole("radio", { name: /Private session/ }));
        fireEvent.click(action());
        fireEvent.click(
            await screen.findByRole("button", { name: "Show later dates" }),
        );
        await waitFor(() =>
            expect(reads.some((u) => u.includes("skip="))).toBe(true),
        );
        await screen.findByText(/Later dates/);
        fireEvent.click(await screen.findByRole("radio", { name: /8:00/ }));
        await waitFor(() =>
            expect(action()).not.toHaveAttribute("aria-disabled"),
        );
        fireEvent.click(action());
        await waitFor(() => expect(stepNow()).toBe("details"));

        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Asha" },
        });
        fireEvent.change(screen.getByLabelText(/^Phone/), {
            target: { value: "98450 00000" },
        });
        fireEvent.change(screen.getByLabelText("Anything we should know?"), {
            target: { value: "Bad knee" },
        });
        const start = new URLSearchParams(window.location.search);
        const before = reads.length;

        rerender(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account(ASHA)}
                look={look}
                initialServiceId="svc_private"
                initialDate={start.get("date")}
                initialStart={start.get("start")}
                initialStep="details"
            />,
        );
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        expect(stepNow()).toBe("details");
        expect(reads.length).toBe(before);
        expect(new URLSearchParams(window.location.search).get("date")).toBe(
            "2026-11-30",
        );
        expect(screen.getByText(/Booking as/)).toHaveTextContent(
            "Booking as Asha Kumar",
        );
        expect(screen.queryByLabelText("Code")).toBeNull();
        expect(screen.getByLabelText(/^Phone/)).toHaveValue("98450 00000");
        expect(screen.getByLabelText("Anything we should know?")).toHaveValue(
            "Bad knee",
        );
    });
});
