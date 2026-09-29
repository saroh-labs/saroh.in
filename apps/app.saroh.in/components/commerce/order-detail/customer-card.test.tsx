import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderAttention, OrderAttentionEntry } from "@/lib/orders/read";

import { CustomerCard } from "./customer-card";

/**
 * Order Detail's customer card (B15, DEC-073): "Needs attention: Sesame,
 * Pregnant" as the design draws it — the card covers every kind of entry,
 * not only allergies — while a screen reader still hears each kind.
 */

function entry(over: Partial<OrderAttentionEntry> = {}): OrderAttentionEntry {
    return {
        id: "a1",
        kind: "ALLERGY",
        label: "Sesame",
        detail: null,
        sensitive: false,
        allergen: { id: "al_1", name: "Sesame" },
        matchAllergens: [],
        source: "STAFF",
        ...over,
    };
}

const render = (attention: OrderAttention | null | undefined): string =>
    renderToStaticMarkup(
        <CustomerCard
            customer={{
                id: "c1",
                name: "Priya Raman",
                phone: "+91 98100 00000",
                contactId: "ct_1",
                orderCount: 3,
                firstOrderAt: null,
            }}
            href="/commerce/customers/ct_1"
            notes={null}
            attention={attention}
            address={null}
            shipment={null}
            onChangeTracking={() => undefined}
            orderNote={null}
        />,
    );

/** The card's words as they read on screen, without what only a screen reader hears. */
function seen(html: string): string {
    return html
        .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
        .replace(/<[^>]+>/g, "");
}

describe("CustomerCard — Needs attention (DEC-073)", () => {
    it('reads "Needs attention: Sesame", not "Allergy: Sesame"', () => {
        const html = render({ entries: [entry()], hiddenSensitiveCount: 0 });
        expect(seen(html)).toContain("Needs attention: Sesame");
        expect(seen(html)).not.toContain("Allergy");
        // A screen reader hears the list's name and each entry's kind.
        expect(html).toContain('aria-label="Needs attention"');
        expect(html).toContain('<span class="sr-only">Allergy: </span>Sesame');
    });

    it("joins every kind with a comma, a sensitive one last and off the ticket", () => {
        const html = render({
            entries: [
                entry({
                    id: "a2",
                    kind: "MEDICAL",
                    label: "Pregnant",
                    detail: "Second trimester",
                    sensitive: true,
                    allergen: null,
                }),
                entry(),
            ],
            hiddenSensitiveCount: 0,
        });
        expect(seen(html)).toContain("Needs attention: Sesame, Pregnant");
        expect(html).toMatch(/<li[^>]*class="inline print:hidden"[^>]*>/);
        expect(html).toContain("Medical: </span>Pregnant");
        expect(html).toContain(", Second trimester");
    });

    it("counts what this viewer can't see, and says when it couldn't be read", () => {
        expect(
            render({ entries: [entry()], hiddenSensitiveCount: 1 }),
        ).toContain("1 more note you can&#x27;t see");
        expect(render(null)).toContain("Needs attention: not available.");
    });

    it("says a treatment's Medical entry too, as the Visits card does (DEC-073)", () => {
        const html = render({
            entries: [
                entry({
                    kind: "MEDICAL",
                    label: "Diabetic",
                    detail: "Check sugar before a long visit",
                    sensitive: true,
                    allergen: null,
                }),
            ],
            hiddenSensitiveCount: 0,
        });
        expect(seen(html)).toContain("Needs attention: Diabetic");
        expect(html).toContain(", Check sugar before a long visit");
    });

    it("draws nothing when there is none", () => {
        const html = render({ entries: [], hiddenSensitiveCount: 0 });
        expect(html).not.toContain("Needs attention");
    });
});
