// What an enquiry says, for its auto-reply (DEC-174 U15, #1146): the
// message quoted back, and obvious spam, which gets no reply.
import type { FormField } from "../forms/dto";
import {
    enquiryMessage,
    looksLikeSpam,
    quotableMessage,
    QUOTE_MAX,
} from "./enquiry-words";

const FIELDS: FormField[] = [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea" },
];

const base = { email: "asha@example.com", name: "Asha Rao", phone: "98" };

describe("looksLikeSpam", () => {
    it("an ordinary enquiry, even with one link, is not spam", () => {
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                message: "Do you open on Sundays?",
            }),
        ).toBe(false);
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                message: "Saw this on https://example.com/a, do you stock it?",
            }),
        ).toBe(false);
    });

    it("three links in all is spam", () => {
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                message:
                    "https://a.example.com https://b.example.com www.c-shop.example",
            }),
        ).toBe(true);
    });

    it("HTML or forum markup is spam", () => {
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                message: 'Great <a href="x">deals</a>',
            }),
        ).toBe(true);
        expect(
            looksLikeSpam(FIELDS, { ...base, message: "[url=x]cheap[/url]" }),
        ).toBe(true);
    });

    it("a link where a name goes is spam", () => {
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                name: "Visit https://cheap.example.com",
                message: "Hi",
            }),
        ).toBe(true);
    });

    it("a wall of text is spam", () => {
        expect(
            looksLikeSpam(FIELDS, { ...base, message: "a ".repeat(3000) }),
        ).toBe(true);
    });

    it("the email itself never counts as a link", () => {
        expect(
            looksLikeSpam(FIELDS, {
                ...base,
                email: "www.asha@example.com",
                message: "Hi",
            }),
        ).toBe(false);
    });
});

describe("enquiryMessage", () => {
    it("the long-text fields, in the form's order", () => {
        const fields: FormField[] = [
            ...FIELDS,
            { name: "more", label: "More", type: "textarea" },
        ];
        expect(
            enquiryMessage(fields, {
                ...base,
                message: " Sundays? ",
                more: "Thanks",
            }),
        ).toBe("Sundays?\n\nThanks");
    });

    it("with no long-text field, a field named like a message", () => {
        const fields: FormField[] = [
            FIELDS[0],
            FIELDS[1],
            { name: "your_question", label: "Question", type: "text" },
        ];
        expect(enquiryMessage(fields, { ...base, your_question: "Hi" })).toBe(
            "Hi",
        );
    });

    it("null for a form with no message, or one left empty", () => {
        expect(enquiryMessage(FIELDS.slice(0, 3), base)).toBeNull();
        expect(enquiryMessage(FIELDS, { ...base, message: "  " })).toBeNull();
    });
});

describe("quotableMessage", () => {
    it("quotes a short message as it is", () => {
        expect(quotableMessage("Do you open on Sundays?")).toBe(
            "Do you open on Sundays?",
        );
    });

    it("never quotes a message with a link", () => {
        expect(quotableMessage("See https://example.com")).toBeNull();
        expect(quotableMessage("See www.example.com")).toBeNull();
    });

    it("cuts a long message at a word, with …", () => {
        const quoted = quotableMessage("word ".repeat(200)) ?? "";
        expect(quoted.length).toBeLessThanOrEqual(QUOTE_MAX + 1);
        expect(quoted.endsWith("word…")).toBe(true);
    });

    it("null for none", () => {
        expect(quotableMessage(null)).toBeNull();
        expect(quotableMessage("")).toBeNull();
    });
});
