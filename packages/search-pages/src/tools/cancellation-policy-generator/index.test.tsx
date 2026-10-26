// The cancellation policy generator's states (CancellationPolicyStates):
// empty, for your website, for WhatsApp, rules that clash, full price with
// no deposit, the email for both versions.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import CancellationPolicyGenerator from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (label: string) => fireEvent.click(screen.getByLabelText(label));

function fillRye() {
    type("Business name", "Rye Studio");
    pick("24 hours");
    type("You wait for late arrivals", "15");
    type("How they cancel", "Reply on WhatsApp to +91 99999 99999");
}

describe("CancellationPolicyGenerator", () => {
    it("says where the policy appears before any answer", () => {
        render(<CancellationPolicyGenerator />);
        expect(
            screen.getByText(
                /Answer the questions and your policy is written here/,
            ),
        ).toBeTruthy();
    });

    it("writes the website text, then the WhatsApp version", () => {
        const { container } = render(<CancellationPolicyGenerator />);
        fillRye();
        const doc = screen.getByRole("article", { name: "Your policy" });
        expect(doc.textContent).toContain("Cancellation policy, Rye Studio");
        expect(doc.textContent).toContain("We wait 15 minutes.");
        expect(unknownClasses(container)).toEqual([]);
        pick("For WhatsApp");
        const wa = screen.getByRole("region", { name: "WhatsApp version" });
        expect(wa.textContent).toContain(
            "Rye Studio's cancellation policy: you can cancel or move for free up to 24 hours before.",
        );
        expect(wa.textContent).toMatch(/\d+ characters: short enough/);
    });

    it("says where rules clash, with the fix", () => {
        render(<CancellationPolicyGenerator />);
        fillRye();
        pick("No deposit");
        expect(screen.getByRole("alert").textContent).toBe(
            "You take no deposit, so there's nothing to keep. Pick Full price due or Nothing kept, or ask for a deposit.",
        );
        pick("Full price due");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByText(
                /With no deposit, you can only collect this if they pay you/,
            ),
        ).toBeTruthy();
    });

    it("reading is free; copying asks for an email", async () => {
        render(<CancellationPolicyGenerator />);
        fillRye();
        expect(
            screen.queryByRole("button", { name: "Copy website text" }),
        ).toBeNull();
        type("Get both versions to copy or download", "ryestudio@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Copy website text" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Copy WhatsApp version" }),
        ).toBeTruthy();
    });
});
