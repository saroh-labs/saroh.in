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
    CLINIC_GALLERY_SAMPLE,
    CLINIC_TEMPLATE_ID,
    clinicServiceIds,
    clinicTemplate,
} from "./clinic";

type Ctx = TemplateContext;

const nameOnly: Ctx = { organizationName: "Sample Clinic" };
const withEmail: Ctx = {
    organizationName: "Sample Clinic",
    contactEmail: "desk@example.com",
};
const booking: Ctx = {
    ...withEmail,
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_checkup", "svc_root_canal"],
};

const profiles: [string, Ctx][] = [
    ["a name only", nameOnly],
    ["a name and an email", withEmail],
    ["a name with markup characters", { organizationName: "Rao & <Co>" }],
    ["Appointments on, treatments listed", booking],
    [
        "Appointments on, treatments listed, no email",
        { ...booking, contactEmail: undefined },
    ],
    [
        "Appointments on, no treatments yet",
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
    const [page] = instantiateTemplate(clinicTemplate, ctx).pages;
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

describe("clinic@1 (industry templates U11)", () => {
    it("is registered as the Clinic template, version 1", () => {
        expect(clinicTemplate.id).toBe(CLINIC_TEMPLATE_ID);
        expect(getTemplate("clinic")).toBe(clinicTemplate);
        expect(listTemplates()).toContain(clinicTemplate);
        expect(clinicTemplate.version).toBe(1);
    });

    it("carries the gallery's facts: a Services site for clinics", () => {
        expect(clinicTemplate).toMatchObject({
            slug: "clinic",
            shape: "services",
            kinds: ["clinic"],
            sample: { name: "Kavi Dental", host: "kavidental.saroh.app" },
            uses: ["APPOINTMENTS"],
        });
        for (const kind of clinicTemplate.kinds ?? []) {
            expect(TEMPLATE_KINDS).toContain(kind);
        }
        expect(TEMPLATE_SHAPES).toContain(clinicTemplate.shape);
    });

    it("comes in Tide, then Heather, both in Inter Tight over Inter", () => {
        const styles = clinicTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["tide", "Tide"],
            ["heather", "Heather"],
        ]);
        expect(templateStylePreset(clinicTemplate)?.id).toBe("tide");
        expect(templateStylePreset(clinicTemplate, "heather")?.id).toBe(
            "heather",
        );
        for (const s of styles) {
            expect(s.style.fontPair).toBe("inter-tight");
            expect(isFontPairKey(s.style.fontPair)).toBe(true);
        }
    });

    it("draws both colourways in exact colours, every pairing readable, in one type scale", () => {
        const [tide, heather] = clinicTemplate.styles ?? [];
        expect(tide.style.palette).toMatchObject({
            bg: "#F4F7F8",
            fg: "#16303A",
            accent: "#2F7A8C",
        });
        expect(heather.style.palette).toMatchObject({
            bg: "#F7F6F8",
            accent: "#766496",
        });
        for (const s of [tide, heather]) {
            expect(parsePalette(s.style.palette)).toMatchObject({ ok: true });
            expect(parseTypeScale(s.style.type)).toEqual({
                ok: true,
                type: {
                    displaySize: 52,
                    bodySize: 16,
                    measure: 68,
                    contentWidth: 1120,
                    labelStyle: "eyebrow",
                },
            });
        }
        expect(clinicTemplate.footer).toEqual({
            line: "Your clinic's address · your registration number",
            layout: "left",
        });
    });

    it.each(profiles)(
        "instantiates, and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(clinicTemplate, ctx);
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

    it("answers can I get an appointment, then what a treatment involves", () => {
        expect(types(booking)).toEqual([
            "hero",
            "servicesList",
            "features",
            "person",
            "faq",
            "contact",
            "hours",
        ]);
        expect(section(booking, "hero")).toMatchObject({
            variant: "split",
            onToday: true,
            cta: { label: "Book an appointment", href: "/book" },
        });
        expect(section(booking, "hero")?.image).toBeUndefined();
        expect(section(booking, "servicesList")).toMatchObject({
            anchor: "treatments",
            band: "surface",
            heading: "Treatments",
            serviceIds: ["svc_checkup", "svc_root_canal"],
            showPrices: true,
            layout: "cards",
        });
        expect(clinicServiceIds(booking)).toEqual([
            "svc_checkup",
            "svc_root_canal",
        ]);
    });

    it("never claims a reminder the platform does not send", () => {
        for (const [, ctx] of profiles) {
            expect(copy(ctx).toLowerCase()).not.toMatch(/remind/);
        }
    });

    it.each([
        ["no modules known", withEmail],
        ["Appointments off", { ...booking, modules: ["WEBSITE"] }],
        ["no treatments yet", { ...booking, serviceIds: [] }],
    ] as [string, Ctx][])(
        "with %s, lists no treatments and drops the visits question",
        (_label, ctx) => {
            expect(types(ctx)).not.toContain("servicesList");
            expect(section(ctx, "hero")?.cta).toBeUndefined();
            const faq = section(ctx, "faq") as {
                items: { question: string }[];
            };
            expect(faq.items.map((i) => i.question)).not.toContain(
                "How many visits will a treatment take?",
            );
        },
    );

    it("asks by email when there is one, by a form only when nothing else reaches the clinic", () => {
        expect(types(booking)).toContain("contact");
        expect(types(nameOnly)).toContain("enquiry");
        expect(types(nameOnly)).not.toContain("contact");
        const bookingNoEmail = { ...booking, contactEmail: undefined };
        expect(types(bookingNoEmail)).not.toContain("enquiry");
        expect(types(bookingNoEmail)).not.toContain("contact");
    });

    it("leads the header menu with five sections", () => {
        expect(inPageNavigation(home(booking).sections)).toEqual([
            { label: "Treatments", href: "/#treatments" },
            { label: "How it works", href: "/#how" },
            { label: "Doctors", href: "/#doctors" },
            { label: "Questions", href: "/#questions" },
            { label: "Hours", href: "/#hours" },
        ]);
    });

    it("derives the steps' count, and keeps an editable disclaimer under them", () => {
        const how = section(booking, "features") as {
            variant: string;
            intro: string;
            items: unknown[];
            note: string;
        };
        expect(how.variant).toBe("steps");
        expect(how.items).toHaveLength(4);
        expect(how.intro).toMatch(/^Four steps,/);
        expect(how.note).toMatch(/not a diagnosis|is a diagnosis/);
        expect(how.note).toMatch(/emergency/);
    });

    it("sets the doctors as placeholders with photo briefs, never invented people", () => {
        const person = section(booking, "person") as {
            variant: string;
            name: string;
            bio: string;
            image?: unknown;
            people: { name: string; bio: string; imageBrief: string }[];
            imageBrief: string;
        };
        expect(person.variant).toBe("team");
        const all = [person, ...person.people];
        expect(all).toHaveLength(2);
        for (const p of all) {
            expect(p.name).toMatch(/^Your (first|second) doctor$/);
            expect(p.bio).toMatch(/^A placeholder\. /);
            expect(p.imageBrief.length).toBeGreaterThan(20);
        }
        expect(person.image).toBeUndefined();
    });

    it("reads the hours and address from the business, on the dark band", () => {
        expect(section(booking, "hours")).toEqual({
            anchor: "hours",
            navLabel: "Hours",
            band: "inverse",
            title: "Appointments and hours",
            groupDays: true,
            showAddress: true,
        });
    });

    it.each(profiles)(
        "types no price, length, qualification, sample person or medical claim, for %s",
        (_label, ctx) => {
            const text = copy(ctx);
            expect(text).not.toMatch(/₹|Rs\.?\s?\d|\$\d|£\d/);
            expect(text).not.toMatch(/\d+\s?(min|hr|hours?)\b/);
            expect(text).not.toMatch(/\d{1,2}:\d{2}/);
            expect(text).not.toMatch(/\b(BDS|MDS|MBBS)\b/);
            for (const d of CLINIC_GALLERY_SAMPLE.doctors) {
                expect(text).not.toContain(d.name);
            }
            expect(text).not.toMatch(/Indiranagar|Kavi/);
            expect(text.toLowerCase()).not.toMatch(
                /\b(cure|cures|painless|guarantee|best|transform)\b/,
            );
        },
    );
});
