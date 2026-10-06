import { isFontPairKey, parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import { DEVELOPER_TEMPLATE_ID, developerTemplate } from "./developer";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** Every value under `key` anywhere in a section's content. */
function valuesAt(value: unknown, key: string): unknown[] {
    if (Array.isArray(value)) {
        return value.flatMap((v: unknown) => valuesAt(v, key));
    }
    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(
            ([k, v]): unknown[] => (k === key ? [v] : valuesAt(v, key)),
        );
    }
    return [];
}

const profiles: [string, TemplateContext][] = [
    [
        "a full profile",
        {
            organizationName: "Sample Engineer",
            tagline: "Backend and infrastructure, working independently.",
            contactEmail: "hello@engineer.example",
            modules: ["WEBSITE", "CRM"],
        },
    ],
    ["a name only", { organizationName: "Sample Engineer" }],
    ["a name with markup characters", { organizationName: "Ink & <Paper>" }],
    [
        "every module on",
        {
            organizationName: "Sample Engineer",
            modules: ["WEBSITE", "CRM", "COMMERCE", "APPOINTMENTS"],
        },
    ],
];

function sections(ctx: TemplateContext) {
    return instantiateTemplate(developerTemplate, ctx).pages.flatMap(
        (p) => p.sections,
    );
}

function copyOf(ctx: TemplateContext): string {
    return sections(ctx)
        .flatMap((s) => strings(s.content))
        .join(" ");
}

describe("developer@1 (industry templates U9)", () => {
    it("is registered as the latest developer template", () => {
        expect(DEVELOPER_TEMPLATE_ID).toBe("developer");
        expect(getTemplate("developer")).toBe(developerTemplate);
        expect(listTemplates()).toContain(developerTemplate);
    });

    it("says what the gallery shows: a portfolio for creators, taking enquiries", () => {
        expect(developerTemplate).toMatchObject({
            name: "Developer",
            slug: "developer",
            shape: "portfolio",
            kinds: ["creator"],
            sample: { name: "Kiran Menon", host: "kiran.dev" },
            uses: ["WEBSITE", "CRM"],
        });
    });

    it("ships Green then Cobalt, both set in Geist", () => {
        const styles = developerTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["green", "Green"],
            ["cobalt", "Cobalt"],
        ]);
        for (const preset of styles) {
            expect(preset.style.fontPair).toBe("geist");
            expect(isFontPairKey(preset.style.fontPair ?? "")).toBe(true);
        }
        // One colour apart: the accent.
        expect(styles[0]?.style.colours?.accent).toBe("moss");
        expect(styles[1]?.style.colours?.accent).toBe("steel");
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, for %s",
        (_label, ctx) => {
            for (const section of sections(ctx)) {
                expect(
                    parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    ),
                ).toMatchObject({ success: true });
            }
        },
    );

    it("lays down one page in the design's order", () => {
        const laid = instantiateTemplate(developerTemplate, {
            organizationName: "Sample Engineer",
        }).pages.map((p) => ({
            path: p.path,
            isHome: p.isHome,
            sections: p.sections.map((s) => [
                s.type,
                (s.content as { variant?: string }).variant ?? null,
            ]),
        }));
        expect(laid).toEqual([
            {
                path: "/",
                isHome: true,
                sections: [
                    ["hero", "none"],
                    ["richText", null],
                    ["projects", "list"],
                    ["richText", null],
                    ["richText", null],
                    ["features", "grid"],
                    ["richText", null],
                    ["enquiry", null],
                ],
            },
        ]);
    });

    it("lays down the same sections whatever is switched on", () => {
        const shape = (ctx: TemplateContext) =>
            sections(ctx).map((s) => s.type);
        const all = profiles.map(([, ctx]) => shape(ctx));
        for (const s of all) expect(s).toEqual(all[0]);
    });

    it("heads the page with the name, and the owner's own line when given", () => {
        const [plain] = sections({ organizationName: "Sample Engineer" });
        expect(plain.content).toEqual({
            variant: "none",
            heading: "Sample Engineer",
        });
        const [own] = sections(profiles[0][1]);
        expect(own.content).toMatchObject({
            subheading: "Backend and infrastructure, working independently.",
        });
    });

    it("lists the work as placeholders, year, role and stack on their own line", () => {
        const work = sections(profiles[1][1]).find(
            (s) => s.type === "projects",
        );
        const { title, items } = work?.content as {
            title: string;
            items: { title: string; summary: string; link?: string }[];
        };
        expect(title).toBe("Work");
        expect(items).toHaveLength(3);
        for (const item of items) {
            expect(item.summary).toMatch(/^A placeholder\./);
            expect(item.summary).toMatch(
                /\nYears? · your (role|title) · the stack$/,
            );
            expect(item).not.toHaveProperty("link");
            expect(item).not.toHaveProperty("image");
        }
    });

    it("tells the case study in the design's parts, with a brief for its picture", () => {
        const texts = sections(profiles[1][1]).filter(
            (s) => s.type === "richText",
        );
        expect(texts).toHaveLength(4);
        const [, opening, parts] = texts;
        const brief = (opening.content as { imageBrief?: string }).imageBrief;
        expect(brief).toMatch(/as shipped/);
        expect(opening.content).not.toHaveProperty("image");
        const html = (parts.content as { value: string }).value;
        const order = [
            "The problem",
            "Constraints",
            "What I decided",
            "What I would do differently",
            "What changed",
        ].map((h) => html.indexOf(h));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("names the three kinds of rate and types no figure", () => {
        const rates = sections(profiles[1][1]).find(
            (s) => s.type === "features",
        );
        const intro = (rates?.content as { intro?: string }).intro;
        expect(intro).toMatch(/^Placeholders:/);
        expect(rates?.content).toMatchObject({
            heading: "What I charge",
            items: [
                { title: "Day rate" },
                { title: "Project" },
                { title: "Retainer" },
            ],
        });
    });

    it.each(profiles)(
        "types no price, client, result or date, for %s",
        (_label, ctx) => {
            const copy = copyOf(ctx);
            // No money of any kind: the rates are the owner's to write.
            expect(copy).not.toMatch(
                /₹|rs\.?\s?\d|\binr\b|\$|€|£|lakh|\d{2,}/i,
            );
            // None of the design sample's clients, places or dates.
            expect(copy).not.toMatch(
                /Kiran|Northwind|Halcyon|Meridian|Kiln|Zeta|Bengaluru|November|2026|2019/,
            );
            expect(copy).not.toMatch(/\bwe('ll|'re|ve)?\b|\bour\b/i);
            expect(copy).not.toMatch(/award|trusted|years of experience/i);
        },
    );

    it.each(profiles)(
        "carries no image, link or asset path, for %s",
        (_label, ctx) => {
            for (const section of sections(ctx)) {
                expect(valuesAt(section.content, "image")).toEqual([]);
                expect(valuesAt(section.content, "src")).toEqual([]);
                expect(valuesAt(section.content, "href")).toEqual([]);
                expect(valuesAt(section.content, "link")).toEqual([]);
                expect(JSON.stringify(section.content)).not.toMatch(
                    /\/templates\/|\.(png|jpe?g|webp|svg|gif)\b|<a\b/i,
                );
            }
        },
    );

    it("keeps owner text out of HTML, so a name is never markup", () => {
        const ctx = profiles[2][1];
        for (const section of sections(ctx)) {
            for (const value of valuesAt(section.content, "value")) {
                expect(String(value)).not.toContain("Ink");
            }
        }
        const enquiry = sections(ctx).find((s) => s.type === "enquiry");
        expect(enquiry?.content).toMatchObject({
            title: "Work with Ink & <Paper>",
        });
    });

    it("asks for a way to reply, and names no Form until the API makes one", () => {
        const enquiry = sections(profiles[1][1]).find(
            (s) => s.type === "enquiry",
        );
        expect(enquiry?.content).not.toHaveProperty("formId");
        expect(enquiry?.content).toMatchObject({
            fields: [
                { name: "name", type: "text" },
                { name: "email", type: "email", required: true },
                { name: "message", type: "textarea" },
            ],
        });
    });
});
