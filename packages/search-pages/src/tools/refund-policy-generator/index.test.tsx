// The refund policy generator's states (RefundPolicyStates.dc.html):
// empty, written, no returns, services, no way to ask, the email for copy.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RefundPolicyGenerator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const doc = () => screen.getByRole("article", { name: "Your policy" });

function fillGulmohar() {
    type("Business name", "Gulmohar Handlooms");
    fireEvent.click(screen.getByLabelText("Products"));
    type(
        /Things you don't take back/,
        "Sale items, altered blouses, innerwear",
    );
    type("WhatsApp for returns", "99999 99999");
    type(/Email for returns/, "returns@example.com");
}

describe("RefundPolicyGenerator", () => {
    it("says where the policy appears before any answer", () => {
        render(<RefundPolicyGenerator />);
        expect(screen.queryByRole("article")).toBeNull();
        expect(
            screen.getByText(
                "Answer the questions and your policy is written here, in plain words.",
            ),
        ).toBeTruthy();
    });

    it("writes the policy as they answer, with the not-legal-advice note", () => {
        const { container } = render(<RefundPolicyGenerator />);
        fillGulmohar();
        expect(doc().textContent).toContain(
            "Returns and refunds, Gulmohar Handlooms",
        );
        expect(doc().textContent).toContain(
            "What we can't take back. Sale items, altered blouses and innerwear.",
        );
        expect(screen.getByRole("note").textContent).toContain(
            "Not legal advice.",
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("with no returns, says what happens to a damaged item", () => {
        render(<RefundPolicyGenerator />);
        fillGulmohar();
        fireEvent.click(screen.getByLabelText("No returns"));
        expect(doc().textContent).toContain("Damaged or wrong item.");
        expect(
            screen.queryByLabelText(/Things you don't take back/),
        ).toBeNull();
    });

    it("asks different questions for a service", () => {
        render(<RefundPolicyGenerator />);
        type("Business name", "Rye Studio");
        fireEvent.click(screen.getByLabelText("Services"));
        expect(
            screen.getByText("If they're unhappy with a service"),
        ).toBeTruthy();
        expect(doc().textContent).toContain("Refunds, Rye Studio");
    });

    it("marks the gap and the field when there's no way to ask", () => {
        render(<RefundPolicyGenerator />);
        fireEvent.click(screen.getByLabelText("Products"));
        fireEvent.blur(screen.getByLabelText("WhatsApp for returns"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Add a WhatsApp number or an email, so customers know where to ask.",
        );
        expect(doc().textContent).toContain("[your WhatsApp or email]");
    });

    it("reading is free; copying and printing ask for an email", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        render(<RefundPolicyGenerator />);
        fillGulmohar();
        expect(
            screen.queryByRole("button", { name: "Copy the policy" }),
        ).toBeNull();
        type("Get your policy to copy or download", "gulmohar@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Copy the policy" }),
                ),
            ),
        );
        expect(writeText.mock.calls[0]?.[0]).toMatch(
            /^Returns and refunds, Gulmohar Handlooms\n\nLast updated /,
        );
        expect(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        ).toBeTruthy();
    });
});
