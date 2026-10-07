import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EnquiryCard } from "./enquiry-card";

/**
 * UX-002: what the visitor typed into the site's form shows on the lead and
 * the contact, not only that an enquiry came in.
 */
const entry = {
    id: "sub_1",
    createdAt: "2026-10-01T10:00:00.000Z",
    formId: "form_1",
    formName: "Ask us",
    answers: [
        { name: "email", label: "Email", value: "asha@example.test" },
        { name: "name", label: "Your name", value: "Asha" },
        {
            name: "message",
            label: "Message",
            value: "Do you take bookings for six on a Sunday?",
        },
    ],
};

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, "|")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

describe("EnquiryCard", () => {
    it("shows each answer under its label, without repeating the known email", () => {
        const words = text(
            renderToStaticMarkup(
                <EnquiryCard
                    enquiries={[entry]}
                    knownEmail="Asha@example.test"
                />,
            ),
        );
        expect(words[0]).toBe("What they wrote");
        expect(words).toEqual(
            expect.arrayContaining([
                "Your name",
                "Asha",
                "Message",
                "Do you take bookings for six on a Sunday?",
            ]),
        );
        expect(words).not.toContain("asha@example.test");
    });

    it("keeps the email when it is all they gave", () => {
        const html = renderToStaticMarkup(
            <EnquiryCard
                enquiries={[{ ...entry, answers: [entry.answers[0]] }]}
                knownEmail="asha@example.test"
            />,
        );
        expect(text(html)).toContain("asha@example.test");
    });

    it("renders nothing for a lead with no enquiry", () => {
        expect(
            renderToStaticMarkup(
                <EnquiryCard enquiries={[]} knownEmail={null} />,
            ),
        ).toBe("");
    });
});
