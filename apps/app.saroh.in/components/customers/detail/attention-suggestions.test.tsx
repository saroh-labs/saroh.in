import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AttentionEntry } from "@/lib/customer-workspace/attention";

import { AttentionSuggestions } from "./attention-suggestions";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/customer-workspace/actions", () => ({
    confirmAttentionAction: vi.fn(),
    removeAttentionAction: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    dismissToast: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
}));

/**
 * C12's booking-note card, as the design writes it (DEC-073): who wrote it
 * by their full name, and the sensitive tick naming the roles whose people
 * can read it.
 */

const NOW = new Date("2026-09-29T10:00:00Z");

const note: AttentionEntry = {
    id: "a1",
    kind: "MEDICAL",
    label: "I take amlodipine 5mg for blood pressure",
    detail: "I take amlodipine 5mg for blood pressure. Please check before the numbing.",
    sensitive: true,
    allergen: null,
    source: "BOOKING_PAGE",
    status: "SUGGESTED",
    bookingId: "bk_1",
    createdByUserId: null,
    addedBy: null,
    createdAt: "2026-09-18T05:12:00Z",
    updatedAt: "2026-09-18T05:12:00Z",
};

const render = (
    over: Partial<Parameters<typeof AttentionSuggestions>[0]> = {},
): string =>
    renderToStaticMarkup(
        <AttentionSuggestions
            contactId="c1"
            suggestions={[note]}
            choices={[]}
            name="Rahul Verma"
            sensitiveRoles={["Dentist", "Owner"]}
            timeZone="Asia/Kolkata"
            now={NOW}
            {...over}
        />,
    );

describe("AttentionSuggestions (C12, DEC-073)", () => {
    it("says who wrote it by their full name", () => {
        expect(render()).toContain(
            "Rahul Verma wrote this when booking online, 18 Sep at 10:42",
        );
    });

    it("names the roles that can read a sensitive note", () => {
        expect(render()).toContain(
            "Sensitive — only people who can see sensitive notes (Dentist, Owner) can read it",
        );
    });

    it("keeps the rule without names when the roles couldn't be read", () => {
        const html = render({ sensitiveRoles: null });
        expect(html).toContain(
            "Sensitive — only people who can see sensitive notes can read it",
        );
        expect(html).not.toContain("(Dentist");
    });

    it("offers no tick to a role that can't mark a note sensitive", () => {
        const html = render({ canSensitive: false });
        expect(html).not.toContain("Sensitive — only people");
        expect(html).toContain("Your role can&#x27;t add sensitive notes");
    });
});
