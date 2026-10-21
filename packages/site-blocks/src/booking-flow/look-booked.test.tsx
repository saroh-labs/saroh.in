import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import type { Phase } from "./flow-state";
import { LookBooked } from "./look-booked";
import type { BookingPageData } from "./model";

/**
 * Booked, in a look (VA08f, VD08f, VB08f, plan U10): the ticket first,
 * then Add to calendar; Directions for a visit, the link for one online;
 * the free-cancel time from the business's rule; money as it was asked
 * for; a treatment's first visit said as such.
 */

const START = "2026-10-22T02:30:00.000Z";
const RULES: BookingPageData["rules"] = {
    bookAheadDays: 21,
    latestBookingMinutes: 60,
    freeCancelHours: 6,
};

function done(over: Partial<Extract<Phase, { kind: "done" }>["booking"]> = {}) {
    return {
        kind: "done",
        booking: {
            reference: "PY-24117",
            startAt: START,
            endAt: "2026-10-22T03:30:00.000Z",
            serviceName: "Private session",
            online: false,
            meetingUrl: null,
            state: "CONFIRMED",
            holdExpiresAt: null,
            payToken: null,
            reach: { email: true },
            ...over,
        },
        paid: true,
        price: "₹2,500",
        when: "Thu 22 Oct at 8:00 am with Meera Iyer",
        first: "Asha",
    } as Extract<Phase, { kind: "done" }>;
}

function draw(
    phase = done(),
    more: Partial<Parameters<typeof LookBooked>[0]> = {},
) {
    return render(
        <LookBooked
            look="quiet"
            phase={phase}
            headingRef={createRef()}
            business="Prana Yoga"
            where={null}
            address="27th Main, HSR Layout, Bengaluru 560102"
            rules={RULES}
            zone="Asia/Kolkata"
            now={Date.parse("2026-10-20T00:00:00.000Z")}
            email="asha.kumar@example.com"
            onAgain={() => undefined}
            {...more}
        />,
    );
}

describe("booked, in a look", () => {
    it("leads with the news and the ticket, then Add to calendar", () => {
        const { container } = draw();
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "You're booked, Asha.",
            }),
        ).toBeVisible();
        const ticket = container.querySelector("[data-booking-ticket]");
        const add = screen.getByRole("button", { name: "Add to calendar" });
        expect(ticket).not.toBeNull();
        expect(ticket?.compareDocumentPosition(add) ?? 0).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
        expect(screen.getByText("PY-24117")).toBeVisible();
        // The one filled button.
        expect(add.className).toContain("bg-site-accent");
    });

    it("gives a visit Directions, and the cancel time from the rule", () => {
        draw();
        expect(
            screen.getByRole("link", { name: "Directions" }),
        ).toHaveAttribute(
            "href",
            expect.stringContaining("google.com/maps/search"),
        );
        expect(
            screen.getByText("Move or cancel free until Thu 22 Oct, 2:00 am."),
        ).toBeVisible();
    });

    it("gives an online booking its link to join, and no Directions", () => {
        draw(done({ online: true, meetingUrl: "https://meet.example.com/x" }));
        expect(screen.queryByRole("link", { name: "Directions" })).toBeNull();
        expect(
            screen.getByRole("link", { name: "https://meet.example.com/x" }),
        ).toBeVisible();
    });

    it("says an email went only when the API says so", () => {
        draw(done({ reach: null }));
        expect(screen.queryByText(/We've emailed/)).toBeNull();
        expect(screen.getByText("It's saved in your account.")).toBeVisible();
    });

    it("shows money as it was asked for, with no paise", () => {
        const { container } = draw(undefined, {
            gst: "Includes GST at 18%. The receipt shows the exact amount.",
        });
        expect(container.textContent).not.toMatch(/₹[\d,]+\.\d\d/);
        expect(screen.getByText(/Paid ₹2,500 online\./)).toBeVisible();
    });

    it("says a treatment's first visit, the rest booked with the business", () => {
        draw(undefined, { visits: 3 });
        expect(
            screen.getByText("Visit 1 of 3. We'll book the rest with you then"),
        ).toBeVisible();
    });

    it("keeps Move or cancel and Book another time", () => {
        draw();
        expect(
            screen.getByRole("link", {
                name: "Move or cancel it from your bookings",
            }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Book another time" }),
        ).toBeVisible();
    });

    it("fades in once, by the look's rule", () => {
        const { container } = draw();
        expect(container.querySelector("[data-booking-done]")).toHaveAttribute(
            "data-site-fade",
        );
    });
});
