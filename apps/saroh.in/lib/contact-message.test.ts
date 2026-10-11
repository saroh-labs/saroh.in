import { describe, expect, it } from "vitest";

import { CONTACT_PAGE } from "@/content/contact-page";
import { WAITLIST_KINDS } from "@/content/waitlist";

import {
    CONTACT_KIND_IDS,
    CONTACT_LIMITS,
    CONTACT_TOPIC_IDS,
    contactBody,
    contactProblem,
    contactProblems,
    firstName,
} from "./contact-message";

/** /contact's rules (DEC-137), shared by the form and its route. */

const good = {
    name: "Asha Rao",
    email: "asha.rao@example.com",
    message: "Can I take bookings for two branches?",
};

describe("contactProblem", () => {
    it("lets a good message go", () => {
        expect(contactProblem(good)).toBeNull();
        expect(contactProblems(good)).toEqual([]);
    });

    it("names one field at a time: name, then email, then message", () => {
        const empty = { name: " ", email: "", message: "" };
        expect(contactProblem(empty)).toBe("name");
        expect(contactProblem({ ...empty, name: "Asha" })).toBe("email");
        expect(
            contactProblem({ ...empty, name: "Asha", email: good.email }),
        ).toBe("message");
    });

    it("marks every field at fault at once", () => {
        expect(
            contactProblems({ name: "", email: "x", message: "hey" }),
        ).toEqual(["name", "email", "message"]);
        expect(contactProblems({ ...good, email: "asha@example" })).toEqual([
            "email",
        ]);
    });

    it("wants five characters of message, spaces at the ends aside", () => {
        expect(contactProblem({ ...good, message: "  hey  " })).toBe("message");
        expect(contactProblem({ ...good, message: "hello" })).toBeNull();
    });

    it("refuses what the API would cut", () => {
        expect(
            contactProblem({
                ...good,
                name: "x".repeat(CONTACT_LIMITS.name + 1),
            }),
        ).toBe("name");
        expect(
            contactProblem({
                ...good,
                message: "x".repeat(CONTACT_LIMITS.message + 1),
            }),
        ).toBe("message");
    });
});

describe("firstName", () => {
    it("is the first word of the name, or 'there'", () => {
        expect(firstName("Asha Rao")).toBe("Asha");
        expect(firstName("  Asha  ")).toBe("Asha");
        expect(firstName("   ")).toBe("there");
    });
});

describe("contactBody", () => {
    it("passes the five fields on, trimmed, and nothing else", () => {
        expect(
            contactBody({
                topic: "help",
                name: "  Asha   Rao ",
                email: " asha.rao@example.com ",
                kind: "salon",
                message: "  My booking page is empty. ",
                organizationId: "org_1",
            }),
        ).toEqual({
            topic: "help",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "salon",
            message: "My booking page is empty.",
        });
    });

    it("leaves out a kind that is blank or not one of the form's", () => {
        expect(contactBody({ topic: "bug", ...good, kind: "" })).toEqual({
            topic: "bug",
            ...good,
        });
        expect(contactBody({ topic: "bug", ...good, kind: "bank" })).toEqual({
            topic: "bug",
            ...good,
        });
    });

    it("says which field is at fault", () => {
        expect(contactBody({ topic: "question", ...good, email: "x" })).toEqual(
            { problem: "email" },
        );
        expect(contactBody({ topic: "question" })).toEqual({
            problem: "name",
        });
    });

    it("is not a message without one of the form's topics", () => {
        expect(contactBody(null)).toBeNull();
        expect(contactBody("hello")).toBeNull();
        expect(contactBody({ ...good })).toBeNull();
        expect(contactBody({ ...good, topic: "sales" })).toBeNull();
    });
});

describe("the form's lists", () => {
    it("offers exactly the topics and kinds the API takes", () => {
        expect(CONTACT_PAGE.form.topics.map((t) => t.id)).toEqual([
            ...CONTACT_TOPIC_IDS,
        ]);
        expect(CONTACT_PAGE.form.kinds.map((k) => k.id)).toEqual([
            ...CONTACT_KIND_IDS,
        ]);
        // The kinds are the waitlist's, which the API stores for both.
        expect([...CONTACT_KIND_IDS]).toEqual(WAITLIST_KINDS.map((k) => k.id));
    });
});
