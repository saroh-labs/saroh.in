import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "./alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "./dialog";

/**
 * A dialog never outgrows a phone (pre-launch polish P2). One long email
 * in a row used to set a dialog's width — a grid item's `min-width: auto`
 * — and push its buttons off a 320px screen. The rule is three classes:
 * one column that may shrink to nothing (`minmax(0,1fr)`), words that break
 * rather than overflow, and a height capped at the screen's with the rest
 * scrolling inside. Whether it holds at 320px is
 * `e2e/tests/phone-reflow.spec.ts`'s to say; this pins the classes.
 */

const RULES = [
    "grid-cols-[minmax(0,1fr)]",
    "break-words",
    "max-h-[calc(100dvh-2rem)]",
    "overflow-y-auto",
];

describe("DialogContent on a phone", () => {
    it("keeps one shrinkable column, breaks long words and scrolls inside", () => {
        render(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Link a commerce customer</DialogTitle>
                    <DialogDescription>
                        Confirm the same person.
                    </DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        const dialog = screen.getByRole("dialog");
        for (const rule of RULES) expect(dialog).toHaveClass(rule);
    });

    it("lets a dialog that draws its own frame clip instead", () => {
        render(
            <Dialog open>
                <DialogContent className="overflow-hidden p-0">
                    <DialogTitle>Invite</DialogTitle>
                    <DialogDescription>They get an email.</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveClass("overflow-hidden");
        expect(dialog).not.toHaveClass("overflow-y-auto");
        expect(dialog).toHaveClass("grid-cols-[minmax(0,1fr)]");
    });
});

describe("AlertDialogContent on a phone", () => {
    it("follows the same rules", () => {
        render(
            <AlertDialog open>
                <AlertDialogContent>
                    <AlertDialogTitle>Send ₹450?</AlertDialogTitle>
                    <AlertDialogDescription>
                        To a very long address.
                    </AlertDialogDescription>
                </AlertDialogContent>
            </AlertDialog>,
        );
        const dialog = screen.getByRole("alertdialog");
        for (const rule of RULES) expect(dialog).toHaveClass(rule);
    });
});

/**
 * What every dialog and sheet shares, baked into the primitives so no
 * caller patches it: three widths by the size of the task, the display
 * title, a close target that is 44px on touch, and a footer whose buttons
 * never touch when they stack on a phone.
 */
describe("the dialog's sizes, title, close target and footer", () => {
    const open = (size?: "sm" | "md" | "lg") => {
        render(
            <Dialog open>
                <DialogContent size={size}>
                    <DialogTitle>Rename category</DialogTitle>
                    <DialogDescription>Its products keep it.</DialogDescription>
                    <DialogFooter>
                        <button type="button">Cancel</button>
                        <button type="button">Save</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>,
        );
        return screen.getByRole("dialog");
    };

    it.each([
        ["sm", "max-w-[420px]"],
        ["md", "max-w-[460px]"],
        ["lg", "max-w-[560px]"],
    ] as const)("%s is %s", (size, width) => {
        expect(open(size)).toHaveClass(width);
    });

    it("keeps the width it had with no size", () => {
        expect(open()).toHaveClass("max-w-lg");
    });

    it("sets the title in the display face at 18px", () => {
        open("sm");
        const title = screen.getByRole("heading", { name: "Rename category" });
        expect(title).toHaveClass("font-display");
        expect(title).toHaveClass("text-lg");
    });

    it("gives Close a real target, 44px on a touch pointer", () => {
        open("sm");
        const close = screen.getByRole("button", { name: "Close" });
        expect(close).toHaveClass("size-[30px]");
        expect(close).toHaveClass("coarse:size-11");
    });

    it("stacks the footer on a phone with a gap, the dialog's button on top", () => {
        open("sm");
        const footer = screen.getByRole("button", {
            name: "Save",
        }).parentElement;
        expect(footer).toHaveClass("flex-col-reverse");
        expect(footer).toHaveClass("gap-2");
        expect(footer).toHaveClass("sm:flex-row");
        expect(footer).toHaveClass("sm:justify-end");
        expect(footer?.className).not.toContain("space-x");
    });

    it("can go without Close where only its buttons may close it", () => {
        render(
            <Dialog open>
                <DialogContent closeButton={false}>
                    <DialogTitle>Working</DialogTitle>
                    <DialogDescription>A moment.</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    });
});
