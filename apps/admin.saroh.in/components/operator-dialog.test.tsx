/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorSubmit } from "./operator-dialog";
import { OperatorDialog } from "./operator-dialog";

afterEach(cleanup);

describe("OperatorDialog", () => {
    it("sends a key when its parent opens it (Releases' switches)", async () => {
        const onSubmit = vi.fn().mockResolvedValue({ ok: true });
        const props = {
            title: "Turn it on for everyone?",
            effect: <p>Everyone gets it.</p>,
            submitLabel: "Turn on for everyone",
            onSubmit,
            onOpenChange: vi.fn(),
        };
        const { rerender } = render(<OperatorDialog {...props} open={false} />);
        rerender(<OperatorDialog {...props} open />);
        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "local calendar test" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Turn on for everyone" }),
        );
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        const [input] = onSubmit.mock.calls[0] as [OperatorSubmit];
        expect(input.idempotencyKey).toMatch(/\S{8,}/);
    });
});
