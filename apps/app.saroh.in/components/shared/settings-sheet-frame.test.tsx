// @vitest-environment jsdom
/**
 * How a sheet closes, in the one frame every settings-style sheet shares
 * and in the frames beside it: a press outside closes it while nothing has
 * changed and does nothing once the draft differs from what it opened
 * with. Cancel, Escape and the close button still close and drop the
 * draft, and nothing closes while a save is on its way.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Sheet } from "@saroh/ui/sheet";
import type { ReactNode } from "react";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import {
    ActionSheetContent,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";
import { pressOutside } from "@/components/shared/press-outside.test-kit";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import { readDraft } from "@/components/shared/use-draft-changed";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/leads/actions", () => ({ createLead: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();
const onSubmit = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onClose.mockReset();
    onSubmit.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function button(name: string, within: ParentNode | null = dialog()) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 0));
    });
}
async function escape() {
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 0));
    });
}
const input = (label: string) => {
    const el = dialog()?.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
    );
    if (!el) throw new Error(`No field ${label}`);
    return el;
};

/** A settings sheet with a box, a chip and a picker, as the real ones have. */
function Settings({
    pending = false,
    dirty,
    extra,
}: {
    pending?: boolean;
    dirty?: boolean;
    extra?: ReactNode;
}) {
    const [open, setOpen] = useState(true);
    const [name, setName] = useState("Hill Road");
    const [late, setLate] = useState(false);
    const [day, setDay] = useState("Monday");
    return (
        <>
            <button type="button" id="edit-name" onClick={() => setOpen(true)}>
                Edit
            </button>
            <SettingsSheetFrame
                returnFocusTo="edit-name"
                title="Name"
                description="What customers see."
                open={open}
                pending={pending}
                dirty={dirty}
                onClose={() => {
                    onClose();
                    setOpen(false);
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                }}
            >
                <input
                    aria-label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <button
                    type="button"
                    aria-pressed={late}
                    onClick={() => setLate((v) => !v)}
                >
                    Open late
                </button>
                <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setDay("Tuesday")}
                >
                    {day}
                </button>
                <button type="button">Show an example</button>
                {extra}
            </SettingsSheetFrame>
        </>
    );
}

describe("SettingsSheetFrame: a press outside", () => {
    it("closes the sheet while nothing has changed", async () => {
        act(() => root.render(<Settings />));
        expect(dialog()).not.toBe(null);
        await pressOutside();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
    });

    it("still closes after a press inside that changed nothing", async () => {
        act(() => root.render(<Settings />));
        await press(button("Show an example"));
        await pressOutside();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does nothing once something is typed", async () => {
        act(() => root.render(<Settings />));
        type(input("Name"), "Hill Road shop");
        await pressOutside();
        expect(onClose).not.toHaveBeenCalled();
        expect(dialog()).not.toBe(null);
        expect(input("Name").value).toBe("Hill Road shop");
    });

    it("closes again once what was typed is put back", async () => {
        act(() => root.render(<Settings />));
        type(input("Name"), "Hill Road shop");
        type(input("Name"), "Hill Road");
        await pressOutside();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does nothing once a chip is pressed or a picker shows another choice", async () => {
        act(() => root.render(<Settings />));
        await press(button("Open late"));
        await pressOutside();
        expect(onClose).not.toHaveBeenCalled();

        await press(button("Open late"));
        await press(button("Monday"));
        await pressOutside();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("follows the sheet's own word where it gives one", async () => {
        act(() => root.render(<Settings dirty />));
        await pressOutside();
        expect(onClose).not.toHaveBeenCalled();

        act(() => root.render(<Settings dirty={false} />));
        type(input("Name"), "Hill Road shop");
        await pressOutside();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("SettingsSheetFrame: Cancel, Escape and the close button", () => {
    it.each(["Cancel", "Close"])(
        "%s closes and drops what was typed",
        async (name) => {
            act(() => root.render(<Settings />));
            type(input("Name"), "Hill Road shop");
            await press(button(name));
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(onSubmit).not.toHaveBeenCalled();
            expect(dialog()).toBe(null);
        },
    );

    it("Escape closes and drops what was typed", async () => {
        act(() => root.render(<Settings />));
        type(input("Name"), "Hill Road shop");
        await escape();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("the keyboard goes back to the row's Edit", async () => {
        act(() => root.render(<Settings />));
        await press(button("Cancel"));
        expect(document.activeElement?.id).toBe("edit-name");
    });
});

describe("SettingsSheetFrame: while a save is on its way", () => {
    it("nothing closes it", async () => {
        act(() => root.render(<Settings pending />));
        await pressOutside();
        await escape();
        await press(button("Close"));
        expect(onClose).not.toHaveBeenCalled();
        expect(dialog()).not.toBe(null);
        expect(button("Cancel").disabled).toBe(true);
        expect(button("Saving…").disabled).toBe(true);
    });
});

describe("SettingsSheetFrame: the foot", () => {
    it("keeps its button first, then Cancel", () => {
        act(() => root.render(<Settings />));
        const names = Array.from(
            dialog()?.querySelectorAll("form > div:last-child button") ?? [],
        ).map((b) => b.textContent.trim());
        expect(names).toEqual(["Save", "Cancel"]);
    });
});

describe("readDraft", () => {
    const form = (html: string) => {
        const el = document.createElement("form");
        el.innerHTML = html;
        return el;
    };

    it("reads boxes, ticks, choices, chips, pickers and pictures", () => {
        const a = form(
            '<input name="n" value="1"><input type="checkbox" checked><select><option selected>a</option></select><textarea>t</textarea><button aria-pressed="true">x</button><button aria-haspopup="dialog">12 Oct</button><img src="/a.png"><div contenteditable="true"><p>Open daily</p></div>',
        );
        const same = form(a.innerHTML);
        expect(readDraft(a)).toBe(readDraft(same));
        for (const changed of [
            a.innerHTML.replace('value="1"', 'value="2"'),
            a.innerHTML.replace(" checked", ""),
            a.innerHTML.replace('aria-pressed="true"', 'aria-pressed="false"'),
            a.innerHTML.replace("12 Oct", "13 Oct"),
            a.innerHTML.replace("/a.png", "/b.png"),
            a.innerHTML.replace("Open daily", "Open daily, 9 to 6"),
            a.innerHTML + '<input name="row2" value="">',
        ]) {
            expect(readDraft(form(changed)), changed).not.toBe(readDraft(a));
        }
    });

    it("ignores what isn't the draft: a plain button's words, a note", () => {
        const a = form('<input name="n" value="1"><button>Save</button>');
        const b = form(
            '<input name="n" value="1"><button>Saving…</button><p>Saved</p>',
        );
        expect(readDraft(a)).toBe(readDraft(b));
    });
});

describe("ActionSheetContent: a press outside", () => {
    function Note({ dirty }: { dirty: boolean }) {
        const [open, setOpen] = useState(true);
        return (
            <Sheet
                open={open}
                onOpenChange={(o) => {
                    if (!o) onClose();
                    setOpen(o);
                }}
            >
                <ActionSheetContent
                    title="Add a note"
                    description="Only your team sees it."
                    dirty={dirty}
                >
                    <ActionSheetFooter />
                </ActionSheetContent>
            </Sheet>
        );
    }

    it("closes it while nothing is typed", async () => {
        act(() => root.render(<Note dirty={false} />));
        await pressOutside();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does nothing once something is typed, and Cancel still closes", async () => {
        act(() => root.render(<Note dirty />));
        await pressOutside();
        expect(onClose).not.toHaveBeenCalled();
        await press(button("Cancel"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("a long dialog that holds typed work: Add a lead", () => {
    const render = () =>
        act(() =>
            root.render(
                <AddLeadDialog
                    contacts={[]}
                    stages={[{ id: "s1", name: "New" }]}
                />,
            ),
        );

    it("a press outside closes it while nothing is typed", async () => {
        render();
        await press(button("Add a lead", host));
        expect(dialog()).not.toBe(null);
        await pressOutside();
        expect(dialog()).toBe(null);
    });

    it("and does nothing once something is typed; Cancel still closes", async () => {
        render();
        await press(button("Add a lead", host));
        const what = dialog()?.querySelector("textarea");
        if (!what) throw new Error("No field");
        type(what, "Asked about weekend classes");
        await pressOutside();
        expect(dialog()).not.toBe(null);
        expect(what.value).toBe("Asked about weekend classes");
        await press(button("Cancel"));
        expect(dialog()).toBe(null);
    });
});

/**
 * The rule lives in one place: every settings-style sheet draws the shared
 * frame, the copies are gone, and the long dialogs ask the same reader.
 */
describe("every frame follows the one rule", () => {
    const APP = path.resolve(__dirname, "../..");
    const read = (file: string) => readFileSync(path.join(APP, file), "utf8");
    const SHARED = 'from "@/components/shared/settings-sheet-frame"';

    it.each([
        "components/stores/place-sheets.tsx",
        "components/stores/tax-rate-sheet.tsx",
        "components/stores/delivery-way-sheet.tsx",
        "components/stores/invite-person-sheet.tsx",
        "components/bookings/availability/add-time-off-sheet.tsx",
        "components/organizations/business-field-sheet.tsx",
        "components/organizations/business-hours-sheet.tsx",
        "components/organizations/business-logo-sheet.tsx",
        "components/organizations/pay-instructions-sheet.tsx",
        "components/sites/sells-from-row.tsx",
        "components/sites/settings/site-icon-sheet.tsx",
        "components/sites/settings/menu-footer-sheets.tsx",
        "components/sites/settings/search-sharing-sheets.tsx",
        "components/sites/search-tracking/verification-field.tsx",
        "components/sites/search-tracking/privacy-field.tsx",
        "components/commerce/product-settings/option-sheet.tsx",
        "components/commerce/product-settings/field-sheet.tsx",
        "components/commerce/product-settings/category-merge-sheet.tsx",
    ])("%s draws the shared frame, not a sheet of its own", (file) => {
        const src = read(file);
        expect(src).toContain(SHARED);
        expect(src).not.toContain("<SheetContent");
        expect(src).not.toContain("<SheetFooter");
    });

    it("the two copied frames are gone", () => {
        expect(
            existsSync(
                path.join(
                    APP,
                    "components/commerce/product-settings/settings-sheet.tsx",
                ),
            ),
        ).toBe(false);
        expect(
            read("components/sites/settings/settings-sheet.tsx"),
        ).not.toContain("SheetContent");
    });

    it("the frame is where an outside press is answered", () => {
        const frame = read("components/shared/settings-sheet-frame.tsx");
        expect(frame).toContain("onInteractOutside");
        expect(frame).toContain("useDraftChanged");
    });

    it.each([
        "components/bookings/new-booking-dialog.tsx",
        "components/leads/add-lead-dialog.tsx",
        "components/organizations/team-screen.tsx",
    ])("%s holds its typed work against an outside press", (file) => {
        const src = read(file);
        expect(src).toContain("useDraftChanged");
        expect(src).toMatch(
            /onInteractOutside=\{[\s\S]{0,400}draftChanged\(\)/,
        );
    });

    it("the order sheets tell their frame what is typed", () => {
        for (const panel of [
            "cancel",
            "courier",
            "edit",
            "fulfilment",
            "refund",
        ]) {
            expect(
                read(`components/commerce/order-detail/${panel}-panel.tsx`),
                panel,
            ).toContain("useOrderSheetDraft(");
        }
        expect(
            read("components/commerce/order-detail/order-sheet.tsx"),
        ).toMatch(/dirty=\{dirty/);
    });
});
