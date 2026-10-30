import { describe, expect, it } from "vitest";
import { ctaActionSchema, parseSectionContent } from "./section-contract";

/*
 * The words a merchant reads when a section is wrong. Pinned through the
 * zod 3 -> 4 move (`message` became `error`), so a rename that drops one
 * fails here rather than on a live editor.
 */
function messages(type: string, content: unknown, version = 1): string[] {
    const r = parseSectionContent(type, version, content);
    if (r.success || r.error.code !== "INVALID_CONTENT") return [];
    return r.error.issues.map((i) => i.message);
}

describe("section contract messages", () => {
    it("asks a contact block for a way to reach you", () => {
        expect(messages("contact", {})).toEqual([
            "Add at least one way to reach you: address, phone, email or WhatsApp",
        ]);
    });

    it("says what a bad email and a bad map link need", () => {
        expect(
            messages("contact", {
                address: "1 MG Road",
                email: "not-an-email",
                mapUrl: "maps.example.com",
            }),
        ).toEqual([
            "Enter an email address",
            // The format check and the safe-link refine both speak, as in zod 3.
            "Enter a full web address, starting with https://",
            "Enter a full web address, starting with https://",
        ]);
    });

    it("trims before checking an email, as before", () => {
        expect(messages("contact", { email: "  sam@example.com  " })).toEqual(
            [],
        );
        const action = ctaActionSchema.safeParse({
            kind: "email",
            address: " sam@example.com ",
        });
        expect(action.success && action.data).toEqual({
            kind: "email",
            address: "sam@example.com",
        });
    });

    it("names a duplicate enquiry field and a form with no email", () => {
        expect(
            messages("enquiry", {
                fields: [
                    { name: "who", label: "Name", type: "text" },
                    { name: "who", label: "Name again", type: "text" },
                ],
            }),
        ).toEqual([
            'Duplicate field name "who" — field names must be unique',
            'An enquiry form must have at least one field of type "email"',
        ]);
    });

    it("asks an empty gallery for an image", () => {
        expect(messages("gallery", { images: [] }, 2)).toContain(
            "Add at least one image",
        );
    });
});
