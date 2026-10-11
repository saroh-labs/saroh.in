import { Slot } from "@radix-ui/react-slot";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Tip } from "./tooltip";

/**
 * `Tip` often stands between a trigger and its control:
 * `<DropdownMenuTrigger asChild><Tip label="More actions"><Button /></Tip>`.
 * The trigger hands its ref, handlers and state to its child, which is the
 * Tip; a Tip that kept them left a button that opened nothing (Customer
 * Detail's ⋯ menu, Settings search, the rail's flyout, the editor's link).
 */
describe("Tip between a trigger and its control", () => {
    for (const label of ["More actions", undefined]) {
        const named = label ? "with a label" : "with no label";

        it(`passes the trigger's handlers and state to the control, ${named}`, () => {
            const onPointerDown = vi.fn();
            const onClick = vi.fn();
            render(
                <Slot
                    onPointerDown={onPointerDown}
                    aria-haspopup="menu"
                    data-state="open"
                >
                    <Tip label={label}>
                        <button type="button" onClick={onClick}>
                            ⋯
                        </button>
                    </Tip>
                </Slot>,
            );
            const button = screen.getByRole("button");
            fireEvent.pointerDown(button);
            fireEvent.click(button);
            expect(onPointerDown).toHaveBeenCalledTimes(1);
            // The control's own handler still runs.
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(button).toHaveAttribute("aria-haspopup", "menu");
            // The trigger's state, not the tooltip's: the button styles on it.
            expect(button).toHaveAttribute("data-state", "open");
        });

        it(`passes the trigger's ref to the control, ${named}`, () => {
            const ref = React.createRef<HTMLElement>();
            render(
                <Slot ref={ref}>
                    <Tip label={label}>
                        <button type="button">⋯</button>
                    </Tip>
                </Slot>,
            );
            expect(ref.current).toBe(screen.getByRole("button"));
        });
    }

    it("still describes the control with its hint", () => {
        render(
            <Tip label="More actions">
                <button type="button">⋯</button>
            </Tip>,
        );
        expect(screen.getByRole("button")).toHaveAttribute(
            "aria-description",
            "More actions",
        );
    });

    it("is the control alone when there is no hint and nothing handed down", () => {
        const { container } = render(
            <Tip label={undefined}>
                <button type="button">Save</button>
            </Tip>,
        );
        expect(container.innerHTML).toBe('<button type="button">Save</button>');
    });
});
