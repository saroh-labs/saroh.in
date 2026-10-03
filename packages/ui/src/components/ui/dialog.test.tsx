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
