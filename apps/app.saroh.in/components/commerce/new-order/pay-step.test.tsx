// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NewOrderPay } from "@/lib/orders/new-order";
import { canHandOver } from "@/lib/orders/new-order";

import { PayStep } from "./pay-step";

/**
 * "Handed over now" (UX-059): a counter sale paid now and picked up there
 * is Collected the moment it's made, so the customer who has left doesn't
 * leave three steps behind.
 */
describe("handed over now (UX-059)", () => {
    it("applies to a pick-up paid at the counter now", () => {
        expect(canHandOver("CASH", "PICKUP")).toBe(true);
        expect(canHandOver("UPI", "PICKUP")).toBe(true);
        expect(canHandOver("CARD", "PICKUP")).toBe(true);
        expect(canHandOver("LATER", "PICKUP")).toBe(false);
        expect(canHandOver("LINK", "PICKUP")).toBe(false);
        expect(canHandOver("CASH", "LOCAL_DELIVERY")).toBe(false);
    });

    const render = (handedOver: boolean | null) =>
        renderToStaticMarkup(
            <PayStep
                options={[{ key: "CASH", label: "Cash", off: null }]}
                pay="CASH"
                currency="INR"
                onPay={() => undefined}
                given=""
                onGiven={() => undefined}
                change={{ kind: "none" }}
                total="₹100"
                note="Paid now."
                format={(c) => `₹${c / 100}`}
                discount=""
                onDiscount={() => undefined}
                handedOver={handedOver}
                onHandedOver={() => undefined}
            />,
        );

    it("is offered, on, and says what it does", () => {
        const html = render(true);
        expect(html).toContain("Handed over now");
        expect(html).toContain("It&#x27;s made Collected");
    });

    it("isn't offered where it doesn't apply", () => {
        expect(render(null)).not.toContain("Handed over now");
    });
});

/** The payment chips are one radio group: one tab stop, arrows choose. */
describe("payment chips by keyboard", () => {
    function Host() {
        const [pay, setPay] = useState<NewOrderPay>("CASH");
        return (
            <PayStep
                options={[
                    { key: "CASH", label: "Cash", off: null },
                    { key: "LINK", label: "Payment link", off: "No provider" },
                    { key: "UPI", label: "UPI", off: null },
                ]}
                pay={pay}
                currency="INR"
                onPay={setPay}
                given=""
                onGiven={() => undefined}
                change={{ kind: "none" }}
                total="₹100"
                note="Paid now."
                format={(c) => `₹${c / 100}`}
                discount=""
                onDiscount={() => undefined}
            />
        );
    }

    it("moves the choice with the arrows, past a chip that is off", () => {
        (
            globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
        ).IS_REACT_ACT_ENVIRONMENT = true;
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        act(() => root.render(<Host />));
        const radio = (name: string) =>
            Array.from(
                host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
            ).find((b) => b.textContent === name);
        expect(
            Array.from(host.querySelectorAll('[role="radio"]')).map((b) =>
                b.getAttribute("tabindex"),
            ),
        ).toEqual(["0", "-1", "-1"]);
        act(() => {
            radio("Cash")?.focus();
            radio("Cash")?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(radio("UPI")?.getAttribute("aria-checked")).toBe("true");
        expect(document.activeElement).toBe(radio("UPI"));
        expect(radio("Payment link")?.getAttribute("aria-disabled")).toBe(
            "true",
        );
        act(() => root.unmount());
        host.remove();
    });
});
