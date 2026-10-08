import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PlanLock } from "@/lib/billing/access";
import type { DepositMode } from "@/lib/services/service";

import { DepositField } from "./deposit-field";

/** Made-up plans: never a real plan's name or price. */
const LOCK: PlanLock = {
    href: "/settings/billing?plan=b#change-plan",
    name: "Online payments",
    what: "Take payment online.",
    plan: "Plan A",
    upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
};

function render(
    deposit: DepositMode,
    saved: DepositMode,
    paymentsLock: PlanLock | null,
) {
    return renderToStaticMarkup(
        <DepositField
            deposit={deposit}
            saved={saved}
            price="800"
            currency="INR"
            paymentsLock={paymentsLock}
            onChange={() => undefined}
        />,
    );
}

/** Each chip's label, and whether it is disabled. */
function chips(html: string): [string, boolean][] {
    const out: [string, boolean][] = [];
    for (const part of html.split("<button").slice(1)) {
        const end = part.indexOf(">");
        const attrs = part.slice(0, end);
        if (!attrs.includes('role="radio"')) continue;
        const text = part.slice(end + 1, part.indexOf("</button>"));
        out.push([text, /\sdisabled=""/.test(attrs)]);
    }
    return out;
}

describe("DepositField on a plan without online payments", () => {
    it("locks the deposits, leaving nothing at booking, with the way up", () => {
        const html = render("NONE", "NONE", LOCK);
        expect(chips(html)).toEqual([
            ["Nothing — they pay at the visit", false],
            ["25% deposit", true],
            ["50% deposit", true],
            ["The full price", true],
        ]);
        expect(html).toContain(
            "Deposits are taken online, which comes with Plan B",
        );
        expect(html).toContain(
            "Services book &quot;pay at the desk&quot; until then.",
        );
        expect(html).toContain('href="/settings/billing?plan=b#change-plan"');
        // No price is said.
        expect(html).not.toContain("111");
    });

    it("shows a deposit the service already has as kept, but paused", () => {
        const html = render("PERCENT_50", "PERCENT_50", LOCK);
        expect(chips(html)).toEqual([
            ["Nothing — they pay at the visit", false],
            ["25% deposit", true],
            ["50% deposit", false],
            ["The full price", true],
        ]);
        expect(html).toContain("This service keeps its deposit, paused");
        expect(html).toContain("Paused: customers book and pay at the visit");
        // Not the split it would take: nothing is taken when booking.
        expect(html).not.toContain("when booking, and the rest");
    });

    it("leaves every deposit open on a plan with online payments", () => {
        const html = render("PERCENT_50", "NONE", null);
        expect(chips(html).every(([, disabled]) => !disabled)).toBe(true);
        expect(html).not.toContain("Deposits are taken online");
        expect(html).toContain("when booking, and the rest");
    });
});

describe("DepositField when online can't take the deposit (UX-056)", () => {
    const atDesk = {
        blocked: false,
        text: "Paid at the desk for now: no payment provider is connected, so nothing is taken when people book.",
        line: "",
        fix: { href: "/settings/providers", label: "Connect one" },
    };

    it("says only the desk outcome, never what it would take when booking", () => {
        const html = renderToStaticMarkup(
            <DepositField
                deposit="PERCENT_25"
                price="1200"
                currency="INR"
                problem={atDesk}
                onChange={() => undefined}
            />,
        );
        expect(html).toContain("Paid at the desk for now");
        expect(html).toContain("at the visit.");
        expect(html).not.toContain("when booking");
        expect(html).not.toContain("Refunded if they cancel in time");
    });

    it("says only the problem when it can't be booked online at all", () => {
        const html = renderToStaticMarkup(
            <DepositField
                deposit="PERCENT_25"
                price="1200"
                currency="INR"
                problem={{
                    ...atDesk,
                    blocked: true,
                    text: "People can't book this online: no provider.",
                }}
                onChange={() => undefined}
            />,
        );
        expect(html).toContain("People can&#x27;t book this online");
        expect(html).not.toContain("They pay");
    });
});
