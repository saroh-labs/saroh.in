import { describe, expect, it } from "vitest";

import { blockFixture, blockVariantIds } from "./fixtures";
import {
    ctaHref,
    getSectionContract,
    listSectionContracts,
    parseSectionContent,
    parseSectionContentOrThrow,
    requiresSanitization,
    SAME_DAY_CALL_WORDS,
    SECTION_TYPES,
    sectionFrameSettingsOf,
} from "./section-contract";

describe("section-contract registry", () => {
    it("registers a contract for every known section type at v1", () => {
        for (const type of SECTION_TYPES) {
            expect(getSectionContract(type, 1)).toBeDefined();
        }
        // Every registered contract names a known type. The total is no longer
        // one-per-type: a type may carry more than one version (#207 added
        // cta@2 and hero@2), and pinning the count to the type count would
        // make every new version a test change rather than a registry change.
        for (const contract of listSectionContracts()) {
            expect(SECTION_TYPES).toContain(contract.type);
        }
        expect(getSectionContract("cta", 2)).toBeDefined();
        expect(getSectionContract("hero", 2)).toBeDefined();
    });

    it("rejects an unknown section type", () => {
        const result = parseSectionContent("carousel3000", 1, {});
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("UNKNOWN_CONTRACT");
        }
    });

    it("rejects a known type at an unknown version", () => {
        const result = parseSectionContent("hero", 99, { heading: "Hi" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("UNKNOWN_CONTRACT");
        }
    });
});

describe("hero v1", () => {
    it("accepts a minimal valid hero", () => {
        const result = parseSectionContent("hero", 1, { heading: "Welcome" });
        expect(result.success).toBe(true);
    });

    it("accepts a hero with cta + image and applies cta style default", () => {
        const result = parseSectionContent("hero", 1, {
            heading: "Welcome",
            subheading: "Sub",
            cta: { label: "Go", href: "/go" },
            image: { src: "/a.png" },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            const data = result.data as {
                cta: { style: string };
                image: { alt: string };
            };
            expect(data.cta.style).toBe("primary");
            expect(data.image.alt).toBe("");
        }
    });

    it("keeps the On today switch on v1 and v2 (G18)", () => {
        for (const version of [1, 2]) {
            const result = parseSectionContent("hero", version, {
                heading: "Welcome",
                onToday: true,
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect((result.data as { onToday?: boolean }).onToday).toBe(
                    true,
                );
            }
        }
        // A hero written before the switch existed is unchanged: no flag.
        const old = parseSectionContent("hero", 2, { heading: "Welcome" });
        expect(old.success && "onToday" in (old.data as object)).toBe(false);
        // Only a switch: a string is refused rather than read as "on".
        expect(
            parseSectionContent("hero", 1, { heading: "W", onToday: "yes" })
                .success,
        ).toBe(false);
    });

    it("keeps a photo's focus point, and leaves one without it as it was (U46d)", () => {
        const at = (image: object) =>
            parseSectionContent("hero", 2, { heading: "W", image });
        const kept = at({ src: "/a.png", focus: { x: 30, y: 20 } });
        expect(
            kept.success &&
                (kept.data as { image: { focus?: object } }).image.focus,
        ).toEqual({ x: 30, y: 20 });
        const plain = at({ src: "/a.png" });
        expect(
            plain.success && "focus" in (plain.data as { image: object }).image,
        ).toBe(false);
        expect(at({ src: "/a.png", focus: { x: 120, y: 0 } }).success).toBe(
            false,
        );
    });

    it("rejects a hero missing its heading", () => {
        const result = parseSectionContent("hero", 1, { subheading: "Sub" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("INVALID_CONTENT");
            if (result.error.code === "INVALID_CONTENT") {
                expect(result.error.issues.length).toBeGreaterThan(0);
            }
        }
    });

    it("rejects an empty heading", () => {
        const result = parseSectionContent("hero", 1, { heading: "" });
        expect(result.success).toBe(false);
    });
});

describe("richText v1", () => {
    it("accepts rich text and defaults the format to html", () => {
        const result = parseSectionContent("richText", 1, {
            value: "<p>hello</p>",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as { format: string }).format).toBe("html");
        }
    });

    it("rejects a missing value", () => {
        const result = parseSectionContent("richText", 1, { format: "html" });
        expect(result.success).toBe(false);
    });

    describe("its photo (G7)", () => {
        it("keeps a photo and the side it sits on through a save", () => {
            const result = parseSectionContent("richText", 1, {
                format: "html",
                value: "<p>Our story</p>",
                image: {
                    src: "https://cdn.example.com/counter.jpg",
                    alt: "The counter",
                    width: 800,
                    height: 600,
                },
                imageSide: "left",
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toMatchObject({
                    image: {
                        src: "https://cdn.example.com/counter.jpg",
                        alt: "The counter",
                    },
                    imageSide: "left",
                });
            }
        });

        it("still validates old content with neither field", () => {
            const result = parseSectionContent("richText", 1, {
                format: "html",
                value: "<p>Written before photos</p>",
                padding: 48,
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).not.toHaveProperty("image");
                expect(result.data).not.toHaveProperty("imageSide");
            }
        });

        it("saves a photo not yet described, so autosave never loses it", () => {
            // Alt text is required at publish (the pre-publish check), not
            // at save: the merchant picks the photo before describing it.
            const result = parseSectionContent("richText", 1, {
                value: "<p>x</p>",
                image: { src: "https://cdn.example.com/a.jpg" },
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(
                    (result.data as { image: { alt: string } }).image.alt,
                ).toBe("");
            }
        });

        it("refuses a photo with no address", () => {
            const result = parseSectionContent("richText", 1, {
                value: "<p>x</p>",
                image: { src: "", alt: "Nothing" },
            });
            expect(result.success).toBe(false);
        });

        it("refuses a side other than left or right", () => {
            const result = parseSectionContent("richText", 1, {
                value: "<p>x</p>",
                imageSide: "top",
            });
            expect(result.success).toBe(false);
        });

        it("does not sanitize the photo — only `value` and its phone version are HTML", () => {
            expect(getSectionContract("richText", 1)?.sanitizedFields).toEqual([
                "value",
                "phoneBody",
            ]);
        });
    });

    it("is flagged as requiring sanitization on its `value` field", () => {
        expect(requiresSanitization("richText", 1)).toBe(true);
        expect(getSectionContract("richText", 1)?.sanitizedFields).toEqual([
            "value",
            "phoneBody",
        ]);
    });

    it("does not flag non-rich sections for sanitization", () => {
        expect(requiresSanitization("hero", 1)).toBe(false);
        expect(requiresSanitization("cta", 1)).toBe(false);
        expect(requiresSanitization("gallery", 1)).toBe(false);
        expect(requiresSanitization("enquiry", 1)).toBe(false);
        expect(requiresSanitization("booking", 1)).toBe(false);
    });
});

describe("cta v1", () => {
    it("accepts a valid cta", () => {
        const result = parseSectionContent("cta", 1, {
            label: "Buy",
            href: "/buy",
            style: "secondary",
        });
        expect(result.success).toBe(true);
    });

    it("rejects a cta with an invalid style", () => {
        const result = parseSectionContent("cta", 1, {
            label: "Buy",
            href: "/buy",
            style: "ghost",
        });
        expect(result.success).toBe(false);
    });

    it("rejects a cta missing its href", () => {
        const result = parseSectionContent("cta", 1, { label: "Buy" });
        expect(result.success).toBe(false);
    });
});

describe("gallery v1", () => {
    it("accepts a gallery with at least one image", () => {
        const result = parseSectionContent("gallery", 1, {
            images: [{ src: "/1.png" }, { src: "/2.png", alt: "two" }],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as { layout: string }).layout).toBe("grid");
        }
    });

    it("rejects an empty gallery", () => {
        const result = parseSectionContent("gallery", 1, { images: [] });
        expect(result.success).toBe(false);
    });
});

describe("enquiry v1", () => {
    const validFields = [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "message", label: "Message", type: "textarea" },
    ];

    it("accepts an enquiry with a well-formed field list", () => {
        const result = parseSectionContent("enquiry", 1, {
            title: "Get in touch",
            submitLabel: "Send",
            successMessage: "Thanks!",
            fields: validFields,
        });
        expect(result.success).toBe(true);
    });

    it("accepts an enquiry without a formId (synced on save)", () => {
        const result = parseSectionContent("enquiry", 1, {
            fields: [{ name: "email", label: "Email", type: "email" }],
        });
        expect(result.success).toBe(true);
    });

    it("keeps the formId when present", () => {
        const result = parseSectionContent("enquiry", 1, {
            formId: "form_123",
            fields: [{ name: "email", label: "Email", type: "email" }],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as { formId: string }).formId).toBe("form_123");
        }
    });

    it("rejects an enquiry with no fields", () => {
        const result = parseSectionContent("enquiry", 1, { fields: [] });
        expect(result.success).toBe(false);
    });

    it("rejects an enquiry with no email field", () => {
        const result = parseSectionContent("enquiry", 1, {
            fields: [{ name: "name", label: "Name", type: "text" }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("INVALID_CONTENT");
        }
    });

    it("rejects an enquiry with duplicate field names", () => {
        const result = parseSectionContent("enquiry", 1, {
            fields: [
                { name: "email", label: "Email", type: "email" },
                { name: "email", label: "Email again", type: "text" },
            ],
        });
        expect(result.success).toBe(false);
    });

    it("rejects an enquiry with an invalid field type", () => {
        const result = parseSectionContent("enquiry", 1, {
            fields: [{ name: "email", label: "Email", type: "date" }],
        });
        expect(result.success).toBe(false);
    });
});

describe("booking v1", () => {
    it("accepts a booking with a serviceId + copy", () => {
        const result = parseSectionContent("booking", 1, {
            serviceId: "svc_123",
            title: "Book a call",
            description: "Pick a time that suits you.",
            submitLabel: "Confirm booking",
            successMessage: "You're booked!",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as { serviceId: string }).serviceId).toBe(
                "svc_123",
            );
        }
    });

    it("accepts a booking without a serviceId (picked on save)", () => {
        const result = parseSectionContent("booking", 1, {});
        expect(result.success).toBe(true);
    });

    it("rejects an empty serviceId when present", () => {
        const result = parseSectionContent("booking", 1, { serviceId: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("INVALID_CONTENT");
        }
    });
});

describe("parseSectionContentOrThrow", () => {
    it("returns normalized data on success", () => {
        const data = parseSectionContentOrThrow("hero", 1, {
            heading: "Hi",
        }) as { heading: string };
        expect(data.heading).toBe("Hi");
    });

    it("throws on an invalid content", () => {
        expect(() => parseSectionContentOrThrow("hero", 1, {})).toThrow();
    });

    it("throws on an unknown contract", () => {
        expect(() => parseSectionContentOrThrow("nope", 1, {})).toThrow();
    });
});

describe("per-section padding override (#189)", () => {
    /** A minimal valid content body for each type, so the padding is the variable. */
    const bodies: Record<string, Record<string, unknown>> = {
        hero: { heading: "Hi" },
        richText: { format: "html", value: "<p>Hi</p>" },
        cta: { label: "Go", href: "/x" },
        gallery: { images: [{ src: "https://x/a.jpg" }], layout: "grid" },
        enquiry: {
            fields: [{ name: "email", label: "Email", type: "email" }],
        },
        booking: {},
        features: { items: [{ title: "Stocked, not ordered in" }] },
        faq: { items: [{ question: "Open Sundays?", answer: "No." }] },
        testimonials: { items: [{ quote: "Quick.", name: "Sam" }] },
        contact: { phone: "+44 113 496 0000" },
        servicesList: { serviceIds: ["svc_1"] },
        visitUs: {},
        journal: {},
        plans: {},
        productGrid: {},
        packs: {},
        projects: { items: [{ title: "Menus for a bakery" }] },
        timetable: {},
        hours: {},
        person: { name: "Anika Rao" },
    };

    it("is accepted on every section type", () => {
        for (const type of SECTION_TYPES) {
            const result = parseSectionContent(type, 1, {
                ...bodies[type],
                padding: 40,
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect((result.data as { padding?: number }).padding).toBe(40);
            }
        }
    });

    it("stays ABSENT when not set, rather than defaulting", () => {
        // Absent means "follow the site setting". A default would bake the
        // site's current value into the section and stop it tracking the
        // slider afterwards.
        for (const type of SECTION_TYPES) {
            const result = parseSectionContent(type, 1, bodies[type]);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(
                    result.data as Record<string, unknown>,
                ).not.toHaveProperty("padding");
            }
        }
    });

    it("rejects a padding outside the site slider's own range", () => {
        // An override must not reach a spacing the site-level setting could
        // not produce.
        for (const bad of [8, 200, 52.5]) {
            const result = parseSectionContent("hero", 1, {
                heading: "Hi",
                padding: bad,
            });
            expect(result.success).toBe(false);
        }
    });

    it("does not break content written before the field existed", () => {
        // Adding an optional field is why this extends v1 instead of shipping
        // a v2 — every existing Section and Publication must still validate.
        const result = parseSectionContent("hero", 1, {
            heading: "Made before padding existed",
            subheading: "Still valid",
        });
        expect(result.success).toBe(true);
    });
});

describe("cta v2 — an action, not a bare href (#207)", () => {
    it("accepts every kind and applies the style default", () => {
        for (const action of [
            { kind: "page", pageId: "p1" },
            { kind: "url", href: "https://example.com" },
            { kind: "email", address: "hello@example.in" },
            { kind: "call", number: "+91 98450 12345" },
            { kind: "whatsapp", number: "+91 98450 12345", message: "Hi" },
        ]) {
            const r = parseSectionContent("cta", 2, { label: "Go", action });
            expect(r.success, JSON.stringify(action)).toBe(true);
            if (r.success) expect(r.data).toMatchObject({ style: "primary" });
        }
    });

    it("rejects a kind that does not exist, and a phone that is not one", () => {
        expect(
            parseSectionContent("cta", 2, {
                label: "Go",
                action: { kind: "fax", number: "1" },
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("cta", 2, {
                label: "Go",
                action: { kind: "call", number: "call me" },
            }).success,
        ).toBe(false);
    });

    it("keeps v1 sections valid alongside v2 — nothing published breaks", () => {
        expect(
            parseSectionContent("cta", 1, { label: "Go", href: "/about" })
                .success,
        ).toBe(true);
        expect(
            parseSectionContent("hero", 2, {
                heading: "Hi",
                cta: { label: "Go", action: { kind: "page", pageId: "p1" } },
            }).success,
        ).toBe(true);
    });
});

describe("ctaHref", () => {
    const pages = new Map([["p1", "/about"]]);
    const resolve = (id: string) => pages.get(id);

    it("resolves a page by id at publish, and to nothing when it is gone", () => {
        expect(ctaHref({ kind: "page", pageId: "p1" }, resolve)).toBe("/about");
        // A hidden or deleted page: the flag engine has already said so, and
        // the button renders as a label rather than a broken link.
        expect(ctaHref({ kind: "page", pageId: "nope" }, resolve)).toBe("");
    });

    it("writes the incantations a merchant should never have to know", () => {
        expect(
            ctaHref({ kind: "call", number: "+91 98450-12345" }, resolve),
        ).toBe("tel:+919845012345");
        expect(
            ctaHref(
                {
                    kind: "whatsapp",
                    number: "+91 98450 12345",
                    message: "Hi there",
                },
                resolve,
            ),
        ).toBe("https://wa.me/919845012345?text=Hi%20there");
        expect(
            ctaHref(
                {
                    kind: "email",
                    address: "hello@example.in",
                    subject: "Order",
                },
                resolve,
            ),
        ).toBe("mailto:hello@example.in?subject=Order");
        expect(ctaHref({ kind: "url", href: "/contact" }, resolve)).toBe(
            "/contact",
        );
    });
});

/** G12 — the Product grid stores which products by id, never a product. */
describe("productGrid v1", () => {
    it("is valid with nothing set, so a just-added block saves", () => {
        expect(parseSectionContent("productGrid", 1, {}).success).toBe(true);
    });

    it("keeps a title, a source, a collection, a count and the switch", () => {
        const parsed = parseSectionContent("productGrid", 1, {
            title: "  Breads ",
            source: "collection",
            collectionId: " col_breads ",
            count: 4,
            showPrices: false,
        });
        expect(parsed.success && parsed.data).toEqual({
            title: "Breads",
            source: "collection",
            collectionId: "col_breads",
            count: 4,
            showPrices: false,
        });
    });

    it("keeps picked products in the merchant's order", () => {
        const parsed = parseSectionContent("productGrid", 1, {
            source: "picked",
            productIds: ["p_3", "p_1", "p_2"],
        });
        expect(parsed.success && parsed.data).toEqual({
            source: "picked",
            productIds: ["p_3", "p_1", "p_2"],
        });
    });

    it("saves a source whose products are still to be chosen", () => {
        expect(
            parseSectionContent("productGrid", 1, { source: "collection" })
                .success,
        ).toBe(true);
        expect(
            parseSectionContent("productGrid", 1, {
                source: "picked",
                productIds: [],
            }).success,
        ).toBe(true);
    });

    it("refuses another source, a product picked twice, or too many", () => {
        expect(
            parseSectionContent("productGrid", 1, { source: "random" }).success,
        ).toBe(false);
        expect(
            parseSectionContent("productGrid", 1, {
                productIds: ["p_1", "p_1"],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("productGrid", 1, {
                productIds: Array.from({ length: 13 }, (_, i) => `p_${i}`),
            }).success,
        ).toBe(false);
    });

    it("refuses a count outside 1 to 12, or not whole", () => {
        for (const count of [0, 13, 2.5, "4"]) {
            expect(
                parseSectionContent("productGrid", 1, { count }).success,
            ).toBe(false);
        }
    });

    it("never stores a product itself, so a price can't go stale", () => {
        const parsed = parseSectionContent("productGrid", 1, {
            title: "Shop",
            products: [{ name: "Copied loaf", price: "99.00" }],
        });
        expect(parsed.success && parsed.data).toEqual({ title: "Shop" });
    });
});

describe("list sections' display options (G16)", () => {
    const base = {
        servicesList: { serviceIds: ["svc_1"] },
        productGrid: {},
        plans: {},
        journal: {},
    } as const;

    it("keeps an old section exactly as it was: every option is optional", () => {
        for (const [type, content] of Object.entries(base)) {
            const parsed = parseSectionContent(type, 1, content);
            expect(parsed.success && parsed.data).toEqual(content);
        }
    });

    it("takes Cards or List on every list section, and nothing else", () => {
        for (const [type, content] of Object.entries(base)) {
            for (const layout of ["cards", "list"]) {
                const parsed = parseSectionContent(type, 1, {
                    ...content,
                    layout,
                });
                expect(parsed.success && parsed.data).toEqual({
                    ...content,
                    layout,
                });
            }
            expect(
                parseSectionContent(type, 1, { ...content, layout: "grid" })
                    .success,
            ).toBe(false);
        }
    });

    it("stores the Photos, Descriptions and Prices switches each block has", () => {
        const services = parseSectionContent("servicesList", 1, {
            ...base.servicesList,
            showDescriptions: false,
            showPrices: false,
        });
        expect(services.success && services.data).toMatchObject({
            showDescriptions: false,
            showPrices: false,
        });
        const grid = parseSectionContent("productGrid", 1, {
            showPhotos: false,
            showDescriptions: false,
            showPrices: false,
        });
        expect(grid.success && grid.data).toEqual({
            showPhotos: false,
            showDescriptions: false,
            showPrices: false,
        });
        const plans = parseSectionContent("plans", 1, { showPrices: false });
        expect(plans.success && plans.data).toEqual({ showPrices: false });
    });

    it("takes a button of up to 40 characters, trimmed", () => {
        for (const [type, content] of Object.entries(base)) {
            const parsed = parseSectionContent(type, 1, {
                ...content,
                buttonLabel: "  Choose a time ",
            });
            expect(parsed.success && parsed.data).toMatchObject({
                buttonLabel: "Choose a time",
            });
            expect(
                parseSectionContent(type, 1, {
                    ...content,
                    buttonLabel: "x".repeat(41),
                }).success,
            ).toBe(false);
        }
    });
});

describe("phase 2 block fields (U15)", () => {
    const ok = (type: string, version: number, content: unknown) =>
        parseSectionContent(type, version, content).success;

    it("takes a hero's answer panel, row, byline and phone line", () => {
        const parsed = parseSectionContent("hero", 2, {
            variant: "answer",
            heading: "Dental care",
            panel: { kind: "sameDayCall", phone: "+91 00000 01001" },
            answerRow: true,
            byline: { name: "Dr Meera Rao", role: "Dentist" },
            phoneLine: "Same-day care.",
            cta: {
                label: "Book a check-up",
                phoneLabel: "Book",
                action: { kind: "url", href: "/book" },
            },
        });
        expect(parsed.success && parsed.data).toMatchObject({
            panel: { kind: "sameDayCall" },
            cta: { phoneLabel: "Book" },
        });
    });

    it("refuses a panel kind it does not know", () => {
        expect(
            ok("hero", 2, { heading: "x", panel: { kind: "emergency" } }),
        ).toBe(false);
    });

    it("has no phone version of the heading: one h1 on every width", () => {
        const parsed = parseSectionContent("hero", 2, {
            heading: "x",
            phoneHeading: "y",
        });
        expect(parsed.success && parsed.data).not.toHaveProperty(
            "phoneHeading",
        );
    });

    it("never says emergency in the Same-day call default", () => {
        expect(SAME_DAY_CALL_WORDS).toBe("Same-day? Call the desk");
        expect(SAME_DAY_CALL_WORDS.toLowerCase()).not.toContain("emergency");
    });

    it("takes places-left from 1 to 10, and absent", () => {
        expect(ok("timetable", 1, {})).toBe(true);
        expect(ok("timetable", 1, { placesFrom: 1 })).toBe(true);
        expect(ok("timetable", 1, { placesFrom: 10 })).toBe(true);
        expect(ok("timetable", 1, { placesFrom: 0 })).toBe(false);
        expect(ok("timetable", 1, { placesFrom: 11 })).toBe(false);
        expect(ok("timetable", 1, { placesFrom: 2.5 })).toBe(false);
    });

    it("keeps each block's other new fields through a save", () => {
        const cases: [string, number, Record<string, unknown>][] = [
            ["richText", 1, { value: "<p>a</p>", phoneBody: "<p>b</p>" }],
            [
                "servicesList",
                1,
                {
                    serviceIds: ["a", "b"],
                    groups: [{ name: "Hair", serviceIds: ["a"] }],
                },
            ],
            [
                "plans",
                1,
                {
                    show: "both",
                    includes: [
                        {
                            label: "Open gym",
                            cells: [{ id: "p1", words: "Yes" }],
                        },
                    ],
                },
            ],
            [
                "gallery",
                2,
                {
                    images: [
                        {
                            src: "/a.jpg",
                            name: "Cut and finish",
                            fromPrice: "From ₹800",
                            link: { kind: "page", pageId: "page_1" },
                        },
                    ],
                },
            ],
            [
                "productGrid",
                1,
                { addInPlace: true, preorderWords: "Pre-order for Saturday" },
            ],
            ["booking", 1, { beforeYouBook: "Come ten minutes early." }],
            ["visitUs", 1, { extraLine: "Parking at the back" }],
            ["cta", 1, { label: "Go", href: "/", phoneLabel: "Go" }],
        ];
        for (const [type, version, content] of cases) {
            const parsed = parseSectionContent(type, version, content);
            expect(parsed.success && parsed.data).toMatchObject(content);
        }
    });

    it("refuses a lookbook link of a kind it does not know", () => {
        expect(
            ok("gallery", 2, {
                images: [{ src: "/a.jpg", link: { kind: "url", href: "/" } }],
            }),
        ).toBe(false);
    });
});

describe("a section's frame (KTD-E5)", () => {
    const hero = { heading: "Bridal makeup in Pune" };

    it("leaves a section without a frame exactly as it was", () => {
        const parsed = parseSectionContent("hero", 1, hero);
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).not.toHaveProperty("frame");
    });

    it("keeps a frame through a save, on every block", () => {
        const frame = { hideOn: "phone", tone: "dark", spacing: "airy" };
        const checked = new Set<string>();
        for (const type of SECTION_TYPES) {
            for (const variant of blockVariantIds(type)) {
                const content = blockFixture(type, variant);
                const plain = parseSectionContent(type, 1, content);
                if (!plain.success) continue;
                const framed = parseSectionContent(type, 1, {
                    ...(content as object),
                    frame,
                });
                expect(framed.success, `${type}/${variant}`).toBe(true);
                if (framed.success) {
                    expect((framed.data as { frame?: unknown }).frame).toEqual(
                        frame,
                    );
                }
                checked.add(type);
                break;
            }
        }
        expect(checked.size).toBeGreaterThan(SECTION_TYPES.length / 2);
    });

    it("drops an empty frame, so {} is never a change", () => {
        const parsed = parseSectionContent("hero", 1, { ...hero, frame: {} });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).not.toHaveProperty("frame");
    });

    it.each([
        [{ tone: "neon" }],
        [{ spacing: "huge" }],
        [{ hideOn: "desk" }],
        [{ colour: "red" }],
        ["dark"],
    ])("refuses %j", (frame) => {
        const parsed = parseSectionContent("hero", 1, { ...hero, frame });
        expect(parsed.success).toBe(false);
        if (!parsed.success && parsed.error.code === "INVALID_CONTENT") {
            expect(parsed.error.issues[0]?.path[0]).toBe("frame");
        } else {
            throw new Error("expected INVALID_CONTENT");
        }
    });

    it("reads forgivingly for the renderer", () => {
        expect(sectionFrameSettingsOf({ frame: { tone: "tint" } })).toEqual({
            tone: "tint",
        });
        expect(sectionFrameSettingsOf({ frame: { tone: "neon" } })).toEqual({});
        expect(sectionFrameSettingsOf(null)).toEqual({});
    });
});

describe("testimonials v1 — an optional star rating (23 Nov 2026)", () => {
    const parse = (rating: unknown) =>
        parseSectionContent("testimonials", 1, {
            items: [{ quote: "Quick.", name: "Sam", rating }],
        });

    it("takes a whole number from 1 to 5, or none", () => {
        for (const r of [1, 3, 5, undefined]) {
            expect(parse(r).success).toBe(true);
        }
    });

    it("refuses 0, 6, a fraction and a word", () => {
        for (const r of [0, 6, 4.5, "5", null, -1]) {
            expect(parse(r).success).toBe(false);
        }
    });
});
