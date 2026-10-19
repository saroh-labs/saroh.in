// @vitest-environment jsdom
/**
 * How they will pay (U3, BKMNewBookingStep5): Pays at the visit first and
 * picked (DEC-170), the payment link only where offered, Paid now with
 * Cash, UPI or Card, a Member's locked Paid now, and the class pack.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CANT_TAKE_PAYMENTS } from "@/lib/organizations/permits";
import type { PayChoice as Choice, PaidBy } from "@/lib/services/booking-pay";
import { defaultPay, payProblem } from "@/lib/services/booking-pay";

import type { PackOffer } from "./pay-choice";
import { PayChoice } from "./pay-choice";

let root: Root;
let host: HTMLDivElement;
const seen = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    seen.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function Harness({
    offerLink = true,
    canTakePayment = true,
    withPack = false,
    invalid = false,
}: {
    offerLink?: boolean;
    canTakePayment?: boolean;
    withPack?: boolean;
    invalid?: boolean;
}) {
    const [value, setValue] = useState<Choice>(defaultPay(offerLink));
    const [paidBy, setPaidBy] = useState<PaidBy | null>(null);
    const [packOn, setPackOn] = useState(true);
    const pack: PackOffer | null = withPack
        ? {
              title: "Use Farah's class pack",
              note: "10 Pilates classes · 4 left, 3 after this. Cancelling gives it back.",
              on: packOn,
              onChange: setPackOn,
          }
        : null;
    seen({ value, paidBy, problem: payProblem(value, paidBy) });
    return (
        <PayChoice
            value={value}
            onChange={setValue}
            paidBy={paidBy}
            onPaidByChange={setPaidBy}
            offerLink={offerLink}
            canTakePayment={canTakePayment}
            amount="₹800"
            pack={pack}
            invalid={invalid}
        />
    );
}

const draw = (props: Parameters<typeof Harness>[0] = {}) =>
    act(() => root.render(<Harness {...props} />));

const radio = (label: string) => {
    const hit = Array.from(
        host.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((b) => {
        const lab = host.querySelector(`label[for="${b.id}"]`);
        return lab?.textContent.startsWith(label);
    });
    if (!hit) throw new Error(`No choice ${label}`);
    return hit;
};

const last = () =>
    seen.mock.calls.at(-1)?.[0] as {
        value: Choice;
        paidBy: PaidBy | null;
        problem: string | null;
    };

describe("the payment choice", () => {
    it("starts on Pays at the visit, even when a payment link is offered", () => {
        draw();
        const labels = Array.from(host.querySelectorAll("label")).map(
            (l) => l.textContent,
        );
        expect(labels).toEqual([
            "Pays at the visit₹800 to take when they come",
            "Send a payment linkYou share it on WhatsApp or SMS. Shows Awaiting payment until paid.",
            "Paid nowCash, UPI or card, taken already",
        ]);
        expect(radio("Pays at the visit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(last().value).toBe("DESK");
    });

    it("offers no payment link where it can't be sent", () => {
        draw({ offerLink: false });
        expect(host.textContent).not.toContain("Send a payment link");
    });

    it("Paid now asks Cash, UPI or Card, and names the gap until one is picked", () => {
        draw();
        act(() => radio("Paid now").click());
        expect(last().value).toBe("PAID");
        expect(host.textContent).toContain(
            "Say how they paid: Cash, UPI or Card.",
        );
        expect(last().problem).toBe("Say how they paid: Cash, UPI or Card.");
        const upi = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "UPI",
        );
        act(() => upi?.click());
        expect(last().paidBy).toBe("UPI");
        expect(last().problem).toBeNull();
        expect(host.textContent).toContain(
            "Record it once ₹800 shows on your UPI app.",
        );
    });

    it("pressing Book with no way picked marks it, as an alert", () => {
        draw({ invalid: true });
        act(() => radio("Paid now").click());
        const alert = host.querySelector('[role="alert"]');
        expect(alert?.textContent).toBe(
            "Say how they paid: Cash, UPI or Card.",
        );
    });

    it("a role that can't take payment sees Paid now locked, saying why", () => {
        draw({ canTakePayment: false, offerLink: false });
        const paid = radio("Paid now");
        expect(paid.disabled).toBe(true);
        expect(host.textContent).toContain(CANT_TAKE_PAYMENTS);
        act(() => paid.click());
        expect(last().value).toBe("DESK");
        expect(host.textContent).not.toContain("Cash");
    });

    it("a class pack comes first and ticked; then nothing else is asked", () => {
        draw({ withPack: true });
        expect(host.textContent).toContain("Use Farah's class pack");
        expect(host.textContent).not.toContain("How will they pay?");
        const tick = host.querySelector<HTMLButtonElement>(
            'button[role="checkbox"]',
        );
        expect(tick?.getAttribute("aria-checked")).toBe("true");
        act(() => tick?.click());
        expect(host.textContent).toContain("How will they pay?");
    });

    it("is one radio group to the keyboard, its arrows moving the choice", () => {
        draw();
        const group = host.querySelector('[role="radiogroup"]');
        expect(group?.getAttribute("aria-labelledby")).toBeTruthy();
        expect(
            document.getElementById(
                group?.getAttribute("aria-labelledby") ?? "",
            )?.textContent,
        ).toBe("How will they pay?");
    });
});
