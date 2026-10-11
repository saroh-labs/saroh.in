import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "./dialog";
import { Tip } from "./tooltip";

/**
 * A hint is not a thing to close. With the keyboard on a control that has
 * one, the hint is showing, and Escape used to close only the hint: the
 * sheet or dialog the control sits in took a second press (the site
 * editor's block sheet on a phone, its Publish menu).
 */
describe("Escape with a hint showing", () => {
    function open() {
        render(
            <Dialog open onOpenChange={(next) => (state.open = next)}>
                <DialogContent>
                    <DialogTitle>Hero</DialogTitle>
                    <DialogDescription>The block's fields.</DialogDescription>
                    <Tip label="Move up">
                        <button type="button">Up</button>
                    </Tip>
                </DialogContent>
            </Dialog>,
        );
    }
    const state = { open: true };

    it("closes what the control sits in, at the first press", () => {
        state.open = true;
        open();
        const button = screen.getByRole("button", { name: "Up" });
        act(() => button.focus());
        // The keyboard is on it, so its hint is showing.
        expect(screen.getByRole("tooltip")).toHaveTextContent("Move up");

        fireEvent.keyDown(button, { key: "Escape" });
        expect(state.open).toBe(false);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("closes just the hint where there is nothing else to close", () => {
        render(
            <Tip label="Move up">
                <button type="button">Up</button>
            </Tip>,
        );
        const button = screen.getByRole("button", { name: "Up" });
        act(() => button.focus());
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
        fireEvent.keyDown(button, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).toBeNull();
    });
});
