import {
    SUGGESTED_LABEL_MAX,
    suggestedDetail,
    suggestedLabel,
    suggestFromBookingNoteInTx,
} from "./attention-suggest";

/**
 * A booking-page note becomes a Needs attention suggestion (C12): what the
 * confirm card starts from, and when one is written.
 */

describe("suggestedLabel", () => {
    it("takes the note's first clause", () => {
        expect(
            suggestedLabel(
                "I take amlodipine for blood pressure. Please check first.",
            ),
        ).toBe("I take amlodipine for blood pressure");
        expect(suggestedLabel("Nervous about needles, sorry")).toBe(
            "Nervous about needles",
        );
        expect(suggestedLabel("Pregnant (20 weeks)")).toBe("Pregnant");
        expect(suggestedLabel("Knee brace\nand a stick")).toBe("Knee brace");
    });

    it("cuts a long first clause at a word, within the limit", () => {
        const label = suggestedLabel(
            "I have had a very bad reaction to local anaesthetic in the past",
        );
        expect([...label].length).toBeLessThanOrEqual(SUGGESTED_LABEL_MAX);
        expect(label).toBe("I have had a very bad reaction to local");
    });

    it("cuts one very long word at the limit", () => {
        expect(suggestedLabel("a".repeat(80))).toBe("a".repeat(40));
    });

    it("falls back to the note when it opens with punctuation", () => {
        expect(suggestedLabel("(asthma) inhaler in bag")).toBe(
            "(asthma) inhaler in bag",
        );
    });
});

describe("suggestedDetail", () => {
    it("keeps a note of 500 characters whole", () => {
        const note = "x".repeat(500);
        expect(suggestedDetail(`  ${note}  `)).toBe(note);
    });

    it("cuts a longer note to 500 with an ellipsis", () => {
        const detail = suggestedDetail("y".repeat(1000));
        expect([...detail].length).toBe(500);
        expect(detail.endsWith("…")).toBe(true);
    });
});

describe("suggestFromBookingNoteInTx", () => {
    function tx(existing: { id: string } | null = null) {
        return {
            contactAttention: {
                findFirst: jest.fn().mockResolvedValue(existing),
                create: jest.fn().mockResolvedValue({ id: "att_1" }),
            },
        };
    }
    const booking = {
        id: "bk_1",
        organizationId: "org_1",
        contactId: "c1",
        status: "CONFIRMED",
        intakeNote: "  I take amlodipine for blood pressure.  ",
    };
    const asTx = (t: ReturnType<typeof tx>) =>
        t as unknown as Parameters<typeof suggestFromBookingNoteInTx>[0];

    it("writes a sensitive Medical suggestion from the booking page, naming the booking", async () => {
        const t = tx();

        await expect(
            suggestFromBookingNoteInTx(asTx(t), booking),
        ).resolves.toBe(true);

        expect(t.contactAttention.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                contactId: "c1",
                kind: "MEDICAL",
                label: "I take amlodipine for blood pressure",
                detail: "I take amlodipine for blood pressure.",
                sensitive: true,
                source: "BOOKING_PAGE",
                status: "SUGGESTED",
                bookingId: "bk_1",
            },
            select: { id: true },
        });
    });

    it("writes one per booking", async () => {
        const t = tx({ id: "att_0" });

        await expect(
            suggestFromBookingNoteInTx(asTx(t), booking),
        ).resolves.toBe(false);

        expect(t.contactAttention.findFirst.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            bookingId: "bk_1",
            source: "BOOKING_PAGE",
        });
        expect(t.contactAttention.create).not.toHaveBeenCalled();
    });

    it.each([
        ["a hold still waiting for its payment", { status: "PENDING" }],
        ["no note", { intakeNote: null }],
        ["an empty note", { intakeNote: "   " }],
        ["no contact", { contactId: null }],
    ])("writes nothing for %s", async (_what, over) => {
        const t = tx();

        await expect(
            suggestFromBookingNoteInTx(asTx(t), { ...booking, ...over }),
        ).resolves.toBe(false);

        expect(t.contactAttention.findFirst).not.toHaveBeenCalled();
        expect(t.contactAttention.create).not.toHaveBeenCalled();
    });
});
