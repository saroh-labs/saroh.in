// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetailNote } from "@/lib/customer-workspace/detail";

import { Notes } from "./notes";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));
const addNoteAction = vi.fn();
vi.mock("@/lib/customer-workspace/actions", () => ({
    addNoteAction: (...args: unknown[]) => addNoteAction(...args) as unknown,
    deleteNoteAction: vi.fn(),
}));
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showUndo: vi.fn(),
}));

/**
 * Customer Detail's Notes tab (U8, Z2a): text only. No allergen picker and
 * no allergy chips — an allergy is on Needs attention.
 *
 * Read first (owner, 10 Oct): the tab is the list, and "Add note" opens a
 * side sheet with the field. Drawn with `react-dom/client` + `act` on the
 * real sheet, so its dialog role, name and focus return are what is tested.
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

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    refresh.mockReset();
    addNoteAction.mockReset();
    showError.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function render(rows: DetailNote[], canWrite = true) {
    act(() =>
        root.render(
            <Notes
                contactId="c1"
                rows={rows}
                canWrite={canWrite}
                userId="u2"
                timeZone="Asia/Kolkata"
                now={NOW}
            />,
        ),
    );
    return host.innerHTML;
}

function buttons(name: string, within: ParentNode | null = host) {
    return Array.from(within?.querySelectorAll("button") ?? []).filter(
        (b) => b.textContent.trim() === name,
    );
}

const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");

function dialogName() {
    const id = dialog()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
}

async function press(el: HTMLElement | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

function type(value: string) {
    const el = dialog()?.querySelector("textarea");
    if (!el) throw new Error("No field");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function submit() {
    const form = dialog()?.querySelector("form");
    if (!form) throw new Error("No form");
    await act(async () => {
        form.requestSubmit();
        await new Promise((r) => setTimeout(r, 0));
    });
    // A closing sheet hands the keyboard back on the next tick.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("the Notes tab", () => {
    it("is the list first: notes show with no field open", () => {
        const html = render([note()]);
        expect(html).toContain("Collects on Saturdays before 8.");
        expect(buttons("Add note")).toHaveLength(1);
        expect(dialog()).toBe(null);
        expect(document.body.querySelector("textarea")).toBe(null);
    });

    it("offers text only: no allergen picker", async () => {
        render([note()]);
        await press(buttons("Add note")[0]);
        expect(dialogName()).toBe("Add note");
        expect(dialog()?.querySelectorAll("textarea")).toHaveLength(1);
        expect(dialog()?.querySelector('[role="group"]')).toBe(null);
        expect(dialog()?.querySelector("[aria-pressed]")).toBe(null);
        expect(dialog()?.innerHTML).not.toMatch(/Allergy<\/span>/);
    });

    it("points an allergy to Needs attention when there are no notes", () => {
        const html = render([]);
        expect(html).toContain("No notes yet");
        expect(html).toContain(
            "An allergy goes on Needs attention, where orders are checked against it.",
        );
    });

    it("puts the one Add note in the empty state", async () => {
        render([]);
        expect(buttons("Add note")).toHaveLength(1);
        await press(buttons("Add note")[0]);
        expect(dialogName()).toBe("Add note");
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
        for (const rows of [[note()], []]) {
            const html = render(rows, false);
            expect(html).toContain(
                "Your role can read these notes but not add them.",
            );
            expect(html).not.toContain("Add note");
        }
    });
});

describe("the Add note sheet", () => {
    it("keeps the sheet open with what was typed when it is refused", async () => {
        addNoteAction.mockResolvedValue({
            ok: false,
            error: "Your role can't add notes.",
        });
        render([note()]);
        await press(buttons("Add note")[0]);
        type("Likes the corner table");
        await submit();

        expect(addNoteAction).toHaveBeenCalledWith("c1", {
            body: "Likes the corner table",
        });
        expect(showError).toHaveBeenCalledWith("Your role can't add notes.");
        expect(dialogName()).toBe("Add note");
        expect(dialog()?.querySelector("textarea")?.value).toBe(
            "Likes the corner table",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("closes on success and gives the keyboard back", async () => {
        addNoteAction.mockResolvedValue({ ok: true, data: note() });
        render([note()]);
        await press(buttons("Add note")[0]);
        type("  Likes the corner table  ");
        await submit();

        expect(addNoteAction).toHaveBeenCalledWith("c1", {
            body: "Likes the corner table",
        });
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
        expect(document.activeElement).toBe(buttons("Add note")[0]);
    });

    it("hands the keyboard to the button above the list after the first note", async () => {
        addNoteAction.mockResolvedValue({ ok: true, data: note() });
        render([]);
        await press(buttons("Add note")[0]);
        type("Likes the corner table");
        await submit();
        // The refresh brings the note back, and the empty state goes.
        render([note()]);

        expect(host.textContent).not.toContain("No notes yet");
        expect(document.activeElement).toBe(buttons("Add note")[0]);
    });

    it("won't add an empty note or one over the limit, and says which", async () => {
        render([note()]);
        await press(buttons("Add note")[0]);
        const add = () => buttons("Add note", dialog())[0];
        expect(add().disabled).toBe(true);
        expect(dialog()?.textContent).toContain("0 / 500");

        type("a".repeat(500));
        expect(add().disabled).toBe(false);
        expect(dialog()?.textContent).toContain("500 / 500");

        type("a".repeat(501));
        expect(add().disabled).toBe(true);
        expect(dialog()?.textContent).toContain("Over 500 characters");
    });
});
