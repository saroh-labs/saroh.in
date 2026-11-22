import { contactBillToGst } from "./contact-gstin";

/** The GSTIN a customer saved, as an invoice copies it (R16). */
describe("contactBillToGst", () => {
    const tx = (
        gstin: string | null | undefined,
        edition: "INDIA" | "GLOBAL" | null = "INDIA",
    ) => {
        const findFirst = jest
            .fn()
            .mockResolvedValue(
                gstin === undefined
                    ? null
                    : { gstin, organization: { edition } },
            );
        return { findFirst, tx: { contact: { findFirst } } as never };
    };

    it("brings the GSTIN and its state, read inside the business", async () => {
        const { tx: db, findFirst } = tx("29AAAAA0000A1ZY");
        expect(await contactBillToGst(db, "org_1", "con_1")).toEqual({
            billToGstin: "29AAAAA0000A1ZY",
            billToState: "29",
        });
        expect(findFirst).toHaveBeenCalledWith({
            where: { id: "con_1", organizationId: "org_1" },
            select: {
                gstin: true,
                organization: { select: { edition: true } },
            },
        });
    });

    it("is none on a business without GST (Global, E3), even if one was saved", async () => {
        expect(
            await contactBillToGst(
                tx("29AAAAA0000A1ZY", "GLOBAL").tx,
                "org_1",
                "con_1",
            ),
        ).toEqual({ billToGstin: null, billToState: null });
        // Unset is India.
        expect(
            await contactBillToGst(
                tx("29AAAAA0000A1ZY", null).tx,
                "org_1",
                "con_1",
            ),
        ).toEqual({ billToGstin: "29AAAAA0000A1ZY", billToState: "29" });
    });

    it("is none when the contact has none, is another business's, or isn't named", async () => {
        const none = { billToGstin: null, billToState: null };
        expect(await contactBillToGst(tx(null).tx, "org_1", "con_1")).toEqual(
            none,
        );
        expect(
            await contactBillToGst(tx(undefined).tx, "org_2", "con_1"),
        ).toEqual(none);
        const { tx: db, findFirst } = tx("29AAAAA0000A1ZY");
        expect(await contactBillToGst(db, "org_1", null)).toEqual(none);
        expect(findFirst).not.toHaveBeenCalled();
    });
});
