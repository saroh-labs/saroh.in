import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
import { parseRenderedContent } from "./rendered";
import {
    IMAGE_BRIEF_MAX,
    parseSectionContent,
    PERSON_BIO_MAX,
    PERSON_CREDENTIALS_MAX,
    TIMETABLE_MAX_SERVICES,
} from "./section-contract";
import { toRendered } from "./to-rendered";
import { resolveVariant } from "./variants";

/**
 * The blocks and looks the industry templates need (U2): hero fullBleed and
 * none, productGrid lead, journal archive, captions, image briefs (KTD-5),
 * and the timetable, hours and person blocks.
 */

const noPage = { resolvePage: () => undefined };

describe("hero looks (U2)", () => {
    it("takes fullBleed and none, and keeps the old rule for no variant", () => {
        expect(resolveVariant("hero", { variant: "fullBleed" })).toBe(
            "fullBleed",
        );
        expect(resolveVariant("hero", { variant: "none" })).toBe("none");
        expect(resolveVariant("hero", { heading: "x" })).toBe("centered");
        expect(
            resolveVariant("hero", { heading: "x", image: { src: "/a.jpg" } }),
        ).toBe("split");
    });

    it("saves a full-bleed hero with no photo yet: it draws as a band", () => {
        expect(
            parseSectionContent("hero", 2, {
                variant: "fullBleed",
                heading: "Bread, the slow way",
            }).success,
        ).toBe(true);
    });

    it("lets a brief stand in for a split hero's photo (KTD-5), not nothing", () => {
        expect(
            parseSectionContent("hero", 2, {
                variant: "split",
                heading: "x",
                imageBrief: "Loaves on the counter",
            }).success,
        ).toBe(true);
        expect(
            parseSectionContent("hero", 2, { variant: "split", heading: "x" })
                .success,
        ).toBe(false);
    });

    it("refuses a brief longer than a line", () => {
        expect(
            parseSectionContent("hero", 2, {
                heading: "x",
                imageBrief: "x".repeat(IMAGE_BRIEF_MAX + 1),
            }).success,
        ).toBe(false);
    });
});

describe("productGrid lead and journal archive (U2)", () => {
    it("are looks the blocks know, and old content keeps its look", () => {
        expect(resolveVariant("productGrid", { variant: "lead" })).toBe("lead");
        expect(resolveVariant("productGrid", {})).toBe("default");
        expect(resolveVariant("journal", { variant: "archive" })).toBe(
            "archive",
        );
        expect(resolveVariant("journal", { count: 6 })).toBe("default");
    });

    it("keeps journal's count as it was: 3 or 6, archive or not", () => {
        expect(
            parseSectionContent("journal", 1, { variant: "archive" }).success,
        ).toBe(true);
        expect(
            parseSectionContent("journal", 1, {
                variant: "archive",
                count: 6,
            }).success,
        ).toBe(true);
        expect(
            parseSectionContent("journal", 1, { count: "all" }).success,
        ).toBe(false);
    });
});

describe("captions and briefs on galleries and projects (U2, KTD-5)", () => {
    it("keeps a caption under a gallery@2 image", () => {
        const parsed = parseSectionContent("gallery", 2, {
            variant: "grid",
            images: [{ src: "/a.jpg", alt: "A", caption: "The counter, 6am" }],
        });
        expect(parsed.success && parsed.data).toMatchObject({
            images: [{ caption: "The counter, 6am" }],
        });
    });

    it("takes a gallery with no images only when it says what it wants", () => {
        expect(
            parseSectionContent("gallery", 2, {
                images: [],
                imageBrief: "Six photos of the workshop",
            }).success,
        ).toBe(true);
        expect(parseSectionContent("gallery", 2, { images: [] }).success).toBe(
            false,
        );
        // v1 is untouched.
        expect(parseSectionContent("gallery", 1, { images: [] }).success).toBe(
            false,
        );
    });

    it("keeps a project's caption and brief", () => {
        const parsed = parseSectionContent("projects", 1, {
            items: [
                {
                    title: "A shopfront",
                    imageBrief: "The shopfront at dusk",
                    caption: "Bandra, 2025",
                },
            ],
        });
        expect(parsed.success && parsed.data).toMatchObject({
            items: [{ imageBrief: "The shopfront at dusk" }],
        });
    });
});

describe("timetable (U2)", () => {
    it("saves with nothing chosen: every class on offer", () => {
        expect(parseSectionContent("timetable", 1, {}).success).toBe(true);
    });

    it("never stores a session, so places left can't go stale", () => {
        const parsed = parseSectionContent("timetable", 1, {
            title: "This week",
            sessions: [{ at: "07:00", name: "Strength" }],
        });
        expect(parsed.success && parsed.data).toEqual({ title: "This week" });
    });

    it("refuses a class twice, and more than the cap", () => {
        expect(
            parseSectionContent("timetable", 1, { serviceIds: ["a", "a"] })
                .success,
        ).toBe(false);
        expect(
            parseSectionContent("timetable", 1, {
                serviceIds: Array.from(
                    { length: TIMETABLE_MAX_SERVICES + 1 },
                    (_, i) => `s${i}`,
                ),
            }).success,
        ).toBe(false);
    });

    it("has a grid and a list look, grid first", () => {
        expect(resolveVariant("timetable", {})).toBe("grid");
        expect(resolveVariant("timetable", { variant: "list" })).toBe("list");
    });

    it("publishes as it was authored", () => {
        const draft = { title: "This week", serviceIds: ["svc_1"] };
        expect(toRendered("timetable", draft, noPage)).toBe(draft);
    });
});

describe("hours (U2)", () => {
    it("saves with no place chosen: the business's own", () => {
        expect(parseSectionContent("hours", 1, {}).success).toBe(true);
    });

    it("never stores the week itself", () => {
        const parsed = parseSectionContent("hours", 1, {
            title: "Hours",
            week: [{ day: "MON", open: "09:00" }],
        });
        expect(parsed.success && parsed.data).toEqual({ title: "Hours" });
    });

    it("refuses an empty place id", () => {
        expect(parseSectionContent("hours", 1, { storeId: "" }).success).toBe(
            false,
        );
    });
});

describe("person (U2)", () => {
    it("needs a name and nothing else", () => {
        expect(
            parseSectionContent("person", 1, { name: "Anika" }).success,
        ).toBe(true);
        expect(parseSectionContent("person", 1, { name: "  " }).success).toBe(
            false,
        );
        expect(parseSectionContent("person", 1, {}).success).toBe(false);
    });

    it("caps the qualifications and the bio", () => {
        expect(
            parseSectionContent("person", 1, {
                name: "A",
                credentials: Array.from(
                    { length: PERSON_CREDENTIALS_MAX + 1 },
                    (_, i) => `C${i}`,
                ),
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("person", 1, {
                name: "A",
                bio: "x".repeat(PERSON_BIO_MAX + 1),
            }).success,
        ).toBe(false);
    });

    it("refuses a script link on its button", () => {
        expect(
            parseSectionContent("person", 1, {
                name: "A",
                cta: {
                    label: "Book",
                    action: { kind: "url", href: "javascript:alert(1)" },
                },
            }).success,
        ).toBe(false);
    });

    it("resolves its button's page at publish, as hero's does", () => {
        const rendered = toRendered(
            "person",
            {
                name: "Anika",
                cta: {
                    label: "Book",
                    action: { kind: "page", pageId: "p1" },
                    style: "primary",
                },
            },
            { resolvePage: (id) => (id === "p1" ? "/book" : undefined) },
        );
        expect(rendered).toMatchObject({ cta: { href: "/book" } });
        expect(parseRenderedContent("person", rendered).success).toBe(true);
    });

    it("ships every fixture and case through its rendered schema", () => {
        for (const content of [
            ...Object.values(BLOCK_META.person.fixtures),
            ...Object.values(BLOCK_META.person.cases),
        ]) {
            expect(parseRenderedContent("person", content).success).toBe(true);
        }
    });
});

describe("template fidelity looks (DEC-090)", () => {
    it("knows productGrid plates", () => {
        expect(resolveVariant("productGrid", { variant: "plates" })).toBe(
            "plates",
        );
        expect(
            parseSectionContent("productGrid", 1, {
                variant: "plates",
                title: "Current collection",
            }).success,
        ).toBe(true);
    });

    it("takes captions over or below the photo on a gallery and on projects", () => {
        const image = { src: "/a.jpg", alt: "a", caption: "The clay" };
        for (const placement of ["over", "below"]) {
            expect(
                parseSectionContent("gallery", 2, {
                    variant: "grid",
                    images: [image],
                    captionPlacement: placement,
                }).success,
            ).toBe(true);
            expect(
                parseSectionContent("projects", 1, {
                    items: [{ title: "Kiln house", image }],
                    captionPlacement: placement,
                }).success,
            ).toBe(true);
        }
        expect(
            parseSectionContent("gallery", 2, {
                variant: "grid",
                images: [image],
                captionPlacement: "top",
            }).success,
        ).toBe(false);
    });

    it("carries the placement into the published content", () => {
        const rendered = parseRenderedContent("gallery", {
            variant: "grid",
            images: [{ src: "/a.jpg", alt: "a" }],
            captionPlacement: "over",
        });
        expect(rendered.success && rendered.data.captionPlacement).toBe("over");
    });
});
