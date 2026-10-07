import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { bookingEmailsBlock } from "@/lib/providers/booking-emails";
import type { SarohEmailState } from "@/lib/providers/service";

import { BookingEmailsBlock } from "./booking-emails-block";

/**
 * The Booking emails block's main action (DEC-086): connecting the
 * business's own email where its plan has room for one, the plans where it
 * hasn't (Free), and neither when that couldn't be read.
 */
const state = (
    canConnectOwn: boolean | null,
    s: "SENDING" | "NEAR" | "PAUSED" = "SENDING",
): SarohEmailState => ({
    state: s,
    used: s === "SENDING" ? 3 : s === "NEAR" ? 8 : 10,
    cap: 10,
    resetsOn: "1 Nov",
    sender: { name: "Rye via Saroh", address: "bookings@notify.saroh.in" },
    replyTo: "hello@rye.example",
    canConnectOwn,
});

function render(
    s: SarohEmailState,
    connectHref: string | null = "#connect-email",
) {
    const emails = bookingEmailsBlock(s);
    if (!emails) throw new Error("no block");
    return renderToStaticMarkup(
        <BookingEmailsBlock emails={emails} connectHref={connectHref} />,
    );
}

describe("BookingEmailsBlock's main action", () => {
    it("is Connect your email when its plan has room", () => {
        const html = render(state(true));
        expect(html).toContain('href="#connect-email"');
        expect(html).toContain("Connect your email");
        expect(html).not.toContain("See plans");
    });

    it("is See plans, to the plan picker, when it hasn't — near and paused too", () => {
        for (const s of ["SENDING", "NEAR", "PAUSED"] as const) {
            const html = render(state(false, s));
            expect(html).toContain('href="/settings/billing#change-plan"');
            expect(html).toContain("See plans");
            expect(html).not.toContain("Connect your email");
        }
    });

    it("offers neither when that couldn't be read", () => {
        const html = render(state(null));
        expect(html).not.toContain("Connect your email");
        expect(html).not.toContain("See plans");
    });
});
