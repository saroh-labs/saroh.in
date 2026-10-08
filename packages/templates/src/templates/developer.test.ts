import {
    inPageNavigation,
    isFontPairKey,
    parsePalette,
    parseSectionContent,
    parseTypeScale,
} from "@saroh/block-contract";
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

    it("draws the design's exact colours: neutral, one green or one cobalt", () => {
        const [green, cobalt] = developerTemplate.styles ?? [];
        expect(green.style.palette).toMatchObject({
            bg: "#FAFAF9",
            fg: "#17181A",
            surface: "#EFEFEC",
            accent: "#1E6B3F",
        });
        expect(cobalt.style.palette).toEqual({
            ...green.style.palette,
            accent: "#285B9B",
        });
        for (const preset of developerTemplate.styles ?? []) {
            expect(parsePalette(preset.style.palette).ok).toBe(true);
        }
    });

    it("sets one 820px column with small capitals labels", () => {
        for (const preset of developerTemplate.styles ?? []) {
            expect(preset.style.type).toMatchObject({
                contentWidth: 820,
                labelStyle: "eyebrow",
            });
            expect(parseTypeScale(preset.style.type).ok).toBe(true);
        }
    });

    it("leads the header with Work, Case study, Rates and Availability", () => {
        const home = instantiateTemplate(developerTemplate, {
            organizationName: "Sample Engineer",
        }).pages[0];
        expect(inPageNavigation(home.sections)).toEqual([
            { label: "Work", href: "/#work" },
            { label: "Case study", href: "/#case" },
            { label: "Rates", href: "/#rates" },
            { label: "Availability", href: "/#availability" },
        ]);
    });

    it("starts the footer on a line for the owner to write over", () => {
        expect(developerTemplate.footer).toEqual({
            line: "Your city · your email address",
            layout: "left",
        });
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
                    ["richText", "left"],
                    ["projects", "rows"],
                    ["richText", "left"],
                    ["features", "grid"],
                    ["richText", "left"],
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

    it("lists the work as placeholder rows: year, the work and its stack, role", () => {
        const work = sections(profiles[1][1]).find(
            (s) => s.type === "projects",
        );
        const { title, items, showCount } = work?.content as {
            title: string;
            showCount?: boolean;
            items: {
                title: string;
                summary: string;
                year?: string;
                role?: string;
                meta?: string;
                link?: string;
            }[];
        };
        expect(title).toBe("Work");
        // The count is the block's, from the rows: never typed.
        expect(showCount).toBe(true);
        expect(items).toHaveLength(3);
        for (const item of items) {
            expect(item.summary).toMatch(/^A placeholder\./);
            expect(item.year).toMatch(/^Years?$/);
            expect(item.role).toMatch(/^Your (role|title there)$/);
            expect(item.meta).toMatch(/^The stack/);
            expect(item).not.toHaveProperty("link");
            expect(item).not.toHaveProperty("image");
        }
    });

    it("tells the case study in the design's parts, with a brief for its picture", () => {
        const texts = sections(profiles[1][1]).filter(
            (s) => s.type === "richText",
        );
        expect(texts).toHaveLength(3);
        const study = texts[1].content as {
            value: string;
            imageBrief?: string;
            imageSide?: string;
            partLabels?: boolean;
            callout?: { label?: string; text: string };
        };
        expect(study.imageBrief).toMatch(/as shipped/);
        expect(study.imageSide).toBe("above");
        expect(study.partLabels).toBe(true);
        expect(study).not.toHaveProperty("image");
        const order = [
            "The problem",
            "Constraints",
            "What I decided",
            "What I would do differently",
        ].map((h) => study.value.indexOf(`<h3>${h}</h3>`));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // What changed: the box ruled in the accent, still a placeholder.
        expect(study.callout?.label).toBe("What changed");
        expect(study.callout?.text).toMatch(/^A placeholder\./);
    });

    it("names the three kinds of rate, each figure the owner's to write", () => {
        const rates = sections(profiles[1][1]).find(
            (s) => s.type === "features",
        );
        const note = (rates?.content as { note?: string }).note;
        expect(note).toMatch(/^Placeholders:/);
        expect(rates?.content).toMatchObject({
            heading: "What I charge",
            items: [
                { title: "Day rate", value: "Your day rate" },
                { title: "Project", value: "Your usual range" },
                { title: "Retainer", value: "Your monthly rate" },
            ],
        });
    });

    it("says when the owner is free in a box ruled in the accent", () => {
        const texts = sections(profiles[1][1]).filter(
            (s) => s.type === "richText",
        );
        const free = texts[2].content as {
            value: string;
            callout?: { label?: string; text: string };
        };
        expect(free.value).toBe("<h2>Availability</h2>");
        expect(free.callout?.label).toMatch(/^Your next opening — /);
        expect(free.callout?.text).toMatch(/^A placeholder\./);
        expect(free.callout?.text).toMatch(/\nNot looking for: /);
    });

    it("sets the intro's facts as a definition list", () => {
        const intro = sections(profiles[1][1]).find(
            (s) => s.type === "richText",
        );
        const html = (intro?.content as { value: string }).value;
        expect(html).toContain(
            "<dl><dt>Based</dt><dd>Your city and time zone</dd>",
        );
        expect(html).not.toContain("<table>");
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
