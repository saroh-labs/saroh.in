import {
    emailFieldNames,
    enquiryPreview,
    readableAnswers,
} from "./enquiry-entries";

/**
 * What an enquirer wrote, as the lead, the contact and the owner's
 * notification show it (UX-002).
 */
const fields = [
    { name: "email", label: "Email", type: "email" },
    { name: "name", label: "Your name", type: "text" },
    { name: "message", label: "Message", type: "textarea" },
];

describe("readableAnswers", () => {
    it("labels each answer by its field, in the form's order, skipping empty ones", () => {
        expect(
            readableAnswers(
                {
                    message: "  Can I book for six?  ",
                    email: "asha@example.test",
                    name: "",
                },
                fields,
            ),
        ).toEqual([
            { name: "email", label: "Email", value: "asha@example.test" },
            { name: "message", label: "Message", value: "Can I book for six?" },
        ]);
    });

    it("keeps a value whose field was since removed, under its own name", () => {
        expect(
            readableAnswers({ email: "a@example.test", budget: 4000 }, fields),
        ).toEqual([
            { name: "email", label: "Email", value: "a@example.test" },
            { name: "budget", label: "budget", value: "4000" },
        ]);
    });

    it("reads nothing from data that isn't an object", () => {
        expect(readableAnswers(null, fields)).toEqual([]);
        expect(readableAnswers(["x"], fields)).toEqual([]);
    });
});

describe("enquiryPreview", () => {
    it("leaves out the address and leads with the longest answer", () => {
        const answers = readableAnswers(
            {
                email: "a@example.test",
                name: "Asha",
                message: "Do you deliver\non Sundays?",
            },
            fields,
        );
        expect(enquiryPreview(answers, emailFieldNames(fields))).toBe(
            "Do you deliver on Sundays? · Asha",
        );
    });

    it("is null when only the address was given, and cuts a long message", () => {
        expect(
            enquiryPreview([{ name: "email", label: "Email", value: "a@b.c" }]),
        ).toBeNull();
        const long = enquiryPreview(
            [{ name: "message", label: "Message", value: "x".repeat(400) }],
            ["email"],
            20,
        );
        expect(long).toHaveLength(20);
        expect(long?.endsWith("…")).toBe(true);
    });
});
