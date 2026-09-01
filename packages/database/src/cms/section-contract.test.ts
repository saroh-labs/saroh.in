import { describe, expect, it } from "vitest";

import {
    getSectionContract,
    listSectionContracts,
    parseSectionContent,
    parseSectionContentOrThrow,
    requiresSanitization,
    SECTION_TYPES,
} from "./section-contract";

describe("section-contract registry", () => {
    it("registers a contract for every known section type at v1", () => {
        for (const type of SECTION_TYPES) {
            expect(getSectionContract(type, 1)).toBeDefined();
        }
        expect(listSectionContracts().length).toBe(SECTION_TYPES.length);
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

    it("is flagged as requiring sanitization on its `value` field", () => {
        expect(requiresSanitization("richText", 1)).toBe(true);
        expect(getSectionContract("richText", 1)?.sanitizedFields).toEqual([
            "value",
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
