import { describe, expect, it } from "vitest";

import { ENQUIRY_DEFAULT_FIELDS, emptySection } from "../empty-section";
import { keyFromLabel, labelChange } from "./enquiry";

describe("a new enquiry form (UX-081)", () => {
    it("asks for a name, an email and a message", () => {
        const section = emptySection("enquiry");
        const fields = (section.content as { fields: { name: string }[] })
            .fields;
        expect(fields.map((f) => f.name)).toEqual(["name", "email", "message"]);
        expect(ENQUIRY_DEFAULT_FIELDS[1]).toMatchObject({
            type: "email",
            required: true,
        });
    });
});

describe("a field's key follows its label (UX-081)", () => {
    it("makes a key from a new field's label", () => {
        expect(labelChange({ name: "", label: "" }, "Event date")).toEqual({
            label: "Event date",
            name: "event_date",
        });
        expect(keyFromLabel("  Budget (₹) ")).toBe("budget");
    });

    it("keeps a key set by hand, and the keys a lead is read by", () => {
        expect(
            labelChange({ name: "venue", label: "Where" }, "Where is it?"),
        ).toEqual({ label: "Where is it?" });
        expect(
            labelChange({ name: "message", label: "Message" }, "Your question"),
        ).toEqual({ label: "Your question" });
    });
});
