import { parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import {
    PERSONAL_TEMPLATE_ID,
    personalServiceIds,
    personalTemplate,
} from "./personal";

/**
 * `modules` and `serviceIds` are typed on `TemplateContext` (K15); the tests
 * widen them to `unknown` to feed a malformed context too.
 */
type WithModules = TemplateContext & {
    modules?: unknown;
    serviceIds?: unknown;
};

const nameOnly: WithModules = { organizationName: "Sample Name" };
const fullProfile: WithModules = {
    organizationName: "Sample Studio",
    legalName: "Sample Studio Pvt Ltd",
    tagline: "Help with the paperwork, one client at a time.",
    contactEmail: "hello@example.com",
};
const withBookings: WithModules = {
    organizationName: "Sample Name",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_1", "svc_2"],
};

function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

function imageSources(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(imageSources);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
            k === "src" && typeof v === "string" ? [v] : imageSources(v),
        );
    }
    return [];
}

function homeTypes(ctx: WithModules): string[] {
    return (
        instantiateTemplate(personalTemplate, ctx)
            .pages.find((p) => p.isHome)
            ?.sections.map((s) => s.type) ?? []
    );
}

const profiles: [string, WithModules][] = [
    ["a name only", nameOnly],
    ["a full profile", fullProfile],
    ["a name with markup characters", { organizationName: "Rye & <Co>" }],
    ["Appointments on, with services", withBookings],
    [
        "Appointments on, with no services yet",
        { ...nameOnly, modules: ["APPOINTMENTS"], serviceIds: [] },
    ],
    ["Appointments off", { ...nameOnly, modules: ["WEBSITE", "CRM"] }],
];

describe("personal@1 (DEC-070, K14)", () => {
    it("is the Personal template, version 1", () => {
        expect(personalTemplate.id).toBe(PERSONAL_TEMPLATE_ID);
        expect(personalTemplate.id).toBe("personal");
        expect(personalTemplate.version).toBe(1);
    });

    it.each(profiles)(
        "instantiates, and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(personalTemplate, ctx);
            for (const section of pages.flatMap((p) => p.sections)) {
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

    it("lays down Home, About and Contact, with one home page", () => {
        const { pages } = instantiateTemplate(personalTemplate, nameOnly);
        expect(pages.map((p) => p.path)).toEqual(["/", "/about", "/contact"]);
        expect(pages.filter((p) => p.isHome).map((p) => p.path)).toEqual(["/"]);
        const [, about, contact] = pages;
        expect(about.sections.map((s) => s.type)).toEqual(["hero", "richText"]);
        expect(contact.sections.map((s) => s.type)).toEqual(["enquiry"]);
    });

    it("lists the real Services with Appointments on", () => {
        expect(homeTypes(withBookings)).toEqual([
            "hero",
            "features",
            "servicesList",
            "cta",
        ]);
        const home = instantiateTemplate(personalTemplate, withBookings)
            .pages[0];
        expect(home.sections[2]?.content).toMatchObject({
            serviceIds: ["svc_1", "svc_2"],
            layout: "cards",
        });
        // `order` counts only the sections laid down.
        expect(home.sections.map((s) => s.order)).toEqual([0, 1, 2, 3]);
    });

    it.each([
        ["no modules known", nameOnly],
        ["Appointments off", { ...withBookings, modules: ["WEBSITE"] }],
        [
            "Appointments on, with no services yet",
            { ...withBookings, serviceIds: [] },
        ],
        [
            "a malformed context",
            { ...nameOnly, modules: "APPOINTMENTS", serviceIds: [1, null] },
        ],
    ] as [string, WithModules][])(
        "offers placeholder features instead of Services, with %s",
        (_label, ctx) => {
            expect(homeTypes(ctx)).toEqual([
                "hero",
                "features",
                "features",
                "cta",
            ]);
            const home = instantiateTemplate(personalTemplate, ctx).pages[0];
            expect(home.sections.map((s) => s.order)).toEqual([0, 1, 2, 3]);
        },
    );

    it("lists each service once, at most 24", () => {
        const ids = Array.from({ length: 30 }, (_v, i) => `svc_${i}`);
        expect(
            personalServiceIds({
                ...nameOnly,
                modules: ["APPOINTMENTS"],
                serviceIds: ["svc_0", ...ids],
            } as WithModules),
        ).toEqual(ids.slice(0, 24));
    });

    it.each(profiles)("carries no image, for %s", (_label, ctx) => {
        const { pages } = instantiateTemplate(personalTemplate, ctx);
        for (const section of pages.flatMap((p) => p.sections)) {
            expect(imageSources(section.content)).toEqual([]);
        }
    });

    it.each(profiles)(
        "never speaks as a company to its customers, for %s",
        (_label, ctx) => {
            const copy = instantiateTemplate(personalTemplate, ctx)
                .pages.flatMap((p) => p.sections)
                .flatMap((s) => strings(s.content))
                .join(" ")
                .toLowerCase();
            expect(copy).not.toMatch(/\b(we|we're|we'll|our|us)\b/);
            expect(copy).not.toContain("customers");
        },
    );

    it("heads Home with the name, and prefers the owner's own words", () => {
        const plain = instantiateTemplate(personalTemplate, nameOnly).pages[0];
        expect(plain.sections[0]?.content).toMatchObject({
            variant: "centered",
            heading: "Sample Name",
            subheading: "Welcome — here's how Sample Name can help.",
        });
        const full = instantiateTemplate(personalTemplate, fullProfile)
            .pages[0];
        expect(full.sections[0]?.content).toMatchObject({
            heading: "Sample Studio",
            subheading: "Help with the paperwork, one client at a time.",
            cta: { label: "Get in touch", href: "mailto:hello@example.com" },
        });
    });

    it.each([
        ["with an email", fullProfile],
        ["without one", nameOnly],
    ])("sends every link somewhere real, %s", (_label, ctx) => {
        const { pages } = instantiateTemplate(personalTemplate, ctx);
        const paths = new Set(pages.map((p) => p.path));
        const hrefs = pages
            .flatMap((p) => p.sections)
            .flatMap((s) => {
                const c = s.content as {
                    href?: string;
                    cta?: { href?: string };
                };
                return [c.href, c.cta?.href].filter(
                    (h): h is string => typeof h === "string",
                );
            });
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
            expect(
                href.startsWith("mailto:") ? ctx.contactEmail : paths.has(href),
            ).toBeTruthy();
        }
    });

    it("asks for an email on the Contact form, so an enquiry can reach a contact", () => {
        const contact = instantiateTemplate(personalTemplate, nameOnly)
            .pages[2];
        const form = contact.sections[0]?.content as {
            formId?: string;
            fields: { name: string; type: string }[];
        };
        expect(form.fields.map((f) => f.type)).toContain("email");
        // The editor makes the Form on the first save (sync-enquiry-forms).
        expect(form.formId).toBeUndefined();
    });

    it("weaves the legal name into About, escaped as text", () => {
        const about = instantiateTemplate(personalTemplate, {
            organizationName: "Rye & Co.",
            legalName: "Rye <&> Co. Pvt Ltd",
        }).pages[1];
        const text = about.sections[1]?.content as { value: string };
        expect(text.value).toContain("Rye &lt;&amp;&gt; Co. Pvt Ltd");
        expect(text.value).not.toContain("<&>");
    });
});
