// The gift voucher maker's states (GiftVoucherStates.dc.html): empty,
// filled (a service), the email before print, a date passed, nothing to give.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import GiftVoucherMaker from ".";
import { unknownClasses } from "../../test-classes";

afterEach(cleanup);

const type = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const voucher = () => screen.getByRole("img", { name: /Gift voucher from/ });

describe("GiftVoucherMaker", () => {
    it("shows where each detail goes before anything is typed", () => {
        render(<GiftVoucherMaker />);
        expect(voucher().textContent).toContain("[amount]");
        expect(voucher().textContent).toContain("[code]");
        expect(
            screen.queryByRole("button", { name: "Get my voucher" }),
        ).toBeNull();
    });

    it("draws the voucher as they type, with a code made in the browser", () => {
        const { container } = render(<GiftVoucherMaker />);
        type("Business name", "Rye Studio");
        type("Amount", "2,000");
        type(/^For/, "Ananya");
        type(/^From/, "Rohan");
        expect(voucher().textContent).toContain("₹2,000");
        expect(voucher().textContent).toContain("For Ananya, from Rohan");
        expect(screen.getByLabelText("Voucher code")).toHaveProperty(
            "value",
            expect.stringMatching(/^RYE-\w{4}-\w{2}$/),
        );
        expect(unknownClasses(container)).toEqual([]);
    });

    it("names a service where the amount goes, and asks for one when it's empty", () => {
        render(<GiftVoucherMaker />);
        fireEvent.click(screen.getByLabelText("A service"));
        fireEvent.blur(screen.getByLabelText("Service"));
        expect(screen.getByRole("alert").textContent).toBe(
            "Say what the voucher is for: a service, or switch to an amount.",
        );
        type("Service", "Hair spa");
        expect(voucher().textContent).toContain("Hair spa");
    });

    it("refuses a date that has passed, keeping the last good one", () => {
        render(<GiftVoucherMaker />);
        type("Valid until", "30 Apr 2099");
        type("Valid until", "30 Sep 2020");
        fireEvent.blur(screen.getByLabelText("Valid until"));
        expect(screen.getByRole("alert").textContent).toMatch(
            /^That date has passed\. Pick a date after today, /,
        );
        expect(voucher().textContent).toContain("30 Apr 2099");
    });

    it("prints only after the email", async () => {
        render(<GiftVoucherMaker />);
        type("Amount", "2000");
        type("Get your voucher", "hello@example.com");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Get my voucher" }),
                ),
            ),
        );
        expect(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        ).toBeTruthy();
    });
});
