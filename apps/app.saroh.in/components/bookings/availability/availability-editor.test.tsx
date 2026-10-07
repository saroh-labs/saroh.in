import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/staff/actions", () => ({
    addClosure: vi.fn(),
    addExtraHours: vi.fn(),
    addTimeOff: vi.fn(),
    removeClosures: vi.fn(),
    removeExtraHours: vi.fn(),
    removeTimeOffMany: vi.fn(),
    replaceStaffHours: vi.fn(),
    updateBookingRules: vi.fn(),
    addStaff: vi.fn(),
}));

import type { SaveOp } from "@/lib/services/availability-rules";
import type { BookingRules } from "@/lib/staff/types";

import {
    AvailabilityEditor,
    savedText,
    unsavedText,
} from "./availability-editor";

const RULES: BookingRules = {
    bookAheadDays: 21,
    latestBookingMinutes: 120,
    freeCancelHours: 12,
    refundInTimeCancels: true,
    bookingPayment: "BOTH",
};

function draw(canEdit = true): string {
    return renderToStaticMarkup(
        <AvailabilityEditor
            staff={[]}
            closures={[]}
            openingHours={null}
            rules={RULES}
            timezone="Asia/Kolkata"
            today="2026-10-07"
            kept={[]}
            bookedOn={{}}
            takesClasses={[]}
            canEdit={canEdit}
            onlineBlocker={null}
        />,
    );
}

describe("Availability with nobody on the diary (UX-022)", () => {
    it("still sets the business's booking rules: how people pay, cancellation, refunds", () => {
        const html = draw();
        expect(html).toContain("Nobody takes bookings yet");
        expect(html).toMatch(/<h2[^>]*>Booking rules<\/h2>/);
        expect(html).toContain("How people pay when they book");
        expect(html).toContain(">Add someone<");
        expect(html).toContain("each service in its own");
    });

    it("says it can't be changed to a role that can't", () => {
        expect(draw(false)).toContain(
            "Your role can see these rules but not change them.",
        );
    });

    it("saves a rule change as Save changes and says the rules were saved, never 'Hours saved'", () => {
        const rules: SaveOp = { kind: "rules", rules: RULES, before: RULES };
        const hours = {
            kind: "hours",
            staffId: "s1",
            hours: [],
            before: [],
        } as unknown as SaveOp;
        expect(savedText([rules])).toBe(
            "Booking rules saved. New bookings follow them now.",
        );
        expect(savedText([rules, hours])).toBe(
            "Saved. The calendar and booking page use them now.",
        );
        expect(unsavedText([rules])).toMatch(/New bookings follow the rules/);
        expect(savedText([rules])).not.toMatch(/Hours saved/);
    });
});
