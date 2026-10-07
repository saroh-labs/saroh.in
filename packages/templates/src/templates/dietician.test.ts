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
    DIETICIAN_GALLERY_SAMPLE,
    DIETICIAN_TEMPLATE_ID,
    dieticianServiceIds,
    dieticianTemplate,
} from "./dietician";

type Ctx = TemplateContext;

const nameOnly: Ctx = { organizationName: "Dr Sample Name" };
const withEmail: Ctx = {
    organizationName: "Dr Sample Name",
    contactEmail: "clinic@example.com",
};
const oneService: Ctx = {
    ...withEmail,
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_initial"],
};
const twoServices: Ctx = {
    ...withEmail,
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_initial", "svc_follow_up"],
};

const profiles: [string, Ctx][] = [
    ["a name only", nameOnly],
    ["a name and an email", withEmail],
    ["a name with markup characters", { organizationName: "Nair & <Co>" }],
    ["Appointments on, one service", oneService],
    ["Appointments on, two services", twoServices],
    [
        "Appointments on, no services yet",
        { ...withEmail, modules: ["APPOINTMENTS"], serviceIds: [] },
    ],
    ["Appointments off", { ...withEmail, modules: ["WEBSITE", "CRM"] }],
    [
        "a malformed context",
        // Cast: the API could hand over anything, and nothing breaks.
        {
            ...nameOnly,
            modules: "APPOINTMENTS",
            serviceIds: [1, null],
        } as unknown as Ctx,
    ],
];

function home(ctx: Ctx) {
    const [page] = instantiateTemplate(dieticianTemplate, ctx).pages;
    return page;
}

function types(ctx: Ctx): string[] {
    return home(ctx).sections.map((s) => s.type);
}

function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

function copy(ctx: Ctx): string {
    return home(ctx)
        .sections.flatMap((s) => strings(s.content))
        .join(" ");
}

describe("dietician@1 (industry templates U7)", () => {
    it("is registered as the Dietician template, version 1", () => {
        expect(dieticianTemplate.id).toBe(DIETICIAN_TEMPLATE_ID);
        expect(getTemplate("dietician")).toBe(dieticianTemplate);
        expect(listTemplates()).toContain(dieticianTemplate);
        expect(dieticianTemplate.version).toBe(1);
    });

    it("carries the gallery's facts: a Services site for coaches and clinics", () => {
        expect(dieticianTemplate).toMatchObject({
            slug: "dietician",
            shape: "services",
            kinds: ["coach", "clinic"],
            sample: { name: "Dr Priya Nair", host: "drpriya.saroh.app" },
            uses: ["APPOINTMENTS"],
        });
        for (const kind of dieticianTemplate.kinds ?? []) {
            expect(TEMPLATE_KINDS).toContain(kind);
        }
        expect(TEMPLATE_SHAPES).toContain(dieticianTemplate.shape);
    });

    it("comes in Sage, then Clay, both in Source Serif and Inter", () => {
        const styles = dieticianTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["sage", "Sage"],
            ["clay", "Clay"],
        ]);
        expect(templateStylePreset(dieticianTemplate)?.id).toBe("sage");
        expect(templateStylePreset(dieticianTemplate, "clay")?.id).toBe("clay");
        for (const s of styles) {
            expect(s.style.fontPair).toBe("source-serif-inter");
            expect(isFontPairKey(s.style.fontPair)).toBe(true);
        }
        expect(styles[0]?.style.colours?.accent).toBe("moss");
        expect(styles[1]?.style.colours?.accent).toBe("clay");
    });

    it("draws Sage and Clay in the design's exact colours, every pairing readable", () => {
        const [sage, clay] = dieticianTemplate.styles ?? [];
        expect(sage.style.palette).toMatchObject({
            bg: "#FBFAF6",
            surface: "#EDF2EC",
            fg: "#1C2620",
            body: "#24322B",
            muted: "#47564D",
            accent: "#2F6B4F",
        });
        expect(clay.style.palette).toMatchObject({
            bg: "#FDF9F7",
            surface: "#F1E6DF",
            accent: "#8A483B",
        });
        for (const s of [sage, clay]) {
            expect(parsePalette(s.style.palette)).toMatchObject({ ok: true });
            expect(parseTypeScale(s.style.type)).toEqual({
                ok: true,
                type: {
                    displaySize: 40,
                    bodySize: 17,
                    measure: 66,
                    contentWidth: 1080,
                },
            });
        }
        expect(dieticianTemplate.footer).toEqual({
            line: "Your neighbourhood and city",
            layout: "left",
        });
    });

    it.each(profiles)(
        "instantiates, and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(dieticianTemplate, ctx);
            expect(pages.map((p) => p.path)).toEqual(["/"]);
            expect(pages[0]?.isHome).toBe(true);
            for (const section of pages.flatMap((p) => p.sections)) {
                expect(
                    parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    ),
                ).toMatchObject({ success: true });
            }
            expect(pages[0]?.sections.map((s) => s.order)).toEqual(
                pages[0]?.sections.map((_s, i) => i),
            );
        },
    );

    it("lays the page down in the design's order, one service as a price card", () => {
        expect(types(oneService)).toEqual([
            "person",
            "features",
            "features",
            "servicesList",
            "features",
            "journal",
            "contact",
            "hours",
        ]);
        const consultation = home(oneService).sections[3]?.content as {
            intro: string;
        };
        expect(consultation.intro).toMatch(
            /^There is one appointment type and one price\.[^]*\n\nVideo consultations/,
        );
        expect(consultation).toEqual({
            anchor: "consultation",
            navLabel: "Consultations",
            variant: "priceCard",
            heading: "One consultation",
            intro: consultation.intro,
            serviceIds: ["svc_initial"],
            showPrices: true,
            buttonLabel: "Ask for a time",
            modeLine: "In person, or by video",
            followUpLine:
                "Follow-ups are usually six weeks apart. I will tell you if you do not need one.",
            includesLabel: "What it includes",
            includes: [
                "The consultation itself, in person or by video",
                "A written plan afterwards, in plain language, by email",
                "Review of any blood work or notes you bring",
                "One short follow-up question by email within the first month",
            ],
        });
    });

    it("lists several services as cards, what they include under them", () => {
        expect(types(twoServices)).toEqual([
            "person",
            "features",
            "features",
            "servicesList",
            "features",
            "features",
            "journal",
            "contact",
            "hours",
        ]);
        const list = home(twoServices).sections[3]?.content as {
            heading: string;
            intro: string;
            layout: string;
            anchor: string;
        };
        expect(list).toMatchObject({
            heading: "Consultations",
            layout: "cards",
            anchor: "consultation",
        });
        expect(list.intro).not.toMatch(/one price/);
        expect(home(twoServices).sections[4]?.content).toMatchObject({
            heading: "What it includes",
        });
    });

    it.each([
        ["no modules known", withEmail],
        ["Appointments off", { ...oneService, modules: ["WEBSITE"] }],
        ["no services yet", { ...oneService, serviceIds: [] }],
    ] as [string, Ctx][])(
        "with %s, the consultation is described, not listed",
        (_label, ctx) => {
            expect(types(ctx)).not.toContain("servicesList");
            expect(home(ctx).sections[3]).toMatchObject({
                type: "features",
                content: {
                    heading: "One consultation",
                    anchor: "consultation",
                },
            });
        },
    );

    it("leads the header with the design's four sections", () => {
        for (const ctx of [oneService, twoServices, nameOnly]) {
            expect(inPageNavigation(home(ctx).sections)).toEqual([
                { label: "How I work", href: "/#how" },
                { label: "Consultations", href: "/#consultation" },
                { label: "Areas", href: "/#areas" },
                { label: "Writing", href: "/#writing" },
            ]);
        }
    });

    it("asks for an appointment by email when there is one, else by a form", () => {
        expect(types(withEmail)).toContain("contact");
        expect(types(withEmail)).not.toContain("enquiry");
        const contact = home(withEmail).sections.find(
            (s) => s.type === "contact",
        );
        expect(contact?.content).toMatchObject({
            heading: "Getting an appointment",
            email: "clinic@example.com",
        });

        expect(types(nameOnly)).toContain("enquiry");
        expect(types(nameOnly)).not.toContain("contact");
        const form = home(nameOnly).sections.find((s) => s.type === "enquiry")
            ?.content as { fields: { type: string }[]; formId?: string };
        expect(form.fields.map((f) => f.type)).toContain("email");
        expect(form.formId).toBeUndefined();
    });

    it("opens on the practitioner by the business's name, as the page's title, with a portrait brief and no photo", () => {
        const person = home(nameOnly).sections[0]?.content as {
            variant: string;
            asTitle: boolean;
            name: string;
            image?: unknown;
            imageBrief: string;
            credentials: { title: string; detail: string }[];
        };
        expect(person.variant).toBe("portrait");
        expect(person.asTitle).toBe(true);
        expect(person.name).toBe("Dr Sample Name");
        expect(person.image).toBeUndefined();
        expect(person.imageBrief).toBe(
            "Professional portrait, seated, plain background, no white coat",
        );
        expect(person.credentials.length).toBeGreaterThan(0);
    });

    it("puts a facts row under the practitioner, every fact the owner's to state", () => {
        const facts = home(withEmail).sections[1]?.content as {
            variant: string;
            items: { value: string; title: string }[];
        };
        expect(facts.variant).toBe("facts");
        expect(facts.items).toHaveLength(3);
        for (const item of facts.items) {
            // A word, never a figure the template made up.
            expect(item.value).not.toMatch(/\d/);
            expect(item.title).toMatch(/^Say (how|which|where)/);
        }
    });

    it.each(profiles)(
        "never ships the sample's credentials or note as fact, for %s",
        (_label, ctx) => {
            const text = copy(ctx);
            for (const credential of DIETICIAN_GALLERY_SAMPLE.credentials) {
                expect(text).not.toContain(credential);
            }
            expect(text).not.toMatch(
                /Manipal|Dietetic Association|Sample credentials/,
            );
            expect(text).not.toContain("Priya");
            // Every qualification row says what to write there.
            const person = home(ctx).sections[0]?.content as {
                credentials: { title: string; detail: string }[];
            };
            for (const row of person.credentials) {
                expect(row.title).toMatch(/^Your [^—]+ — /);
            }
        },
    );

    it.each(profiles)(
        "types no price, length or business data, for %s",
        (_label, ctx) => {
            const text = copy(ctx);
            expect(text).not.toMatch(/₹|Rs\.?\s?\d|\$\d|£\d/);
            expect(text).not.toMatch(/\d+\s?min/);
            expect(text).not.toMatch(/Koregaon|Lane 6|priyanair|10:00|17:00/);
        },
    );

    it.each(profiles)(
        "makes no claim to treat or cure, for %s",
        (_label, ctx) => {
            expect(copy(ctx).toLowerCase()).not.toMatch(
                /\b(cure|cures|transform|guarantee)\b/,
            );
        },
    );

    it("derives every count from the list it counts", () => {
        const sections = home(withEmail).sections;
        const how = sections[2]?.content as {
            intro: string;
            items: unknown[];
            variant: string;
        };
        expect(how.variant).toBe("steps");
        expect(how.items).toHaveLength(4);
        expect(how.intro).toBe(
            "Four stages, and the whole of the first one is listening.",
        );
        const areas = sections[4]?.content as {
            heading: string;
            intro: string;
            items: unknown[];
            columns: number;
        };
        expect(areas.heading).toBe("What I am asked about most");
        expect(areas.items).toHaveLength(6);
        expect(areas.columns).toBe(2);
        expect(areas.intro).toMatch(/^Most of my work sits in these six\./);
        expect(areas.intro).toContain("in your email");
        const noEmail = home(nameOnly).sections[4]?.content as {
            intro: string;
        };
        expect(noEmail.intro).not.toContain("email");
    });

    it("keeps the medical disclaimer under the areas", () => {
        const areas = home(withEmail).sections[4]?.content as { note: string };
        expect(areas.note).toBe(
            "I work alongside your doctor and I do not change prescribed medication or treatment. Nothing here is a diagnosis, and nothing I do replaces medical care.",
        );
    });

    it("lists the writing as a counted archive, which the site's own posts fill", () => {
        expect(
            home(withEmail).sections.find((s) => s.type === "journal")?.content,
        ).toMatchObject({
            variant: "archive",
            title: "Writing",
            showTotal: true,
        });
    });

    it("reads the appointment hours from the business, never types them", () => {
        const hours = home(withEmail).sections.at(-1);
        expect(hours?.type).toBe("hours");
        expect(hours?.content).toEqual({
            variant: "default",
            title: "Appointments",
            groupDays: true,
        });
    });

    it("lists each service once, at most 24, and only with Appointments on", () => {
        const ids = Array.from({ length: 30 }, (_v, i) => `svc_${i}`);
        expect(
            dieticianServiceIds({
                ...nameOnly,
                modules: ["APPOINTMENTS"],
                serviceIds: ["svc_0", ...ids],
            }),
        ).toEqual(ids.slice(0, 24));
        expect(dieticianServiceIds({ ...nameOnly, serviceIds: ids })).toEqual(
            [],
        );
    });

    it("never speaks as a company", () => {
        expect(copy(withEmail).toLowerCase()).not.toMatch(
            /\b(we're|we'll|our|us)\b/,
        );
    });
});
