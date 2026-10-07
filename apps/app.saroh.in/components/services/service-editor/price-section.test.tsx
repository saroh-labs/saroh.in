// @vitest-environment jsdom
/**
 * The Service Editor's Price section (E8, DEC-088, DEC-089, #821): when
 * online can't take what the service asks, it says what happens where the
 * deposit is chosen — paid at the desk under Both or At the desk, can't be
 * booked online under Online only — with a link to what fixes it. Nothing
 * when it couldn't be told, when the service isn't on the booking page, or
 * when nothing is wrong.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceDraft } from "@/lib/services/service-editor";
import { draftOf } from "@/lib/services/service-editor";
import type { BookingPaymentView } from "@/lib/staff/types";

import { PriceSection } from "./editor-sections";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({
    ...draftOf(null, [], "Asia/Kolkata"),
    price: "1200",
    deposit: "PERCENT_50",
    ...over,
});

function render(d: ServiceDraft, payment: BookingPaymentView | null) {
    act(() =>
        root.render(
            <PriceSection
                draft={d}
                set={() => undefined}
                currency="INR"
                payment={payment}
            />,
        ),
    );
}

function warning(): HTMLElement | null {
    const all = Array.from(
        host.querySelectorAll<HTMLElement>('[role="status"]'),
    );
    return (
        all.find(
            (el) =>
                el.textContent.startsWith("People can't book this online") ||
                el.textContent.startsWith("Paid at the desk"),
        ) ?? null
    );
}

describe("the deposit's warning (#821)", () => {
    it("Both, a deposit with no provider: paid at the desk for now, linking to Settings › Providers (DEC-089)", () => {
        render(draft(), {
            bookingPayment: "BOTH",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()?.textContent).toBe(
            "Paid at the desk for now: no payment provider is connected, so nothing is taken when people book. Connect one in Settings › Providers",
        );
        expect(warning()?.querySelector("a")?.getAttribute("href")).toBe(
            "/settings/providers",
        );
    });

    it("a deposit when the business takes payment at the desk only: paid at the desk, links to the booking rule", () => {
        render(draft({ deposit: "FULL" }), {
            bookingPayment: "DESK",
            onlineBlocker: null,
        });
        expect(warning()?.querySelector("a")?.getAttribute("href")).toBe(
            "/bookings/availability",
        );
        expect(warning()?.textContent).toBe(
            "Paid at the desk: your booking rules take payment at the desk only, so nothing is taken when people book. Change it in Booking rules",
        );
        expect(host.textContent).toContain("They pay ₹1,200 at the visit.");
    });

    it("online only, a deposit with no provider: can't be booked online", () => {
        render(draft(), {
            bookingPayment: "ONLINE",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()?.textContent).toBe(
            "People can't book this online: it takes payment when they book, and no payment provider is connected. Connect one in Settings › Providers",
        );
    });

    it("online only with no provider warns even with nothing at booking, and says only that (UX-056)", () => {
        render(draft({ deposit: "NONE" }), {
            bookingPayment: "ONLINE",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()?.textContent).toContain(
            "your booking rules take payment online only",
        );
        // Never what it would take online right beside "can't be booked".
        expect(host.textContent).not.toContain("They pay ₹1,200 online");
    });

    it("says nothing when all is well, when it couldn't tell, or off the booking page", () => {
        render(draft(), { bookingPayment: "BOTH", onlineBlocker: null });
        expect(warning()).toBeNull();
        render(draft(), null);
        expect(warning()).toBeNull();
        render(draft({ showOnBookingPage: false }), {
            bookingPayment: "BOTH",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()).toBeNull();
        render(draft({ deposit: "NONE" }), {
            bookingPayment: "BOTH",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()).toBeNull();
    });
});
