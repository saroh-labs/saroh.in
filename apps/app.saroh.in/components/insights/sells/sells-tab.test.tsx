import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SourceRead } from "@/lib/analytics/takings";
import type { SellsRead } from "@/lib/insights/reads";
import type { SellsParts } from "@/lib/insights/sells-words";
import {
    sellsEmpty,
    sellsRead,
    sellsWithoutMoney,
    sellsWithoutNames,
} from "@/lib/insights/sells.fixture";

import { SellsTab } from "./sells-tab";

/**
 * Insights' What sells tab (DEC-171, plan U13, #1095) as the server draws
 * it, section by section: best sellers with their change and New, what
 * people book and how full, the busiest grid, the best customers
 * (`IBSellsD`); each empty on its own (`IBSellsEmptyD`); the first weeks
 * (`IBThinD`); a business that only sells or only books; a role without
 * payments (counts, never money: `IBMemberD`) and one without customers'
 * names; a read that failed.
 */

const ok = (data: SellsRead): SourceRead<SellsRead> => ({
    status: "ok",
    data,
});

const ALL = { takeOrder: true, addService: true };

function draw(
    sells: SourceRead<SellsRead> | null,
    {
        parts = null,
        can = ALL,
    }: { parts?: SellsParts | null; can?: typeof ALL } = {},
): string {
    return renderToStaticMarkup(
        <SellsTab
            sells={sells}
            retryHref="/analytics?tab=sells"
            parts={parts}
            can={can}
        />,
    );
}

/** The text a person reads, tags and entities gone. */
function text(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

const hrefs = (html: string) =>
    Array.from(html.matchAll(/href="([^"]+)"/g), (m) =>
        m[1].replace(/&amp;/g, "&"),
    );

/** One section's markup, by its test id. */
function section(html: string, id: string): string {
    const start = html.indexOf(`data-testid="${id}"`);
    if (start < 0) return "";
    const open = html.lastIndexOf("<section", start);
    const close = html.indexOf("</section>", start);
    return html.slice(open, close);
}

describe("What sells, for an owner (IBSellsD)", () => {
    const html = draw(ok(sellsRead()));

    it("asks the four questions, in the design's order, then how it's counted", () => {
        const said = text(html);
        const order = [
            "What sells most?",
            "What do people book?",
            "When is it busiest?",
            "Who are my best customers?",
            "How these are counted",
        ].map((q) => said.indexOf(q));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // Everything is shown: no notice about what this role can't see.
        expect(html).not.toContain('data-testid="sells-hidden"');
    });

    it("lists the best sellers with sold, brought in and the change, New said in words", () => {
        const sold = section(html, "sells-sold");
        const said = text(sold);
        expect(said).toContain(
            "Sourdough loaf sells most: 412 sold. Seeded multigrain loaf grew fastest, up 21%.",
        );
        expect(said).toContain(
            "What Sold Brought in Against the 4 weeks before",
        );
        expect(sold.match(/data-row="sold"/g)).toHaveLength(5);
        expect(said).toContain("Sourdough loaf 412 sold ₹74,160 brought in");
        expect(said).toContain("Up 8% on the 4 weeks before");
        expect(said).toContain("Down 6% on the 4 weeks before");
        expect(said).toContain("New : New: none sold in the 4 weeks before");
        expect(sold).toContain('data-change="up"');
        expect(sold).toContain('data-change="down"');
        // Each product opens its page; See all opens Products.
        expect(hrefs(sold)).toEqual([
            "/commerce/products/p1",
            "/commerce/products/p2",
            "/commerce/products/p3",
            "/commerce/products/p4",
            "/commerce/products/p5",
            "/commerce/products",
        ]);
        expect(said).toContain("See all 14 products");
    });

    it("on a phone the table's head goes and each row says its own figures", () => {
        const sold = section(html, "sells-sold");
        // The head band is the desk's only, and a screen reader skips it.
        expect(sold).toMatch(
            /data-list-head="" [^>]*aria-hidden="true"[^>]*hidden/,
        );
        // The row is a wrapping line on a phone and a grid at the desk,
        // never a box that scrolls sideways.
        expect(sold).toContain("flex flex-wrap");
        expect(sold).not.toContain("overflow-x");
        expect(sold).toContain('<span class="desk:sr-only"> sold</span>');
    });

    it("says what people book and how full each class was, a one-to-one without a fill", () => {
        const booked = section(html, "sells-booked");
        const said = text(booked);
        expect(said).toContain(
            "Sourdough basics class: 46 people, and it is nearly always full.",
        );
        expect(said).toContain(
            "Sourdough basics class 96% full 46 people in 8 classes",
        );
        expect(said).toContain(
            "Cake tasting — One-to-one: no places to fill 12 bookings",
        );
        expect(booked.match(/role="progressbar"/g)).toHaveLength(2);
        expect(booked).toContain('aria-valuenow="96"');
        expect(hrefs(booked)).toEqual(["/services"]);
    });

    it("draws the week as a grid with the busiest darkest, and offers it as a table", () => {
        const busy = section(html, "sells-busiest");
        expect(text(busy)).toContain(
            "Saturday mornings are busiest: 1 in 7 sales and bookings happen then. Wednesday afternoons are the quietest.",
        );
        expect(busy.match(/data-level="/g)).toHaveLength(28);
        expect(busy.match(/data-level="5"/g)).toHaveLength(1);
        expect(text(busy)).toContain("Quieter");
        expect(text(busy)).toContain("Show as a table");
        expect(busy).toContain('aria-expanded="false"');
        expect(busy).toContain('role="img"');
    });

    it("names the best customers with what they paid and did most, each opening their page", () => {
        const people = section(html, "sells-customers");
        const said = text(people);
        expect(said).toContain(
            "18 customers came back and 9 came for the first time in the last 4 weeks. Shruti Menon brought in the most, ₹22,500.",
        );
        expect(people.match(/data-row="customer"/g)).toHaveLength(4);
        expect(said).toContain(
            "SM Shruti Menon Café Bloom · Sourdough loaf ₹22,500 4 orders",
        );
        expect(said).toContain("4 deliveries");
        expect(said).toContain("3 classes");
        expect(hrefs(people)).toEqual([
            "/contacts/c1",
            "/contacts/c2",
            "/contacts/c3",
            "/contacts/c4",
            "/commerce/customers?sort=spent",
        ]);
    });

    it("hides every name and figure from a session recording", () => {
        for (const id of [
            "sells-sold",
            "sells-booked",
            "sells-busiest",
            "sells-customers",
        ]) {
            expect(section(html, id)).toContain('data-ph-mask=""');
        }
    });
});

describe("a role without payments (IBMemberD)", () => {
    const html = draw(ok(sellsWithoutMoney()));

    it("sees counts, never money, and is told once who can show it", () => {
        const said = text(html);
        expect(said).not.toMatch(/₹/);
        expect(said).not.toContain("Brought in");
        expect(said).toContain("412 sold");
        expect(said).toContain("Shruti Menon came most often.");
        expect(html.match(/data-testid="sells-hidden"/g)).toHaveLength(1);
        expect(said).toContain(
            "Counts only: money is shown to people who can see payments.",
        );
        expect(hrefs(section(html, "sells-customers"))).toContain(
            "/commerce/customers",
        );
    });
});

describe("a role without customers' names", () => {
    it("names nobody and links to nobody, and still counts", () => {
        const html = draw(ok(sellsWithoutNames()));
        const people = section(html, "sells-customers");
        const said = text(people);
        for (const name of ["Shruti", "Arjun", "Kavya", "Neha", "Café Bloom"]) {
            expect(said).not.toContain(name);
        }
        expect(said).toContain("Customer 1");
        expect(said).toContain("₹22,500");
        expect(hrefs(people)).toEqual([]);
        expect(text(html)).toContain(
            "Customers' names are shown to people who can see customers.",
        );
    });
});

describe("thin and empty data", () => {
    it("in the first weeks compares nothing and says so (IBThinD)", () => {
        const html = draw(ok(sellsRead({ thin: true, ageDays: 20 })));
        const sold = section(html, "sells-sold");
        expect(text(sold)).toContain(
            "Sourdough loaf leads with 412 sold. There's nothing earlier to compare with yet.",
        );
        expect(text(sold)).not.toContain("Against the");
        expect(sold).not.toContain("data-change");
    });

    it("says each part is empty on its own, with its one button (IBSellsEmptyD)", () => {
        const html = draw(ok(sellsEmpty()));
        const said = text(html);
        expect(said).toContain(
            "Nothing sold in the last 4 weeks. Best sellers show here once something sells.",
        );
        expect(said).toContain(
            "No bookings in the last 4 weeks. Your classes and services show here with how full they were.",
        );
        expect(said).toContain(
            "Too few sales and bookings in the last 4 weeks to say when it's busiest.",
        );
        expect(said).toContain(
            "Nobody paid or booked in the last 4 weeks. Your best customers show here once people buy or book.",
        );
        expect(hrefs(html)).toEqual(["/commerce/orders/new", "/services/new"]);
        expect(html).not.toContain("data-level");
        expect(said).not.toContain("See all");
    });

    it("leaves out a button the role can't use", () => {
        const html = draw(ok(sellsEmpty()), {
            can: { takeOrder: false, addService: false },
        });
        expect(hrefs(html)).toEqual([]);
    });

    it("one part empty leaves the others drawn", () => {
        const read = sellsRead({
            booked: { rows: [], total: 0, bookings: 0, enough: false },
        });
        const html = draw(ok(read));
        expect(text(section(html, "sells-booked"))).toContain(
            "No bookings in the last 4 weeks.",
        );
        expect(
            section(html, "sells-sold").match(/data-row="sold"/g),
        ).toHaveLength(5);
        expect(section(html, "sells-busiest")).toContain("data-level");
    });
});

describe("what the business does", () => {
    it("only sells: no bookings part", () => {
        const html = draw(
            ok(
                sellsRead({
                    booked: { rows: [], total: 0, bookings: 0, enough: false },
                }),
            ),
            { parts: { sells: true, books: false } },
        );
        expect(html).not.toContain('data-testid="sells-booked"');
        expect(html).toContain('data-testid="sells-sold"');
        expect(html).toContain('data-testid="sells-busiest"');
        expect(html).toContain('data-testid="sells-customers"');
    });

    it("only books: no best sellers part", () => {
        const html = draw(
            ok(sellsRead({ bestSellers: { rows: [], total: 0 } })),
            { parts: { sells: false, books: true } },
        );
        expect(html).not.toContain('data-testid="sells-sold"');
        expect(html).toContain('data-testid="sells-booked"');
    });
});

describe("a read that failed", () => {
    it("says what couldn't load, with Try again", () => {
        for (const sells of [null, { status: "failed" } as const]) {
            const html = draw(sells);
            expect(text(html)).toMatch(/Couldn.t load what sells/);
            expect(hrefs(html)).toContain("/analytics?tab=sells");
            expect(html).not.toContain('data-testid="sells-sold"');
        }
    });
});
