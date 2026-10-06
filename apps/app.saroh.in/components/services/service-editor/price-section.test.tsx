// @vitest-environment jsdom
/**
 * The Service Editor's Price section (E8, DEC-088, #821): when the deposit
 * chosen — or a business that takes payment online only — leaves the
 * service unbookable online, it says so where the deposit is chosen, with
 * a link to what fixes it. Nothing when it couldn't be told, when the
 * service isn't on the booking page, or when nothing is wrong.
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
        all.find((el) =>
            el.textContent.startsWith("People can't book this online"),
        ) ?? null
    );
}

describe("the deposit's warning (#821)", () => {
    it("a deposit with no provider, the desk allowed: no warning, it books at the desk (DEC-089)", () => {
        render(draft(), {
            bookingPayment: "BOTH",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()).toBeNull();
    });

    it("a deposit with no provider, online only: says so, linking to Settings › Providers", () => {
        render(draft(), {
            bookingPayment: "ONLINE",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()?.textContent).toBe(
            "People can't book this online: it takes payment when they book, and no payment provider is connected. Connect one in Settings › Providers",
        );
        expect(warning()?.querySelector("a")?.getAttribute("href")).toBe(
            "/settings/providers",
        );
    });

    it("a deposit when the business takes payment at the desk only: links to the booking rule", () => {
        render(draft({ deposit: "FULL" }), {
            bookingPayment: "DESK",
            onlineBlocker: null,
        });
        expect(warning()?.querySelector("a")?.getAttribute("href")).toBe(
            "/bookings/availability",
        );
        expect(warning()?.textContent).toContain(
            "your booking rules take payment at the desk only",
        );
    });

    it("online only with no provider warns even with nothing at booking, and says it's all paid online", () => {
        render(draft({ deposit: "NONE" }), {
            bookingPayment: "ONLINE",
            onlineBlocker: "NO_PROVIDER",
        });
        expect(warning()?.textContent).toContain(
            "your booking rules take payment online only",
        );
        expect(host.textContent).toContain(
            "They pay ₹1,200 online when booking: your booking rules take payment online only.",
        );
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
