import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
import { parseRenderedContent } from "./rendered";
import {
    FEATURE_VALUE_MAX,
    parseSectionContent,
    PERSON_TEAM_MAX,
} from "./section-contract";
import { resolveVariant } from "./variants";

/**
 * The block extensions the template polish adds: each is optional, so a
 * section written before it validates and draws as it did, and each new
 * field is bounded and refused past its bounds.
 */

describe("features: figures, two columns, a note and the facts row", () => {
    const items = [{ title: "Day rate", value: "Your rate", body: "Min. 2" }];

    it("saves a figure per point, two columns and a note", () => {
        const parsed = parseSectionContent("features", 1, {
            variant: "list",
            items,
            columns: 2,
            note: "Figures are yours to write.",
        });
        expect(parsed.success).toBe(true);
    });

    it("refuses a figure past its length, and three columns", () => {
        expect(
            parseSectionContent("features", 1, {
                items: [
                    { title: "x", value: "9".repeat(FEATURE_VALUE_MAX + 1) },
                ],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("features", 1, { items, columns: 3 }).success,
        ).toBe(false);
    });

    it("keeps a section written before them valid", () => {
        expect(
            parseSectionContent("features", 1, {
                variant: "grid",
                items: [{ title: "x" }],
            }).success,
        ).toBe(true);
    });

    it("knows the facts look, and its fixture parses", () => {
        expect(resolveVariant("features", { variant: "facts" })).toBe("facts");
        expect(
            parseRenderedContent("features", BLOCK_META.features.fixtures.facts)
                .success,
        ).toBe(true);
    });
});

describe("richText: left-aligned, photo above, part labels, a callout", () => {
    const value = "<h3>The problem</h3><p>Three spreadsheets.</p>";

    it("saves the left look, a photo above, labels and a callout", () => {
        expect(
            parseSectionContent("richText", 1, {
                variant: "left",
                value,
                image: { src: "/a.jpg", alt: "The board" },
                imageSide: "above",
                partLabels: true,
                callout: { label: "What changed", text: "No downtime." },
            }).success,
        ).toBe(true);
    });

    it("refuses a callout with no words, and an unknown side", () => {
        expect(
            parseSectionContent("richText", 1, {
                value,
                callout: { label: "What changed", text: " " },
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("richText", 1, { value, imageSide: "below" })
                .success,
        ).toBe(false);
    });

    it("knows the left look; content with none is the centred column", () => {
        expect(resolveVariant("richText", { variant: "left" })).toBe("left");
        expect(resolveVariant("richText", { value })).toBe("default");
    });
});

describe("hours and visitUs: grouped days, the address, the business's place", () => {
    it("saves grouped days and the address, and refuses a non-switch", () => {
        expect(
            parseSectionContent("hours", 1, {
                groupDays: true,
                showAddress: true,
            }).success,
        ).toBe(true);
        expect(
            parseSectionContent("hours", 1, { groupDays: "yes" }).success,
        ).toBe(false);
    });

    it("saves a Visit us with no shop chosen: it shows the business's own place", () => {
        expect(parseSectionContent("visitUs", 1, {}).success).toBe(true);
    });
});

describe("plans: a line under the title", () => {
    it("saves an intro and refuses one past its length", () => {
        expect(
            parseSectionContent("plans", 1, { intro: "No joining fee." })
                .success,
        ).toBe(true);
        expect(
            parseSectionContent("plans", 1, { intro: "x".repeat(601) }).success,
        ).toBe(false);
    });
});

describe("productGrid: what is left, a note and bare cards", () => {
    it("saves the count switch, a note and the bare card", () => {
        expect(
            parseSectionContent("productGrid", 1, {
                showAvailability: true,
                note: "Baked this morning.",
                cardStyle: "bare",
            }).success,
        ).toBe(true);
    });

    it("refuses an unknown card style and a note past its length", () => {
        expect(
            parseSectionContent("productGrid", 1, { cardStyle: "glass" })
                .success,
        ).toBe(false);
        expect(
            parseSectionContent("productGrid", 1, { note: "x".repeat(401) })
                .success,
        ).toBe(false);
    });
});

describe("projects: rhythm and rows, year, role and meta, a count", () => {
    const item = {
        title: "A dispatch board",
        year: "2019–2022",
        role: "Sole engineer",
        meta: "Go · Postgres",
    };

    it("saves the rows fields and the count switch", () => {
        expect(
            parseSectionContent("projects", 1, {
                variant: "rows",
                items: [item],
                showCount: true,
            }).success,
        ).toBe(true);
    });

    it("refuses a year or role past its length", () => {
        expect(
            parseSectionContent("projects", 1, {
                items: [{ ...item, year: "x".repeat(21) }],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("projects", 1, {
                items: [{ ...item, role: "x".repeat(81) }],
            }).success,
        ).toBe(false);
    });

    it("knows both looks, and their fixtures parse", () => {
        for (const look of ["rhythm", "rows"] as const) {
            expect(resolveVariant("projects", { variant: look })).toBe(look);
            expect(
                parseRenderedContent(
                    "projects",
                    BLOCK_META.projects.fixtures[look],
                ).success,
            ).toBe(true);
        }
    });
});

describe("person: portrait, team, credential rows, the page's title", () => {
    it("saves rows beside lines, a label, asTitle, a team title and people", () => {
        expect(
            parseSectionContent("person", 1, {
                variant: "team",
                name: "Devika",
                asTitle: true,
                title: "Who is coaching",
                credentials: [
                    "Registered Dietitian",
                    { title: "MSc", detail: "Manipal, 2012" },
                ],
                credentialsLabel: "Qualifications",
                people: [{ name: "Arjun", role: "Conditioning" }],
            }).success,
        ).toBe(true);
    });

    it("refuses a nameless team member, a row with no title, and too many people", () => {
        expect(
            parseSectionContent("person", 1, {
                name: "Devika",
                people: [{ name: " " }],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("person", 1, {
                name: "Devika",
                credentials: [{ title: "", detail: "x" }],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("person", 1, {
                name: "Devika",
                people: Array.from({ length: PERSON_TEAM_MAX + 1 }, () => ({
                    name: "x",
                })),
            }).success,
        ).toBe(false);
    });

    it("knows both looks; a person with none keeps the photo beside", () => {
        expect(resolveVariant("person", { variant: "portrait" })).toBe(
            "portrait",
        );
        expect(resolveVariant("person", { variant: "team" })).toBe("team");
        expect(resolveVariant("person", { name: "x" })).toBe("default");
    });
});
