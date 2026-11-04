import type { CatalogInput } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it, vi } from "vitest";

import { faqs } from "@/content/faq";
import { FREE_PLAN_LINE } from "@/content/home";
import { PRICING } from "@/content/pricing";

import {
    faqWithPlans,
    freeCardModel,
    freeLimitLines,
    freePlanLine,
    freeUsage,
    pricingModel,
    readCatalog,
} from "./plans";

/** Made up on purpose (Plan A, 111): no test carries a real plan's terms. */
const fakeInput = (): CatalogInput => ({
    plans: [
        { id: "free", name: "Plan A", pricePaise: 0, tagline: "For A" },
        { id: "grow", name: "Plan B", pricePaise: 11_100, tagline: "Tag B" },
        { id: "pro", name: "Plan C", pricePaise: 22_200, tagline: "Tag C" },
    ],
    groups: [{ id: "one", name: "Group one" }],
    modules: [
        {
            id: "products",
            name: "Products",
            group: "one",
            cells: {
                free: { inc: true, text: "7", card: "7 things", limit: 7 },
                grow: {
                    inc: true,
                    text: "77",
                    card: "77 paid things",
                    limit: 77,
                },
            },
        },
        {
            id: "storage",
            name: "Storage",
            group: "one",
            cells: {
                free: { inc: true, text: "1", limit: 1, soft: true },
                pro: { inc: true, text: "5", card: "5 paid GB", limit: 5 },
            },
        },
        {
            id: "reviews",
            name: "No cap, no line",
            group: "one",
            cells: { free: { inc: true, text: "Included" } },
        },
        {
            id: "invoicing",
            name: "Tax",
            group: "one",
            cells: { free: { inc: true, text: "x", card: "GST invoices" } },
        },
        {
            id: "blog",
            name: "Hidden",
            group: "one",
            pricing: "hidden",
            cells: { free: { inc: true, text: "x", card: "Hidden line" } },
        },
        {
            id: "sites",
            name: "Soon",
            group: "one",
            pricing: "soon",
            cells: { free: { inc: true, text: "x", card: "Soon line" } },
        },
        {
            id: "payments",
            name: "Off",
            group: "one",
            cells: { grow: { inc: true, text: "x", card: "Paid only" } },
        },
    ],
    yearly: { on: false, paid: 10 },
    gst: { show: "excl" },
    addons: [
        {
            id: "more",
            kind: "products",
            name: "Addon words",
            pricePaise: 33_300,
            mode: "pack",
            qty: 3,
        },
    ],
});
const fake = (edit?: (c: CatalogInput) => void) => {
    const input = fakeInput();
    edit?.(input);
    return parseCatalog(input);
};

describe("what happens at Free's limits", () => {
    const cellsOf = (usage: ReturnType<typeof freeUsage>) =>
        (usage?.rows ?? []).map((r) =>
            r.kind === "line" ? [r.label, r.cells[0]] : [r.label],
        );

    it("says each capped row's line and its own words at the limit", () => {
        expect(cellsOf(freeUsage(fake()))).toEqual([
            ["7 things", "You can't add more products."],
            [
                "1 GB of photos and videos",
                "Nothing is blocked: your uploads keep working, and we'll be in touch about the space you need.",
            ],
        ]);
    });

    it("leaves the team out, and any price or paid plan", () => {
        const usage = freeUsage(
            fake((c) => {
                c.modules.push({
                    id: "members",
                    name: "Team",
                    group: "one",
                    cells: { free: { inc: true, text: "1", limit: 1 } },
                });
            }),
        );
        const text = JSON.stringify(usage);
        expect(text).not.toMatch(/team|invite/i);
        for (const word of ["111", "222", "333", "Plan B", "Addon words"]) {
            expect(text).not.toContain(word);
        }
    });

    it("draws nothing with no catalogue", () => {
        expect(freeUsage(null)).toBeNull();
    });
});

describe("Free's limits, from a catalogue", () => {
    it("lists Free's card lines, and a capped row's own words, and nothing else", () => {
        expect(freeLimitLines(fake())).toEqual([
            "7 things",
            "1 GB of photos and videos",
        ]);
    });

    it("draws them on Free's card with no footnote", () => {
        const view = pricingModel(fake()).views["month-excl"];
        expect(view.plans[0]?.lines.map((l) => l.t)).toEqual([
            "7 things",
            "1 GB of photos and videos",
            ...PRICING.freeAlways,
        ]);
        expect(view.footnote).toBe("");
    });

    it("lets no price or paid plan's contents reach the page", () => {
        const model = JSON.stringify(pricingModel(fake()));
        for (const word of [
            "111",
            "222",
            "333",
            "paid things",
            "paid GB",
            "Paid only",
            "Addon words",
            "Plan B",
            "Tag B",
            "GST",
        ]) {
            expect(model).not.toContain(word);
        }
        const paid = pricingModel(fake()).views["month-excl"].plans.slice(1);
        for (const plan of paid) {
            expect(plan.price).toBe(PRICING.noPrice);
            expect(plan.lines).toEqual([]);
        }
    });

    it("keeps the general lines and footnote with no free plan to read", () => {
        const noFree = fake((c) => {
            c.plans = c.plans.map((p) => ({
                ...p,
                pricePaise: p.id === "free" ? 500 : p.pricePaise,
            }));
        });
        expect(freeLimitLines(noFree)).toBeNull();
        const view = pricingModel(noFree).views["month-excl"];
        expect(view.footnote).toBe(PRICING.footnote);
    });
});

describe("reading the catalogue at build", () => {
    const answer = (status: number, body: unknown) =>
        vi.fn(() =>
            Promise.resolve(new Response(JSON.stringify(body), { status })),
        ) as unknown as typeof fetch;

    it("is null with no API_URL, and asks nothing", async () => {
        const fetcher = answer(200, {});
        expect(await readCatalog("", fetcher)).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("reads a published version", async () => {
        const read = await readCatalog(
            "https://api.test",
            answer(200, { catalog: fakeInput() }),
        );
        expect(read && freeLimitLines(read)).toContain("7 things");
    });

    it("is null when nothing is published, the API fails or the answer is bad", async () => {
        const warn = vi.spyOn(console, "warn").mockReturnValue(undefined);
        for (const fetcher of [
            answer(404, {}),
            answer(500, {}),
            answer(200, { catalog: { plans: "no" } }),
            vi.fn(() =>
                Promise.reject(new Error("down")),
            ) as unknown as typeof fetch,
        ]) {
            expect(await readCatalog("https://api.test", fetcher)).toBeNull();
        }
        warn.mockRestore();
    });
});

describe("the pricing page's plans, with no catalogue", () => {
    const model = pricingModel();
    const view = model.views["month-excl"];

    it("offers Free alone, with no toggle, tables or tax", () => {
        expect(model.tax.toggle).toBe(false);
        expect(model.yearly).toBeNull();
        expect(view.usage).toBeNull();
        expect(model.rows).toEqual([]);
        expect(view.plans.map((p) => [p.name, p.cta.paid, p.featured])).toEqual(
            [
                ["Free", false, true],
                ["Grow", true, false],
                ["Pro", true, false],
            ],
        );
    });

    it("gives the paid plans no price, and says nothing they would include", () => {
        for (const plan of view.plans.filter((p) => p.cta.paid)) {
            expect(plan.price).toBe("—");
            expect(plan.lines).toEqual([]);
        }
    });

    it("keeps Free's general lines and the footnote", () => {
        expect(view.plans[0]?.lines.map((l) => l.t)).toEqual([
            ...PRICING.freeLines,
        ]);
        expect(view.footnote).toBe(PRICING.footnote);
    });

    it("names no money, limit, tax or provider", () => {
        expect(JSON.stringify(view)).not.toMatch(
            /₹|\$|rupee|GST|\bVAT\b|\btax\b|\d|stripe|paypal|razorpay|cashfree/i,
        );
    });
});

describe("Free's limits beyond /pricing", () => {
    it("says Free's card lines in the hero line, and nothing with no catalogue", () => {
        const catalog = parseCatalog(fakeInput());
        expect(freePlanLine(catalog)).toBe(
            "Free to start: 7 things. No card needed.",
        );
        expect(freePlanLine(null)).toBe(FREE_PLAN_LINE.fallback);
    });

    it("answers Start free with the limits, once they're read", () => {
        const catalog = parseCatalog(fakeInput());
        const answer = (c: typeof catalog | null) =>
            faqWithPlans(c, ["start-free", "tax"])[0].a;
        expect(answer(catalog)).toMatch(/^Free includes 7 things/);
        expect(answer(catalog)).not.toContain("77");
        expect(answer(null)).toBe(faqs["start-free"].a);
    });

    it("draws Free's card alone, with no price or paid plan", () => {
        for (const c of [null, parseCatalog(fakeInput())]) {
            const { plans } = freeCardModel(c).views["month-excl"];
            expect(plans.map((p) => p.id)).toEqual(["free"]);
        }
    });

    it("doesn't say Free twice on its card", () => {
        const [card] = freeCardModel(null).views["month-excl"].plans;
        expect(card.name).toBe("Free");
        expect(card.price).not.toBe("Free");
    });
});
