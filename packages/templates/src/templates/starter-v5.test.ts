import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { firstSection, redesignChecks } from "./redesign-checks";
import { starterPrimaryAction, starterTemplateV4 } from "./starter-v4";
import { starterActionV5, starterTemplate } from "./starter-v5";

const nameOnly: TemplateContext = { organizationName: "Sample Business" };
const salon: TemplateContext = {
    organizationName: "Sample Salon",
    description: "Haircuts and colour in Pune",
    area: "Pune",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_cut"],
    hasPlace: true,
    hasHours: true,
    trade: "salon",
};
const bakery: TemplateContext = {
    organizationName: "Sample Bakery",
    modules: ["WEBSITE", "COMMERCE"],
    sells: true,
    trade: "food",
};
const writer: TemplateContext = {
    organizationName: "Sample Writer",
    contactEmail: "writer@example.com",
    trade: "creator",
};

const profiles = [
    nameOnly,
    salon,
    bakery,
    writer,
    { ...salon, trade: undefined },
];

describe("starter@5 (U10, overdrive)", () => {
    redesignChecks(starterTemplate, starterTemplateV4, profiles);

    it("says what and where on day one, beside the Stamp, with one main action", () => {
        const hero = firstSection(starterTemplate, salon);
        expect(hero?.content).toMatchObject({
            variant: "split",
            heading: "Sample Salon",
            subheading: "Haircuts and colour in Pune",
            answerRow: true,
            cta: { label: "Book a chair", href: "/book" },
        });
        // No photo: the split hero's image slot draws the Stamp.
        expect(hero?.content).not.toHaveProperty("image");
        expect(hero?.content).not.toHaveProperty("secondaryCta");
        // No place, no answer row.
        expect(
            firstSection(starterTemplate, nameOnly)?.content,
        ).not.toHaveProperty("answerRow");
    });

    it("words the action for the trade, going where v4's went", () => {
        for (const ctx of profiles) {
            const v4 = starterPrimaryAction(ctx);
            const v5 = starterActionV5(ctx);
            expect(v5.kind).toBe(v4.kind);
            expect(v5.href).toBe(v4.href);
        }
        expect(starterActionV5(salon).label).toBe("Book a chair");
        expect(starterActionV5(bakery).label).toBe("Order now");
        expect(starterActionV5(writer).label).toBe("Get in touch");
        expect(starterActionV5({ ...salon, trade: undefined }).label).toBe(
            "Book a time",
        );
    });

    it("carries the same words on the closing band as on the hero", () => {
        const { pages } = instantiateTemplate(starterTemplate, salon);
        const bands = pages
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "cta");
        expect(bands.length).toBeGreaterThan(0);
        for (const band of bands) {
            expect(band.content).toMatchObject({
                label: "Book a chair",
                href: "/book",
            });
        }
    });

    it("keeps every section v4 lays down after the hero", () => {
        for (const ctx of profiles) {
            const types = (t: typeof starterTemplate) =>
                instantiateTemplate(t, ctx).pages.map((p) =>
                    p.sections.map((s) => s.type),
                );
            expect(types(starterTemplate)).toEqual(types(starterTemplateV4));
        }
    });
});
