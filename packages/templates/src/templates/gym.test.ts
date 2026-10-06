import { isFontPairKey, parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import { GYM_TEMPLATE_ID, gymTemplate } from "./gym";

/** A context as the API builds it; `malformed` widens one the tests break. */
type WithModules = TemplateContext;
function malformed(ctx: Record<string, unknown>): TemplateContext {
    return ctx as unknown as TemplateContext;
}

const nameOnly: WithModules = { organizationName: "Sample Gym" };
const everythingOn: WithModules = {
    organizationName: "Sample Gym",
    modules: ["WEBSITE", "APPOINTMENTS", "PAYMENTS", "CLASS_PACKS"],
};
const classesOnly: WithModules = {
    organizationName: "Sample Gym",
    modules: ["WEBSITE", "APPOINTMENTS"],
};
const plansOnly: WithModules = {
    organizationName: "Sample Gym",
    modules: ["WEBSITE", "PAYMENTS"],
};

const profiles: [string, WithModules][] = [
    ["a name only", nameOnly],
    ["every module on", everythingOn],
    ["classes only", classesOnly],
    ["plans only", plansOnly],
    ["a name with markup characters", { organizationName: "Iron & <Oak>" }],
    [
        "a malformed context",
        malformed({ organizationName: "Sample Gym", modules: "APPOINTMENTS" }),
    ],
];

function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

function layout(ctx: WithModules) {
    return instantiateTemplate(gymTemplate, ctx).pages.map((p) => ({
        path: p.path,
        sections: p.sections.map((s) => {
            const variant = (s.content as { variant?: string }).variant;
            return variant && variant !== "default"
                ? `${s.type}:${variant}`
                : s.type;
        }),
    }));
}

describe("gym@1 (industry templates, U6)", () => {
    it("is registered as the Gym template, version 1, with its gallery facts", () => {
        expect(gymTemplate.id).toBe(GYM_TEMPLATE_ID);
        expect(gymTemplate.version).toBe(1);
        expect(getTemplate("gym")).toBe(gymTemplate);
        expect(listTemplates()).toContain(gymTemplate);
        expect(gymTemplate).toMatchObject({
            name: "Gym",
            slug: "gym",
            kinds: ["gym"],
            shape: "services",
            sample: { name: "Iron & Oak", host: "ironandoak.saroh.app" },
        });
        expect(gymTemplate.uses).toEqual([
            "APPOINTMENTS",
            "PAYMENTS",
            "CLASS_PACKS",
        ]);
    });

    it("offers the original and its colourway, in Archivo Narrow with square corners", () => {
        const styles = gymTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["acid", "Acid"],
            ["ice", "Ice"],
        ]);
        for (const { style } of styles) {
            expect(style.fontPair).toBe("archivo-narrow");
            expect(isFontPairKey(style.fontPair)).toBe(true);
            expect(style.colours?.pageGround).toBe("slate");
            expect(style.colours?.text).toBe("chalk");
            expect(style.scalars?.cornerRadius).toBe(0);
        }
        // The colourway changes the accent, and only the accent.
        const [acid, ice] = styles;
        expect(acid.style.colours?.accent).toBe("moss");
        expect(ice.style.colours?.accent).toBe("teal");
        expect({ ...ice.style.colours, accent: "moss" }).toEqual(
            acid.style.colours,
        );
    });

    it.each(profiles)(
        "instantiates, and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(gymTemplate, ctx);
            expect(pages.filter((p) => p.isHome)).toHaveLength(1);
            for (const page of pages) {
                expect(page.sections.length).toBeGreaterThan(0);
                expect(page.sections.map((s) => s.order)).toEqual(
                    page.sections.map((_s, i) => i),
                );
                for (const section of page.sections) {
                    expect(
                        parseSectionContent(
                            section.type,
                            section.contractVersion,
                            section.content,
                        ),
                    ).toMatchObject({ success: true });
                }
            }
        },
    );

    it("with every module on: the design's four pages, the timetable first", () => {
        expect(layout(everythingOn)).toEqual([
            {
                path: "/",
                sections: [
                    "hero:none",
                    "timetable:grid",
                    "plans",
                    "packs",
                    "features:list",
                    "hours",
                ],
            },
            {
                path: "/timetable",
                sections: ["hero:none", "timetable:list", "hours"],
            },
            {
                path: "/membership",
                sections: ["hero:none", "plans", "packs", "features:list"],
            },
            {
                path: "/trainers",
                sections: ["hero:none", "person", "person"],
            },
        ]);
    });

    it("with no module known: no timetable, no prices and no page for either", () => {
        expect(layout(nameOnly)).toEqual([
            { path: "/", sections: ["hero:none", "features:list", "hours"] },
            { path: "/trainers", sections: ["hero:none", "person", "person"] },
        ]);
        // A malformed module list is "not known", never "on".
        expect(
            layout(
                malformed({ organizationName: "x", modules: "APPOINTMENTS" }),
            ),
        ).toEqual(layout(nameOnly));
    });

    it("lays down each bound block only with its module on", () => {
        expect(layout(classesOnly).map((p) => p.path)).toEqual([
            "/",
            "/timetable",
            "/trainers",
        ]);
        expect(layout(classesOnly)[0]?.sections).toEqual([
            "hero:none",
            "timetable:grid",
            "features:list",
            "hours",
        ]);
        expect(layout(plansOnly)).toEqual([
            {
                path: "/",
                sections: ["hero:none", "plans", "features:list", "hours"],
            },
            {
                path: "/membership",
                sections: ["hero:none", "plans", "features:list"],
            },
            { path: "/trainers", sections: ["hero:none", "person", "person"] },
        ]);
    });

    it("binds the timetable, prices and hours, and stores none of their data", () => {
        const sections = instantiateTemplate(
            gymTemplate,
            everythingOn,
        ).pages.flatMap((p) => p.sections);
        const timetable = sections.find((s) => s.type === "timetable");
        // Every class the booking page offers, with trainer and places.
        expect(timetable?.content).toEqual({
            variant: "grid",
            title: "This week",
            intro: "Who is coaching each class and how many places are left. Book from your phone on the way in.",
            showTrainer: true,
            showPlacesLeft: true,
        });
        expect(timetable?.content).not.toHaveProperty("serviceIds");
        // No highlight: "Most chosen" is a claim the owner makes, not us.
        for (const plans of sections.filter((s) => s.type === "plans")) {
            expect(plans.content).toMatchObject({ highlight: "none" });
        }
        const hours = sections.find((s) => s.type === "hours");
        expect(hours?.content).not.toHaveProperty("storeId");
        // No price, time or session anywhere in the template's own words.
        const copy = sections.flatMap((s) => strings(s.content)).join(" ");
        expect(copy).not.toMatch(/₹|\$|£|\d{1,2}:\d{2}|\d+ (classes|sessions)/);
    });

    it("heads Home with the business's name, as the page title", () => {
        const home = instantiateTemplate(gymTemplate, nameOnly).pages[0];
        expect(home.sections[0]?.content).toEqual({
            variant: "none",
            heading: "Sample Gym",
        });
        const own = instantiateTemplate(gymTemplate, {
            ...nameOnly,
            tagline: "Barbells, before work.",
        }).pages[0];
        expect(own.sections[0]?.content).toMatchObject({
            subheading: "Barbells, before work.",
        });
    });

    it("invents no coach and no member: the coaches are placeholders with photo briefs", () => {
        const { pages } = instantiateTemplate(gymTemplate, everythingOn);
        const people = pages
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "person")
            .map((s) => s.content as Record<string, unknown>);
        expect(people).toHaveLength(2);
        for (const person of people) {
            expect(person.bio).toMatch(/^A placeholder\./);
            expect(person.image).toBeUndefined();
            expect(String(person.imageBrief).length).toBeGreaterThan(0);
        }
        expect(people.map((p) => p.name)).toEqual([
            "Your first coach",
            "Another coach",
        ]);
        // The design's member quote is the sample gym's: not laid down.
        const types = pages.flatMap((p) => p.sections.map((s) => s.type));
        expect(types).not.toContain("testimonials");
        const copy = pages
            .flatMap((p) => p.sections)
            .flatMap((s) => strings(s.content))
            .join(" ");
        for (const name of ["Devika", "Arjun", "Ritu", "Sameer", "Nikhil"]) {
            expect(copy).not.toContain(name);
        }
    });

    it.each(profiles)(
        "never speaks as a company to its visitors, for %s",
        (_label, ctx) => {
            const copy = instantiateTemplate(gymTemplate, ctx)
                .pages.flatMap((p) => p.sections)
                .flatMap((s) => strings(s.content))
                .join(" ")
                .toLowerCase();
            expect(copy).not.toMatch(/\b(we|we're|we'll|our|us)\b/);
        },
    );

    it("never drops the home page, whatever a page's condition", () => {
        const pages = instantiateTemplate(
            {
                ...gymTemplate,
                pages: gymTemplate.pages.map((p) => ({
                    ...p,
                    when: () => false,
                })),
            },
            everythingOn,
        ).pages;
        expect(pages.map((p) => p.path)).toEqual(["/"]);
    });
});
