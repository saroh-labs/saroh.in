import { isFontPairKey, parseSectionContent } from "@saroh/block-contract";
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

    it("lays the page down in the design's order, with the services when they can be booked", () => {
        expect(types(oneService)).toEqual([
            "person",
            "features",
            "servicesList",
            "features",
            "features",
            "richText",
            "journal",
            "contact",
            "hours",
        ]);
        const consultation = home(oneService).sections[2]?.content;
        expect(consultation).toMatchObject({
            heading: "One consultation",
            serviceIds: ["svc_initial"],
            showPrices: true,
            layout: "cards",
            buttonLabel: "Ask for a time",
        });
        expect(home(oneService).sections[3]?.content).toMatchObject({
            heading: "What it includes",
        });
    });

    it("says one price only when there is one service", () => {
        const one = home(oneService).sections[2]?.content as { intro: string };
        expect(one.intro).toMatch(/one appointment type and one price/);
        const two = home(twoServices).sections[2]?.content as {
            heading: string;
            intro: string;
        };
        expect(two.heading).toBe("Consultations");
        expect(two.intro).not.toMatch(/one price/);
    });

    it.each([
        ["no modules known", withEmail],
        ["Appointments off", { ...oneService, modules: ["WEBSITE"] }],
        ["no services yet", { ...oneService, serviceIds: [] }],
    ] as [string, Ctx][])(
        "with %s, the consultation is described, not listed",
        (_label, ctx) => {
            expect(types(ctx)).not.toContain("servicesList");
            expect(home(ctx).sections[2]).toMatchObject({
                type: "features",
                content: { heading: "One consultation" },
            });
        },
    );

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

    it("opens on the practitioner by the business's name, with a portrait brief and no photo", () => {
        const person = home(nameOnly).sections[0]?.content as {
            name: string;
            image?: unknown;
            imageBrief: string;
            credentials: string[];
        };
        expect(person.name).toBe("Dr Sample Name");
        expect(person.image).toBeUndefined();
        expect(person.imageBrief).toBe(
            "Professional portrait, seated, plain background, no white coat",
        );
        expect(person.credentials.length).toBeGreaterThan(0);
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
            // Every qualification line says what to write there.
            const person = home(ctx).sections[0]?.content as {
                credentials: string[];
            };
            for (const line of person.credentials) {
                expect(line).toMatch(/^(Your|Anything)/);
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
        const how = sections[1]?.content as {
            intro: string;
            items: unknown[];
            variant: string;
        };
        expect(how.variant).toBe("steps");
        expect(how.items).toHaveLength(4);
        expect(how.intro).toBe(
            "Four stages, and the whole of the first one is listening.",
        );
        const areas = sections[3]?.content as {
            heading: string;
            intro: string;
            items: unknown[];
        };
        expect(areas.heading).toBe("What I am asked about most");
        expect(areas.items).toHaveLength(6);
        expect(areas.intro).toMatch(/^Most of my work sits in these six\./);
        expect(areas.intro).toContain("in your email");
        const noEmail = home(nameOnly).sections[3]?.content as {
            intro: string;
        };
        expect(noEmail.intro).not.toContain("email");
    });

    it("keeps the medical disclaimer under the areas", () => {
        const text = home(withEmail).sections[4]?.content as { value: string };
        expect(text.value).toContain(
            "I work alongside your doctor and I do not change prescribed medication or treatment.",
        );
    });

    it("lists the writing as an archive, which the site's own posts fill", () => {
        expect(
            home(withEmail).sections.find((s) => s.type === "journal")?.content,
        ).toMatchObject({ variant: "archive", title: "Writing" });
    });

    it("reads the appointment hours from the business, never types them", () => {
        const hours = home(withEmail).sections.at(-1);
        expect(hours?.type).toBe("hours");
        expect(hours?.content).toEqual({
            variant: "default",
            title: "Appointments",
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
