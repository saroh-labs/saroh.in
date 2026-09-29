import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DetailNote } from "@/lib/customer-workspace/detail";

import { Notes } from "./notes";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/customer-workspace/actions", () => ({
    addNoteAction: vi.fn(),
    deleteNoteAction: vi.fn(),
}));

/**
 * Customer Detail's Notes tab (U8, Z2a): text only. No allergen picker and
 * no allergy chips — an allergy is on Needs attention.
 */

const NOW = new Date("2026-09-29T10:00:00Z");

const note = (over: Partial<DetailNote> = {}): DetailNote => ({
    id: "n1",
    body: "Collects on Saturdays before 8.",
    createdByUserId: "u1",
    author: "Nisha Rao",
    createdAt: "2026-09-20T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z",
    ...over,
});

const render = (rows: DetailNote[], canWrite = true) =>
    renderToStaticMarkup(
        <Notes
            contactId="c1"
            rows={rows}
            canWrite={canWrite}
            userId="u2"
            timeZone="Asia/Kolkata"
            now={NOW}
        />,
    );

describe("the Notes tab", () => {
    it("offers text only: no allergen picker", () => {
        const html = render([]);
        expect(html).toContain("New note");
        expect(html).toContain("Add note");
        expect(html).not.toContain('role="group"');
        expect(html).not.toContain("aria-pressed");
        expect(html).not.toMatch(/Allergy<\/span>/);
    });

    it("points an allergy to Needs attention when there are no notes", () => {
        const html = render([]);
        expect(html).toContain("No notes yet");
        expect(html).toContain(
            "An allergy goes on Needs attention, where orders are checked against it.",
        );
    });

    it("shows a note's words and who wrote it, with no allergy chips", () => {
        // An API from before Z2a still sends the old fields; they aren't drawn.
        const old = {
            ...note(),
            allergens: [{ id: "al_nuts", name: "Nuts" }],
        } as DetailNote;
        const html = render([old]);
        expect(html).toContain("Collects on Saturdays before 8.");
        expect(html).toContain("Nisha");
        expect(html).not.toContain("Allergy: Nuts");
    });

    it("tells a role that can't write that it can only read", () => {
        const html = render([note()], false);
        expect(html).toContain(
            "Your role can read these notes but not add them.",
        );
        expect(html).not.toContain("Add note");
    });
});
