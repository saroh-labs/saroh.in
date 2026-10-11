import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingUnavailable } from "../booking-flow/booking-flow";
import { SitePageState } from "./page-state";

describe("a whole page with nothing to show", () => {
    it("says a failed read as an alert, with Try again and the ways to reach the business", () => {
        render(
            <SitePageState
                title="We couldn't open the shop"
                failed
                retryHref="/shop"
                reach={{
                    phone: "+918040992210",
                    whatsapp: "https://wa.me/918040992210",
                }}
            >
                Something went wrong on our side.
            </SitePageState>,
        );
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("data-page-state", "failed");
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "We couldn't open the shop",
            }),
        ).toBeInTheDocument();
        const again = screen.getByRole("link", { name: "Try again" });
        expect(again).toHaveAttribute("href", "/shop");
        // 44px, with a ring a keyboard can see.
        expect(again.className).toContain("min-h-11");
        expect(again.className).toContain("focus-visible:ring-2");
        expect(screen.getByRole("link", { name: /^Call / })).toHaveAttribute(
            "href",
            "tel:+918040992210",
        );
        expect(
            screen.getByRole("link", { name: "Message on WhatsApp" }),
        ).toBeVisible();
    });

    it("says an empty page plainly: no alert, and nothing to press without a way on", () => {
        render(
            <SitePageState title="No products yet">
                Nothing is on sale here yet.
            </SitePageState>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(document.querySelector("[data-page-state]")).toHaveAttribute(
            "data-page-state",
            "empty",
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("the booking page when its read failed", () => {
    it("offers another go on the address it was opened on, and the business's phone", () => {
        render(
            <BookingUnavailable
                business="Kavi Dental"
                retryHref="/book?service=svc_1"
                reach={{ phone: "+918040992210", whatsapp: null }}
            />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "We couldn't open the booking page",
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "get in touch with Kavi Dental to book",
        );
        expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
            "href",
            "/book?service=svc_1",
        );
        expect(screen.getByRole("link", { name: /^Call / })).toBeVisible();
    });

    it("still says so, with nothing to press, when it was given no way on", () => {
        render(<BookingUnavailable business="Kavi Dental" />);
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });
});
