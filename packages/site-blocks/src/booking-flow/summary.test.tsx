import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { viewport } from "../test-viewport";
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
                whenText="Thu 8 Oct at 11:00 am"
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
                whenText="Thu 8 Oct at 11:00 am"
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
        viewport("phone");
        render(
            <PhoneBar
                {...BASE}
                quiet
                hasService
                whenText="Thu 8 Oct at 11:00 am"
                barLabel="Book"
            />,
        );
        expect(screen.getByText("Thu 8 Oct at 11:00 am")).toBeInTheDocument();
        expect(screen.queryByText("Add your name.")).toBeNull();
    });

    it("draws both, and lets CSS show one by the screen's width", () => {
        const both = (
            <>
                <SummaryAside
                    {...BASE}
                    serviceName="Consultation"
                    whenText="Thu 8 Oct at 11:00 am"
                    name="Asha"
                    hasService
                    confirmLabel="Book and pay at the desk"
                    rules=""
                />
                <PhoneBar
                    {...BASE}
                    hasService
                    whenText="Thu 8 Oct at 11:00 am"
                    barLabel="Book"
                />
            </>
        );
        const { container, unmount } = render(both);
        expect(
            container.querySelector("aside")?.className.split(" "),
        ).toContain("max-[699px]:hidden");
        expect(
            container.querySelector("[data-booking-bar]")?.className.split(" "),
        ).toContain("min-[700px]:hidden");
        // At a desk: the aside's button alone.
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(
            screen.getByRole("button", { name: "Book and pay at the desk" }),
        ).toBeInTheDocument();
        unmount();
        // On a phone: the bar's alone.
        viewport("phone");
        render(both);
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(
            screen.getByRole("button", { name: "Book" }),
        ).toBeInTheDocument();
    });
});

describe("the GST beside what is due", () => {
    const aside = (gstText: string | null) =>
        render(
            <SummaryAside
                {...BASE}
                due="₹1,180"
                block=""
                gstText={gstText}
                serviceName="Consultation"
                whenText="Thu 8 Oct at 11:00 am"
                name="Asha"
                hasService
                confirmLabel="Book and pay at the desk"
                rules=""
            />,
        );

    it("says the price with its GST under the amount to pay", () => {
        const { container } = aside("₹1,000 + ₹180 GST (18%)");
        expect(container.querySelector("[data-booking-gst]")).toHaveTextContent(
            /^₹1,000 \+ ₹180 GST \(18%\)$/,
        );
        expect(screen.getByText("₹1,180")).toBeInTheDocument();
    });

    it("says nothing when there is none", () => {
        const { container } = aside(null);
        expect(container.querySelector("[data-booking-gst]")).toBeNull();
        expect(container.textContent).not.toContain("GST");
    });

    it("keeps the phone's bar to the amount and the button", () => {
        const { container } = render(
            <PhoneBar
                {...BASE}
                due="₹1,180"
                block=""
                gstText="₹1,000 + ₹180 GST (18%)"
                hasService
                whenText="Thu 8 Oct at 11:00 am"
                barLabel="Book"
            />,
        );
        expect(container.textContent).toContain("₹1,180");
        expect(container.textContent).not.toContain("GST");
    });
});
