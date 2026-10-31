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
    SHEET_ON_PHONE,
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

/**
 * DEC-202: below `sm` every dialog is a bottom sheet, in the bottom
 * FormSheet's look; at a desk it is the centred dialog it always was. The
 * phone look is `max-sm:` classes only, so a caller's own classes (a
 * width, `p-0`, `sm:rounded-xl`) can't fight it.
 */
describe("a dialog on a phone is a bottom sheet (DEC-202)", () => {
    const PHONE = [
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:top-auto",
        "max-sm:max-w-none",
        "max-sm:max-h-[92dvh]",
        "max-sm:translate-x-0",
        "max-sm:translate-y-0",
        "max-sm:rounded-t-[18px]",
        "max-sm:border-b-[length:env(safe-area-inset-bottom)]",
        "max-sm:data-[state=open]:slide-in-from-bottom",
        "max-sm:data-[state=closed]:slide-out-to-bottom",
    ];
    const DESK = [
        "fixed",
        "left-[50%]",
        "top-[50%]",
        "translate-x-[-50%]",
        "translate-y-[-50%]",
        "max-h-[calc(100dvh-2rem)]",
        "p-6",
        "sm:rounded-2xl",
        "data-[state=open]:slide-in-from-left-1/2",
        "data-[state=open]:slide-in-from-top-[48%]",
    ];

    it.each([
        [
            "DialogContent",
            "dialog",
            <Dialog key="d" open>
                <DialogContent size="sm" className="p-0 sm:rounded-xl">
                    <DialogTitle>Rename</DialogTitle>
                    <DialogDescription>One field.</DialogDescription>
                </DialogContent>
            </Dialog>,
        ],
        [
            "AlertDialogContent",
            "alertdialog",
            <AlertDialog key="a" open>
                <AlertDialogContent className="max-w-[420px] p-0">
                    <AlertDialogTitle>Delete page?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Gone for good.
                    </AlertDialogDescription>
                </AlertDialogContent>
            </AlertDialog>,
        ],
    ] as const)(
        "%s keeps the desk classes and adds only phone ones",
        (_, role, tree) => {
            render(tree);
            const dialog = screen.getByRole(role);
            for (const rule of PHONE) expect(dialog).toHaveClass(rule);
            for (const rule of DESK.filter(
                (r) => r !== "p-6" && r !== "sm:rounded-2xl",
            )) {
                expect(dialog).toHaveClass(rule);
            }
            // Every class it adds is phone-only, and none is lost to a
            // caller's class.
            const phone = SHEET_ON_PHONE.split(" ");
            expect(phone.every((c) => c.startsWith("max-sm:"))).toBe(true);
            for (const rule of phone) expect(dialog).toHaveClass(rule);
            // The caller's own classes still win where they were set.
            expect(dialog).toHaveClass("p-0");
            expect(dialog).not.toHaveClass("p-6");
        },
    );

    it("keeps every desk class with no caller classes", () => {
        render(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Rename</DialogTitle>
                    <DialogDescription>One field.</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        const dialog = screen.getByRole("dialog");
        for (const rule of DESK) expect(dialog).toHaveClass(rule);
    });

    it("draws the sheet's grab handle on a phone only, unheard", () => {
        render(
            <AlertDialog open>
                <AlertDialogContent>
                    <AlertDialogTitle>Leave?</AlertDialogTitle>
                    <AlertDialogDescription>Unsaved.</AlertDialogDescription>
                </AlertDialogContent>
            </AlertDialog>,
        );
        const handle = screen.getByRole("alertdialog").firstElementChild;
        expect(handle).toHaveAttribute("aria-hidden");
        expect(handle).toHaveClass("sm:hidden");
        expect(handle).toHaveClass("absolute");
        expect(handle).toHaveClass("h-[5px]");
    });
});
