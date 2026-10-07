import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneBar, SummaryAside } from "./summary";

const BASE = {
    dueLabel: "Pay at the desk",
    due: "₹800",
    block: "Add your name.",
    submitError: null,
    submitting: false,
    onConfirm: () => undefined,
};

describe("what is left to do before booking (UX-083)", () => {
    it("reads as a next step, not an error, before they try to book", () => {
        render(
            <SummaryAside
                {...BASE}
                quiet
                serviceName="Consultation"
                whenText="Thu 8 Oct at 11:00"
                name=""
                hasService
                confirmLabel="Book"
                rules=""
            />,
        );
        const said = screen.getByText("Add your name.");
        expect(said.className).not.toContain("text-site-accent");
    });

    it("is said as the reason once they have tried", () => {
        render(
            <SummaryAside
                {...BASE}
                serviceName="Consultation"
                whenText="Thu 8 Oct at 11:00"
                name=""
                hasService
                confirmLabel="Book"
                rules=""
            />,
        );
        expect(screen.getByText("Add your name.").className).toContain(
            "text-site-accent",
        );
    });

    it("on a phone, shows the time chosen until they try", () => {
        render(
            <PhoneBar
                {...BASE}
                quiet
                hasService
                whenText="Thu 8 Oct at 11:00"
                barLabel="Book"
            />,
        );
        expect(screen.getByText("Thu 8 Oct at 11:00")).toBeInTheDocument();
        expect(screen.queryByText("Add your name.")).toBeNull();
    });
});
