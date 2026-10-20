import type { LookId } from "@saroh/block-contract";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import { viewport } from "../test-viewport";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { BookingPageData } from "./model";
import { isBookResult } from "./model";

/**
 * Booking in each look (DEC-172, plan U10, #1100): the same steps in
 * Folio's panel, Quiet's page and Live's sheets — the same questions and
 * words, one filled button per view, the code inside Your details, Escape
 * and Close leaving to where the booking was opened, and Back a step.
 */

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: router.replace }),
    usePathname: () => "/book",
}));

const API = "https://api.test";
const LOOKS: LookId[] = ["folio", "quiet", "live"];
const FRAME: Record<LookId, string> = {
    folio: "panel",
    quiet: "page",
    live: "sheets",
};

const PAGE: BookingPageData = {
    businessName: "Prana Yoga",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: false,
    rules: { bookAheadDays: 21, latestBookingMinutes: 60, freeCancelHours: 6 },
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
            staff: ["Meera Iyer", "Kabir Menon"],
        },
        {
            id: "svc_hatha",
            name: "Hatha yoga",
            description: null,
            durationMinutes: 60,
            kind: "class",
            capacity: 12,
            priceCents: 60_000,
            currency: "INR",
            online: false,
            staff: ["Meera Iyer"],
        },
    ],
};

const EIGHT = "2026-10-22T02:30:00.000Z"; // Thu 22 Oct, 8 am in Kolkata

const DAYS = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    staff: [
        { id: "staff_meera", name: "Meera Iyer" },
        { id: "staff_kabir", name: "Kabir Menon" },
    ],
    days: [
        {
            date: "2026-10-22",
            open: true,
            starts: [
                {
                    startAt: EIGHT,
                    endAt: "2026-10-22T03:30:00.000Z",
                    staffId: "staff_meera",
                    staffName: "Meera Iyer",
                    placesLeft: null,
                },
            ],
        },
    ],
};

const ASHA: SignedInCustomer = {
    email: "asha.kumar@example.com",
    name: "Asha Kumar",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

let booked: unknown[];
function serve() {
    booked = [];
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/days")) return Promise.resolve(json(DAYS));
        if (url.endsWith("/book")) {
            booked.push(
                JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
            );
            return Promise.resolve(
                json(
                    {
                        reference: "PY-24117",
                        startAt: EIGHT,
                        endAt: "2026-10-22T03:30:00.000Z",
                        serviceName: "Private session",
                        online: false,
                        meetingUrl: null,
                        state: "CONFIRMED",
                        holdExpiresAt: null,
                        payToken: null,
                        reach: { email: true },
                    },
                    201,
                ),
            );
        }
        return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
}

function account(over: Partial<BookingAccount> = {}): BookingAccount {
    return {
        customer: null,
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
        book: async ({ serviceId, ...rest }: SignedInBookRequest) => {
            const res = await fetch(`${API}/signed-in/${serviceId}/book`, {
                method: "POST",
                body: JSON.stringify({ serviceId, ...rest }),
            });
            const body: unknown = await res.json().catch(() => null);
            return resultOf(res.status, body, isBookResult);
        },
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
        ...over,
    };
}

const here = () => new URLSearchParams(window.location.search);

const realFetch = globalThis.fetch;
beforeEach(() => {
    router.replace.mockClear();
    window.history.replaceState(null, "", "/book");
    serve();
});
afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
});

/** The step's one filled button, by what it says. */
const action = () =>
    screen
        .getAllByRole("button")
        .filter((b) => b.hasAttribute("data-booking-action"));

function draw(
    look: LookId,
    over: Partial<BookingAccount> = {},
    opened: string | null = null,
) {
    // As the server reads it from the address (`book/page.tsx`).
    if (opened) window.history.replaceState(null, "", `/book?${opened}`);
    const q = new URLSearchParams(opened ?? "");
    return render(
        <BookingFlow
            page={PAGE}
            apiUrl={API}
            account={account(over)}
            look={look}
            initialServiceId={q.get("service")}
            initialDate={q.get("date")}
            initialStart={q.get("start")}
            initialStep={
                q.get("step") as Parameters<
                    typeof BookingFlow
                >[0]["initialStep"]
            }
        />,
    );
}

const AT_DETAILS =
    "service=svc_private&date=2026-10-22&start=08:00&step=details";

describe.each(LOOKS)("booking in %s", (look) => {
    it("draws the look's frame with the same question, and one filled button", () => {
        const { container } = draw(look);
        expect(
            container.querySelector(`[data-booking-frame="${FRAME[look]}"]`),
        ).not.toBeNull();
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "What would you like to book?",
            }),
        ).toBeVisible();
        expect(action()).toHaveLength(1);
    });

    it("draws one filled button on a phone too, in the one bar", () => {
        viewport("phone");
        const { container } = draw(look);
        expect(action()).toHaveLength(1);
        const bars = Array.from(
            container.querySelectorAll("[data-booking-bar]"),
        ).filter((bar) => !bar.closest(".max-\\[699px\\]\\:hidden"));
        expect(bars).toHaveLength(1);
    });

    it("leaves on Escape and on Close, to where it was opened, keeping the address's choices", () => {
        draw(look);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(router.replace).toHaveBeenCalledWith("/");
        fireEvent.click(screen.getAllByRole("button", { name: /^Close/ })[0]);
        expect(router.replace).toHaveBeenCalledTimes(2);
    });

    it("a new visitor picks, gets a code inside Your details, and books at the desk", async () => {
        draw(look);
        fireEvent.click(screen.getByRole("radio", { name: /Private session/ }));
        // Choosing stays on the step; its button moves on.
        expect(here().get("step")).toBe("what");
        fireEvent.click(action()[0]);
        await waitFor(() => expect(here().get("step")).toBe("who"));
        expect(
            await screen.findByRole("radio", { name: /Meera Iyer/ }),
        ).toBeVisible();
        fireEvent.click(action()[0]);
        await waitFor(() => expect(here().get("step")).toBe("when"));
        fireEvent.click(await screen.findByRole("radio", { name: /8:00 am/ }));
        expect(action()[0]).toHaveTextContent("Next: your details");
        fireEvent.click(action()[0]);
        await waitFor(() => expect(here().get("step")).toBe("details"));

        // Name and email, the same for every visitor; the code after the
        // email field is left.
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Asha Kumar" },
        });
        const email = screen.getByLabelText("Email");
        fireEvent.change(email, {
            target: { value: "asha.kumar@example.com" },
        });
        await act(async () => {
            fireEvent.blur(email);
            await Promise.resolve();
        });
        const code = await screen.findByLabelText("Code");
        expect(code).toHaveAttribute("autocomplete", "one-time-code");
        await act(async () => {
            fireEvent.change(code, { target: { value: "123456" } });
            await Promise.resolve();
        });
        expect(await screen.findByText("Booking as Asha Kumar")).toBeVisible();

        // How to pay is its own step; its button says what happens.
        fireEvent.click(action()[0]);
        await waitFor(() => expect(here().get("step")).toBe("pay"));
        expect(
            screen.getByRole("radio", { name: /Pay at the desk/ }),
        ).toHaveAttribute("aria-checked", "true");
        expect(action()[0]).toHaveTextContent("Confirm booking");
        await act(async () => {
            fireEvent.click(action()[0]);
            await Promise.resolve();
        });
        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeVisible();
        expect(here().get("step")).toBe("done");
        expect(booked).toHaveLength(1);
    });

    it("Back from Your details goes to When, with the time still chosen", async () => {
        draw(look, { customer: ASHA }, AT_DETAILS);
        await screen.findByText("Booking as Asha Kumar");
        fireEvent.click(
            screen.getAllByRole("button", { name: "Back a step" })[0],
        );
        await waitFor(() => expect(here().get("step")).toBe("when"));
        expect(
            await screen.findByRole("radio", { name: /8:00 am/ }),
        ).toHaveAttribute("aria-checked", "true");
    });
});

describe("Folio's sentence", () => {
    it("lets What be changed from its phrase without walking back", async () => {
        draw("folio", { customer: ASHA }, "service=svc_private&step=when");
        const phrase = screen.getByRole("button", {
            name: "Change what, Private session",
        });
        fireEvent.click(phrase);
        const list = screen.getByRole("listbox", { name: "what" });
        fireEvent.click(
            within(list).getByRole("option", { name: /Hatha yoga/ }),
        );
        await waitFor(() => expect(here().get("service")).toBe("svc_hatha"));
        expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("is a dialog that holds focus, named Book a time", () => {
        draw("folio");
        const dialog = screen.getByRole("dialog", { name: "Book a time" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(document.activeElement).toBe(
            screen.getByRole("heading", {
                name: "What would you like to book?",
            }),
        );
    });
});

describe("signed in", () => {
    it.each(LOOKS)(
        "%s says Booking as, with Not you?, and no email field",
        async (look) => {
            draw(look, { customer: ASHA }, AT_DETAILS);
            expect(
                await screen.findByText("Booking as Asha Kumar"),
            ).toBeVisible();
            expect(
                screen.getAllByRole("button", { name: "Not you?" }).length,
            ).toBe(1);
            expect(screen.queryByLabelText("Email")).toBeNull();
        },
    );
});

describe("Classic", () => {
    it("keeps today's page: no frame, the numbered steps", () => {
        const { container } = render(
            <BookingFlow page={PAGE} apiUrl={API} account={account()} />,
        );
        expect(container.querySelector("[data-booking-frame]")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "What would you like?" }),
        ).toBeVisible();
    });
});

describe("booking paused, in a look (DEC-172, U15)", () => {
    it.each(["folio", "quiet", "live"] as const)(
        "%s: says so and offers Message us and Call as buttons, naming no plan",
        (look) => {
            render(
                <BookingFlow
                    page={{ ...PAGE, paused: true }}
                    apiUrl={API}
                    account={account()}
                    look={look}
                    reach={{
                        phone: "+918040992210",
                        whatsapp: "https://wa.me/918040992210",
                        email: null,
                    }}
                />,
            );
            expect(
                screen.getByRole("heading", {
                    name: "We’re not taking bookings online right now.",
                }),
            ).toBeInTheDocument();
            const message = screen.getByRole("link", { name: "Message us" });
            expect(message.getAttribute("href")).toBe(
                "https://wa.me/918040992210",
            );
            const call = screen.getByRole("link", {
                name: "Call +91 80409 92210",
            });
            expect(call.getAttribute("href")).toBe("tel:+918040992210");
            // Both are buttons of equal standing: neither is the filled one.
            expect(message.className).toBe(call.className);
            expect(message.className).not.toMatch(/\bbg-site-accent\b/);
            expect(document.body.textContent).not.toMatch(/plan|limit/i);
        },
    );

    it("messages by email when the business has no WhatsApp", () => {
        render(
            <BookingFlow
                page={{ ...PAGE, paused: true }}
                apiUrl={API}
                account={account()}
                look="quiet"
                reach={{
                    phone: null,
                    whatsapp: null,
                    email: "hello@example.com",
                }}
            />,
        );
        expect(
            screen
                .getByRole("link", { name: "Message us" })
                .getAttribute("href"),
        ).toBe("mailto:hello@example.com");
        expect(screen.queryByRole("link", { name: /^Call/ })).toBeNull();
    });

    it("with no way to reach the business, says to get in touch and offers nothing dead", () => {
        render(
            <BookingFlow
                page={{ ...PAGE, paused: true }}
                apiUrl={API}
                account={account()}
                look="live"
                reach={{ phone: null, whatsapp: null, email: null }}
            />,
        );
        expect(screen.getByText(/get in touch with/)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Message us" })).toBeNull();
    });

    it("not open at all says that, in the look", () => {
        render(
            <BookingFlow
                page={{ ...PAGE, open: false }}
                apiUrl={API}
                account={account()}
                look="folio"
            />,
        );
        expect(
            screen.getByRole("heading", {
                name: "Online booking isn’t open right now.",
            }),
        ).toBeInTheDocument();
    });
});
