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
import {
    TEMPLATE_KINDS,
    TEMPLATE_SHAPES,
    templateStylePreset,
} from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import {
    SALON_GALLERY_SAMPLE,
    SALON_TEMPLATE_ID,
    salonServiceIds,
    salonTemplate,
} from "./salon";

type Ctx = TemplateContext;

const nameOnly: Ctx = { organizationName: "Sample Salon" };
const withEmail: Ctx = {
    organizationName: "Sample Salon",
    contactEmail: "hello@example.com",
};
const booking: Ctx = {
    ...withEmail,
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_cut", "svc_colour", "svc_cut"],
};

const profiles: [string, Ctx][] = [
    ["a name only", nameOnly],
    ["a name and an email", withEmail],
    ["a name with markup characters", { organizationName: "Kesar & <Co>" }],
    ["Appointments on, services listed", booking],
    [
        "Appointments on, no services yet",
        { ...withEmail, modules: ["APPOINTMENTS"], serviceIds: [] },
    ],
    ["Appointments off", { ...booking, modules: ["WEBSITE", "CRM"] }],
    [
        "a malformed context",
        {
            ...nameOnly,
            modules: "APPOINTMENTS",
            serviceIds: [1, null],
        } as unknown as Ctx,
    ],
];

function home(ctx: Ctx) {
    const [page] = instantiateTemplate(salonTemplate, ctx).pages;
    return page;
}

function types(ctx: Ctx): string[] {
    return home(ctx).sections.map((s) => s.type);
}

function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.entries(value)
            .filter(([k]) => k !== "imageBrief")
            .flatMap(([, v]) => strings(v));
    }
    return [];
}

function copy(ctx: Ctx): string {
    return home(ctx)
        .sections.flatMap((s) => strings(s.content))
        .join(" ");
}

function section(ctx: Ctx, type: string) {
    return home(ctx).sections.find((s) => s.type === type)?.content as
        Record<string, unknown> | undefined;
}

describe("salon@1 (industry templates U11)", () => {
    it("is registered as the Salon template, version 1", () => {
        expect(salonTemplate.id).toBe(SALON_TEMPLATE_ID);
        expect(getTemplate("salon")).toBe(salonTemplate);
        expect(listTemplates()).toContain(salonTemplate);
        expect(salonTemplate.version).toBe(1);
    });

    it("carries the gallery's facts: a Services site for salons", () => {
        expect(salonTemplate).toMatchObject({
            slug: "salon",
            shape: "services",
            kinds: ["salon"],
            sample: { name: "Kesar Salon", host: "kesarsalon.saroh.app" },
            uses: ["APPOINTMENTS"],
        });
        for (const kind of salonTemplate.kinds ?? []) {
            expect(TEMPLATE_KINDS).toContain(kind);
        }
        expect(TEMPLATE_SHAPES).toContain(salonTemplate.shape);
    });

    it("comes in Kesar, then Mauve, both in Fraunces and Inter Tight", () => {
        const styles = salonTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["kesar", "Kesar"],
            ["mauve", "Mauve"],
        ]);
        expect(templateStylePreset(salonTemplate)?.id).toBe("kesar");
        expect(templateStylePreset(salonTemplate, "mauve")?.id).toBe("mauve");
        for (const s of styles) {
            expect(s.style.fontPair).toBe("fraunces-inter-tight");
            expect(isFontPairKey(s.style.fontPair)).toBe(true);
        }
    });

    it("draws both colourways in exact colours, every pairing readable, in one type scale", () => {
        const [kesar, mauve] = salonTemplate.styles ?? [];
        expect(kesar.style.palette).toMatchObject({
            bg: "#F7EFE9",
            fg: "#2B1D1A",
            // The gallery's #B4533A a step darker, to read 4.5:1 as a link.
            accent: "#AF4F36",
        });
        expect(mauve.style.palette).toMatchObject({
            bg: "#F6EEF4",
            accent: "#9A5095",
        });
        for (const s of [kesar, mauve]) {
            expect(parsePalette(s.style.palette)).toMatchObject({ ok: true });
            expect(parseTypeScale(s.style.type)).toEqual({
                ok: true,
                type: {
                    displaySize: 64,
                    bodySize: 16,
                    measure: 60,
                    contentWidth: 1200,
                },
            });
        }
        expect(salonTemplate.footer).toEqual({
            line: "Your street and neighbourhood · the day you are closed",
            layout: "left",
        });
    });

    it.each(profiles)(
        "instantiates, and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(salonTemplate, ctx);
            expect(pages.map((p) => p.path)).toEqual(["/"]);
            expect(pages[0]?.isHome).toBe(true);
            for (const s of pages.flatMap((p) => p.sections)) {
                expect(
                    parseSectionContent(s.type, s.contractVersion, s.content),
                ).toMatchObject({ success: true });
            }
            expect(pages[0]?.sections.map((s) => s.order)).toEqual(
                pages[0]?.sections.map((_s, i) => i),
            );
        },
    );

    it("answers who is free and what it costs first: the free times beside the headline, then the prices", () => {
        expect(types(booking)).toEqual([
            "hero",
            "servicesList",
            "person",
            "features",
            "visitUs",
        ]);
        expect(section(booking, "hero")).toMatchObject({
            variant: "centered",
            heading: "Book your chair. Walk in fresh.",
            onToday: true,
            cta: { label: "See prices", href: "/#prices" },
        });
        expect(section(booking, "servicesList")).toEqual({
            anchor: "prices",
            navLabel: "Prices",
            band: "surface",
            heading: "Services and prices",
            intro: "What each one costs and how long it takes in the chair. Book any of them with whoever is free.",
            // Each listed once, as the business names them.
            serviceIds: ["svc_cut", "svc_colour"],
            showPrices: true,
            showDescriptions: true,
            layout: "list",
            buttonLabel: "Book",
        });
        expect(salonServiceIds(booking)).toEqual(["svc_cut", "svc_colour"]);
    });

    it.each([
        ["no modules known", withEmail],
        ["Appointments off", { ...booking, modules: ["WEBSITE"] }],
        ["no services yet", { ...booking, serviceIds: [] }],
    ] as [string, Ctx][])(
        "with %s, lists no prices and offers a form to ask for a time",
        (_label, ctx) => {
            expect(types(ctx)).not.toContain("servicesList");
            expect(types(ctx)).toContain("enquiry");
            const hero = section(ctx, "hero");
            expect(hero?.cta).toBeUndefined();
            expect(String(hero?.subheading)).not.toMatch(/free today/);
            const form = section(ctx, "enquiry") as {
                fields: { type: string }[];
            };
            expect(form.fields.map((f) => f.type)).toContain("email");
        },
    );

    it("shows the free-today panel only with Appointments on", () => {
        expect(section(withEmail, "hero")?.onToday).toBeUndefined();
        expect(
            section({ ...withEmail, modules: ["APPOINTMENTS"] }, "hero")
                ?.onToday,
        ).toBe(true);
    });

    it("leads the header menu with Prices, Stylists and Find us", () => {
        expect(inPageNavigation(home(booking).sections)).toEqual([
            { label: "Prices", href: "/#prices" },
            { label: "Stylists", href: "/#stylists" },
            { label: "Find us", href: "/#find" },
        ]);
        expect(inPageNavigation(home(nameOnly).sections)).toEqual([
            { label: "Stylists", href: "/#stylists" },
            { label: "Appointments", href: "/#appointments" },
            { label: "Find us", href: "/#find" },
        ]);
    });

    it("sets the stylists as placeholders with photo briefs, never invented people", () => {
        const person = section(booking, "person") as {
            variant: string;
            name: string;
            bio: string;
            image?: unknown;
            imageBrief: string;
            people: { name: string; bio: string; imageBrief: string }[];
        };
        expect(person.variant).toBe("team");
        const all = [person, ...person.people];
        expect(all).toHaveLength(3);
        for (const p of all) {
            expect(p.name).toMatch(/^Your (first|second|third) stylist$/);
            // The pre-publish check names "placeholder" until it is replaced.
            expect(p.bio).toMatch(/^A placeholder\. /);
            expect(p.imageBrief.length).toBeGreaterThan(20);
        }
        expect(person.image).toBeUndefined();
    });

    it("asks the owner to state every policy, on the accent band", () => {
        const before = section(booking, "features") as {
            band: string;
            columns: number;
            items: { title: string; body: string }[];
        };
        expect(before.band).toBe("accent");
        expect(before.columns).toBe(2);
        for (const item of before.items) {
            expect(item.body).toMatch(/^Say (how|whether) /);
        }
    });

    it("reads the place, the week and directions from the business", () => {
        expect(section(booking, "visitUs")).toEqual({
            anchor: "find",
            navLabel: "Find us",
            title: "Find the salon",
            showMap: true,
            showHours: true,
        });
    });

    it.each(profiles)(
        "types no price, length, time or sample person, for %s",
        (_label, ctx) => {
            const text = copy(ctx);
            expect(text).not.toMatch(/₹|Rs\.?\s?\d|\$\d|£\d/);
            expect(text).not.toMatch(/\d+\s?(min|hr|hours?)\b/);
            expect(text).not.toMatch(/\d{1,2}:\d{2}/);
            for (const s of SALON_GALLERY_SAMPLE.stylists) {
                expect(text).not.toContain(s.name);
            }
            for (const line of SALON_GALLERY_SAMPLE.before) {
                expect(text).not.toContain(line);
            }
        },
    );

    it("uses the business's own words for the line when it has them", () => {
        expect(
            section({ ...booking, tagline: "Cuts on Linking Road" }, "hero")
                ?.subheading,
        ).toBe("Cuts on Linking Road");
    });
});
