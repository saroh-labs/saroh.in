import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderRead } from "@/lib/orders/read";

import { OrderHeading } from "./order-header";

/**
 * The "Waiting 16 min" pill is drawn once the clock is read, after
 * hydration. On a phone it has a line of its own: if the server's paint
 * left it out, everything under the header moved down as it appeared, and
 * a tap aimed at "Change how it's fulfilled…" landed on the gap above it.
 */
const order = {
    placedAt: "2026-11-25T08:24:00Z",
    store: { id: "s1", name: "Hill Road" },
    fulfilmentType: "PICKUP",
    fulfilmentLabel: "Pick-up",
    deliveryAddress: null,
} as unknown as OrderRead;

const render = (age: Parameters<typeof OrderHeading>[0]["age"]) =>
    renderToStaticMarkup(
        <OrderHeading
            order={order}
            number="#ORD-510"
            standing={{ label: "New", tone: "new" }}
            age={age}
        >
            {null}
        </OrderHeading>,
    );

const pill = (html: string) =>
    /<span[^>]*class="([^"]*tabular-nums[^"]*)"[^>]*>([^<]*)<\/span>/.exec(
        html,
    );

describe("the order header's waiting pill", () => {
    it("keeps the pill's room, unseen, before the clock is read", () => {
        const found = pill(render("soon"));
        expect(found).not.toBeNull();
        expect(found?.[1]).toContain("invisible");
        expect(found?.[0]).toContain('aria-hidden="true"');
    });

    it("draws the same pill once it is", () => {
        const before = pill(render("soon"));
        const after = pill(
            render({ text: "Waiting 16 min", late: false, rule: null }),
        );
        expect(after?.[2]).toBe("Waiting 16 min");
        expect(after?.[1]).not.toContain("invisible");
        // Same box: padding, border and type, so the line doesn't move.
        for (const c of ["px-2", "py-0.5", "border", "text-[12px]"]) {
            expect(before?.[1]).toContain(c);
            expect(after?.[1]).toContain(c);
        }
    });

    it("draws nothing for an order that isn't waiting", () => {
        expect(pill(render(null))).toBeNull();
    });
});
