// @vitest-environment jsdom
/**
 * The one sheet and the one dialog (`FormSheet`, `FormDialog`), against
 * their one set of rules (`overlay-form.tsx`): the foot's order and words,
 * what closes it clean and dirty, what a save in flight blocks, where the
 * keyboard starts and goes back to, and what a refusal leaves.
 */
import type { ReactNode } from "react";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormDialog } from "./form-dialog";
import { FormSheet, FormSheetBody, FormSheetFoot } from "./form-sheet";
import { pressOutside } from "./press-outside.test-kit";
import { readDraft } from "./use-draft-changed";

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
function type(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
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
const footButtons = () =>
    Array.from(dialog()?.querySelectorAll("[data-overlay-foot] button") ?? []);

type Frame = typeof FormSheet | typeof FormDialog;

/** A sheet or dialog with a box, a chip and a picker, as the real ones have. */
function Settings({
    as: As = FormSheet,
    pending = false,
    dirty,
    saveLabel,
    savingLabel,
    cancelLabel,
    tone,
    invalid = false,
    extra,
}: {
    as?: Frame;
    pending?: boolean;
    dirty?: boolean;
    saveLabel?: string;
    savingLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "destructive";
    invalid?: boolean;
    extra?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("Hill Road");
    const [late, setLate] = useState(false);
    const [day, setDay] = useState("Monday");
    const [bad, setBad] = useState(false);
    return (
        <>
            <button type="button" id="edit-name" onClick={() => setOpen(true)}>
                Edit
            </button>
            <As
                title="Name"
                description="What customers see."
                open={open}
                pending={pending}
                dirty={dirty}
                saveLabel={saveLabel}
                savingLabel={savingLabel}
                cancelLabel={cancelLabel}
                tone={tone}
                extra={extra}
                onClose={() => {
                    onClose();
                    setOpen(false);
                }}
                onSubmit={() => {
                    onSubmit();
                    if (invalid) setBad(true);
                }}
            >
                <input
                    aria-label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <input
                    aria-label="Phone"
                    aria-invalid={bad || undefined}
                    defaultValue=""
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
            </As>
        </>
    );
}

async function open(node: ReactNode) {
    act(() => root.render(node));
    await press(button("Edit", host));
    expect(dialog()).not.toBe(null);
}

describe.each([
    ["FormSheet", FormSheet],
    ["FormDialog", FormDialog],
] as const)("%s", (_name, As) => {
    describe("a press outside", () => {
        it("closes it while nothing has changed", async () => {
            await open(<Settings as={As} />);
            await pressOutside();
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(dialog()).toBe(null);
        });

        it("still closes after a press inside that changed nothing", async () => {
            await open(<Settings as={As} />);
            await press(button("Show an example"));
            await pressOutside();
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it("does nothing once something is typed, and keeps it", async () => {
            await open(<Settings as={As} />);
            type(input("Name"), "Hill Road shop");
            await pressOutside();
            expect(onClose).not.toHaveBeenCalled();
            expect(input("Name").value).toBe("Hill Road shop");
        });

        it("closes again once what was typed is put back", async () => {
            await open(<Settings as={As} />);
            type(input("Name"), "Hill Road shop");
            type(input("Name"), "Hill Road");
            await pressOutside();
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it("does nothing once a chip is pressed or a picker shows another choice", async () => {
            await open(<Settings as={As} />);
            await press(button("Open late"));
            await pressOutside();
            expect(onClose).not.toHaveBeenCalled();
            await press(button("Open late"));
            await press(button("Monday"));
            await pressOutside();
            expect(onClose).not.toHaveBeenCalled();
        });

        it("follows the overlay's own word where it gives one", async () => {
            await open(<Settings as={As} dirty />);
            await pressOutside();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe("Cancel, Escape and the close button", () => {
        it.each(["Cancel", "Close"])(
            "%s closes and drops what was typed, unasked",
            async (name) => {
                await open(<Settings as={As} />);
                type(input("Name"), "Hill Road shop");
                await press(button(name));
                expect(onClose).toHaveBeenCalledTimes(1);
                expect(onSubmit).not.toHaveBeenCalled();
                expect(dialog()).toBe(null);
            },
        );

        it("Escape closes and drops what was typed", async () => {
            await open(<Settings as={As} />);
            type(input("Name"), "Hill Road shop");
            await escape();
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(onSubmit).not.toHaveBeenCalled();
        });
    });

    describe("the keyboard", () => {
        it("starts in the first field, and goes back to what opened it", async () => {
            await open(<Settings as={As} />);
            expect(document.activeElement).toBe(input("Name"));
            await press(button("Cancel"));
            expect(document.activeElement?.id).toBe("edit-name");
        });

        it("goes to the first field Save found wrong", async () => {
            await open(<Settings as={As} invalid />);
            await press(button("Save"));
            expect(onSubmit).toHaveBeenCalledTimes(1);
            // The focus moves a frame after Save answers: wait for it, or a
            // busy machine reads the button still focused.
            await vi.waitFor(() =>
                expect(document.activeElement).toBe(input("Phone")),
            );
            // A refusal keeps it open with what was there.
            expect(dialog()).not.toBe(null);
        });
    });

    describe("while a save is on its way", () => {
        it("nothing closes it, both buttons wait and the label says so", async () => {
            await open(<Settings as={As} />);
            act(() =>
                root.render(
                    <Settings as={As} pending savingLabel="Sending…" />,
                ),
            );
            await pressOutside();
            await escape();
            await press(button("Close"));
            expect(onClose).not.toHaveBeenCalled();
            expect(dialog()).not.toBe(null);
            expect(button("Cancel").disabled).toBe(true);
            expect(button("Sending…").getAttribute("aria-busy")).toBe("true");
        });
    });

    describe("the foot", () => {
        it("is the way out, then the overlay's own button, which is never off", async () => {
            await open(<Settings as={As} />);
            expect(footButtons().map((b) => b.textContent.trim())).toEqual([
                "Cancel",
                "Save",
            ]);
            const cancel = button("Cancel");
            const save = button("Save");
            expect(cancel.className).toContain("border");
            expect(save.getAttribute("type")).toBe("submit");
            expect(save.disabled).toBe(false);
            // Stacked on a phone with the button on top; a row beside it.
            const row = save.parentElement;
            expect(row?.className).toContain("flex-col-reverse");
            expect(row?.className).toContain("sm:flex-row");
            expect(row?.className).toContain("sm:justify-end");
        });

        it("says the verb and the thing for a create, and what is kept beside a cancel", async () => {
            await open(
                <Settings
                    as={As}
                    saveLabel="Cancel order"
                    cancelLabel="Keep order"
                    tone="destructive"
                />,
            );
            expect(footButtons().map((b) => b.textContent.trim())).toEqual([
                "Keep order",
                "Cancel order",
            ]);
            expect(button("Cancel order").className).toContain("destructive");
        });

        it("puts a quieter action at the far side", async () => {
            await open(
                <Settings
                    as={As}
                    extra={<button type="button">Delete</button>}
                />,
            );
            expect(footButtons().map((b) => b.textContent.trim())).toEqual([
                "Delete",
                "Cancel",
                "Save",
            ]);
        });
    });

    describe("Save on an edit", () => {
        it("just closes when the overlay says nothing changed", async () => {
            await open(<Settings as={As} dirty={false} />);
            await press(button("Save"));
            expect(onSubmit).not.toHaveBeenCalled();
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it("runs when it says something changed, or doesn't say", async () => {
            await open(<Settings as={As} />);
            await press(button("Save"));
            expect(onSubmit).toHaveBeenCalledTimes(1);
            expect(onClose).not.toHaveBeenCalled();
        });

        it("a create's button always runs", async () => {
            await open(<Settings as={As} dirty={false} saveLabel="Add note" />);
            await press(button("Add note"));
            expect(onSubmit).toHaveBeenCalledTimes(1);
        });
    });
});

describe("FormSheet: its two widths, and its title", () => {
    it("is the screen on a phone and 448px beside the page", async () => {
        await open(<Settings />);
        expect(dialog()?.className).toContain("w-full");
        expect(dialog()?.className).toContain("sm:max-w-md");
        const title = dialog()?.querySelector("h2");
        expect(title?.textContent).toBe("Name");
        expect(title?.className).toContain("font-display");
        expect(title?.className).toContain("text-lg");
        expect(dialog()?.textContent).toContain("What customers see.");
    });
});

describe("a sheet that draws its own parts", () => {
    function Note() {
        const [open, setOpen] = useState(true);
        const [busy, setBusy] = useState(false);
        return (
            <FormSheet
                wide
                open={open}
                title="Add note"
                description="Only your team sees it."
                onClose={() => {
                    onClose();
                    setOpen(false);
                }}
            >
                <FormSheetBody>
                    <input aria-label="Note" defaultValue="" />
                </FormSheetBody>
                <FormSheetFoot
                    saveLabel="Add note"
                    savingLabel="Adding…"
                    pending={busy}
                    onSubmit={() => {
                        onSubmit();
                        setBusy(true);
                    }}
                />
            </FormSheet>
        );
    }

    it("is wide, and its foot's button runs the draft's own save", async () => {
        act(() => root.render(<Note />));
        expect(dialog()?.className).toContain("sm:max-w-lg");
        await press(button("Add note"));
        expect(onSubmit).toHaveBeenCalledTimes(1);
        // The draft holds the save: nothing closes it meanwhile.
        expect(button("Adding…").getAttribute("aria-busy")).toBe("true");
        await escape();
        expect(onClose).not.toHaveBeenCalled();
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
