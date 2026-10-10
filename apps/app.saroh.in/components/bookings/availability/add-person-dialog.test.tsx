// @vitest-environment jsdom
/**
 * "Add someone who takes bookings", from Availability and from the
 * calendar's "Nobody is on the diary yet": a button opens the dialog, so
 * nobody is sent to another page to type a name. A refusal keeps it open
 * with what was typed; someone added closes it and says where their hours
 * are set; Cancel drops the draft and the keyboard goes back to the button.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddPersonDialog } from "./add-person-dialog";

const createStaff = vi.fn();
vi.mock("@/lib/staff/actions", () => ({
    createStaff: (...a: unknown[]) => createStaff(...a) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
}));

let host: HTMLDivElement;
let root: Root;
const onAdded = vi.fn();

function Harness({ hoursHint }: { hoursHint?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Add someone
            </button>
            <AddPersonDialog
                open={open}
                onOpenChange={setOpen}
                onAdded={onAdded}
                hoursHint={hoursHint}
            />
        </>
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const m of [createStaff, refresh, showSuccess, onAdded]) m.mockReset();
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const opener = () => host.querySelector<HTMLButtonElement>("button");
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const dialogName = () => {
    const id = dialog()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const button = (name: string) =>
    Array.from(
        dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((b) => b.textContent === name);
const fields = () =>
    Array.from(dialog()?.querySelectorAll<HTMLInputElement>("input") ?? []);

async function press(el: HTMLElement | null | undefined) {
    await act(async () => {
        el?.focus();
        el?.click();
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}
function type(el: HTMLInputElement | undefined, value: string) {
    act(() => {
        if (!el) return;
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("Add someone who takes bookings", () => {
    it("is closed until the button, then a dialog of that name", async () => {
        act(() => root.render(<Harness />));
        expect(dialog()).toBeNull();
        await press(opener());
        expect(dialogName()).toBe("Add someone who takes bookings");
        expect(createStaff).not.toHaveBeenCalled();
    });

    it("keeps a refusal open with what was typed", async () => {
        createStaff.mockResolvedValue({
            ok: false,
            error: "Your team is full on this plan.",
        });
        act(() => root.render(<Harness />));
        await press(opener());
        type(fields()[0], "Asha");
        type(fields()[1], "Trainer");
        await press(button("Add them"));
        expect(createStaff).toHaveBeenCalledWith({
            name: "Asha",
            title: "Trainer",
        });
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Your team is full on this plan.",
        );
        expect(fields()[0]?.value).toBe("Asha");
        expect(fields()[1]?.value).toBe("Trainer");
        expect(onAdded).not.toHaveBeenCalled();
    });

    it("closes once they are added, and says where their hours are set", async () => {
        createStaff.mockResolvedValue({
            ok: true,
            data: { id: "st_asha", name: "Asha" },
        });
        act(() =>
            root.render(
                <Harness hoursHint="Set their hours in Availability." />,
            ),
        );
        await press(opener());
        type(fields()[0], " Asha ");
        await press(button("Add them"));
        expect(dialog()).toBeNull();
        expect(showSuccess).toHaveBeenCalledWith(
            "Asha is on the diary. Set their hours in Availability.",
        );
        expect(onAdded).toHaveBeenCalledWith("st_asha");
        expect(refresh).toHaveBeenCalled();
    });

    it("drops what was typed on Cancel, and goes back to the button", async () => {
        act(() => root.render(<Harness />));
        await press(opener());
        type(fields()[0], "Asha");
        await press(button("Cancel"));
        expect(dialog()).toBeNull();
        expect(createStaff).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(opener());
        await press(opener());
        expect(fields()[0]?.value).toBe("");
    });
});
