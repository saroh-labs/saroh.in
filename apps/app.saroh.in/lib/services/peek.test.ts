import { describe, expect, it } from "vitest";

import type { PeekAttention, PeekAttentionEntry } from "./peek";
import { attentionText, NO_PHONE, NO_PHONE_ON_PAGE, phoneText } from "./peek";

function entry(
    kind: PeekAttentionEntry["kind"],
    label: string,
    sensitive = false,
): PeekAttentionEntry {
    return { id: `${kind}-${label}`, kind, label, sensitive };
}

function read(
    entries: PeekAttentionEntry[],
    hiddenSensitiveCount = 0,
): PeekAttention {
    return { entries, hiddenSensitiveCount };
}

describe("attentionText", () => {
    it("says each entry as the design does: kind, then label", () => {
        expect(
            attentionText(
                read([
                    entry("ALLERGY", "Peanuts"),
                    entry("ACCESS", "Uses a wheelchair"),
                ]),
            ),
        ).toBe("Allergy: Peanuts · Access: Uses a wheelchair");
    });

    it("shows a sensitive entry to someone the read gave it to", () => {
        expect(attentionText(read([entry("MEDICAL", "Diabetic", true)]))).toBe(
            "Medical: Diabetic",
        );
    });

    it("counts what the viewer can't see after what they can", () => {
        expect(attentionText(read([entry("ALLERGY", "Latex")], 1))).toBe(
            "Allergy: Latex · 1 more your role can't see",
        );
    });

    it("counts hidden entries on their own, never their words", () => {
        expect(attentionText(read([], 1))).toBe("1 note your role can't see");
        expect(attentionText(read([], 2))).toBe("2 notes your role can't see");
    });

    it("leaves the row out when there is nothing, or the read failed", () => {
        expect(attentionText(read([]))).toBeNull();
        expect(attentionText(null)).toBeNull();
    });
});

describe("phoneText", () => {
    const person = (phone: string | null) => ({ phone, attention: null });

    it("uses the number the booking was made with first", () => {
        expect(
            phoneText({
                bookerPhone: "+91 98450 77120",
                hasContact: true,
                person: person("+91 90000 00000"),
            }),
        ).toBe("+91 98450 77120");
    });

    it("falls back to the contact's number", () => {
        expect(
            phoneText({
                bookerPhone: "  ",
                hasContact: true,
                person: person("+91 90000 00000"),
            }),
        ).toBe("+91 90000 00000");
    });

    it("says where to add it once the person is read with no phone", () => {
        expect(
            phoneText({
                bookerPhone: null,
                hasContact: true,
                person: person(null),
            }),
        ).toBe(NO_PHONE_ON_PAGE);
    });

    it("doesn't claim there is no phone before the person is read", () => {
        expect(
            phoneText({
                bookerPhone: null,
                hasContact: true,
                person: undefined,
            }),
        ).toBe("—");
    });

    it("has no page to point at without a contact", () => {
        expect(
            phoneText({
                bookerPhone: null,
                hasContact: false,
                person: undefined,
            }),
        ).toBe(NO_PHONE);
    });
});
