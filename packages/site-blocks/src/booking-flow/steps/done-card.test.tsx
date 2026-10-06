import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import type { Phase } from "../flow-state";
import type { BookResult } from "../model";
import { DoneCard } from "./done-card";

/**
 * The booking confirmation's "Or pay ahead" (R32): a booking to pay at the
 * desk shows how the business takes payment ahead, when it says; a booking
 * paid online, with a credit, or with nothing to pay does not. Made-up
 * details only.
 */

const BOOKING: BookResult = {
    reference: "BK-1042",
    startAt: "2026-10-12T04:30:00.000Z",
    endAt: "2026-10-12T05:30:00.000Z",
    serviceName: "Haircut",
    online: false,
    meetingUrl: null,
    state: "CONFIRMED",
    holdExpiresAt: null,
    payToken: null,
    payInstructions: {
        upiId: "rye.studio@okexample",
        bankAccountName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankName: null,
        note: null,
    },
};

function done(over: Partial<Extract<Phase, { kind: "done" }>> = {}) {
    const phase: Extract<Phase, { kind: "done" }> = {
        kind: "done",
        booking: BOOKING,
        paid: false,
        price: "₹600",
        when: "Mon 12 Oct, 10:00",
        first: "Asha",
        ...over,
    };
    return render(
        <DoneCard
            phase={phase}
            headingRef={createRef()}
            business="Rye"
            where={null}
            rules={{
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
            }}
            onAgain={() => undefined}
        />,
    );
}

describe("DoneCard: how to pay ahead (R32)", () => {
    it("a desk booking with something to pay shows the business's UPI", () => {
        done();
        expect(
            screen.getByText("Pay ₹600 at the front desk when you arrive."),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Or pay ahead" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Rye also takes payment by UPI before you arrive.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open in a UPI app" }),
        ).toHaveAttribute(
            "href",
            expect.stringContaining("tn=Booking%20BK-1042"),
        );
    });

    it("says nothing more when the business set none", () => {
        done({ booking: { ...BOOKING, payInstructions: null } });
        expect(screen.queryByText("Or pay ahead")).toBeNull();
    });

    it("never on a booking paid online, with a credit, or free", () => {
        const { unmount } = done({ paid: true });
        expect(screen.queryByText("Or pay ahead")).toBeNull();
        unmount();
        const credit = done({ creditText: "Used 1 credit from your pack." });
        expect(screen.queryByText("Or pay ahead")).toBeNull();
        credit.unmount();
        done({ price: null });
        expect(screen.queryByText("Or pay ahead")).toBeNull();
    });
});
