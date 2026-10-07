// A customer's own phone fills a contact with none (UX-049), without a
// database. Against Postgres: public-checkout.db.spec.ts (the site's
// checkout) and the booking page's specs.
jest.mock("./resolve-contact", () => ({
    resolveContact: jest.fn(),
}));

import { fillContactPhoneInTx, phoneToFill } from "./contact-phone-fill";
import { resolveContact } from "./resolve-contact";

const resolve = resolveContact as jest.Mock;
const tx = { contact: { updateMany: jest.fn() } };

beforeEach(() => {
    jest.clearAllMocks();
    resolve.mockResolvedValue({ id: "c_survivor", removed: false });
    tx.contact.updateMany.mockResolvedValue({ count: 1 });
});

describe("phoneToFill", () => {
    it("fills only a contact with no phone, trimmed", () => {
        expect(phoneToFill(" 9811122233 ", null)).toBe("9811122233");
        expect(phoneToFill("9811122233", "  ")).toBe("9811122233");
        expect(phoneToFill("9811122233", "9800000000")).toBeNull();
        expect(phoneToFill("  ", null)).toBeNull();
        expect(phoneToFill(undefined, null)).toBeNull();
    });
});

describe("fillContactPhoneInTx", () => {
    it("writes the survivor, only while it still has no phone", async () => {
        expect(
            await fillContactPhoneInTx(tx as never, "org", "c_1", "9811122233"),
        ).toBe(true);
        expect(resolve).toHaveBeenCalledWith(tx, "c_1", "org");
        expect(tx.contact.updateMany).toHaveBeenCalledWith({
            where: {
                id: "c_survivor",
                organizationId: "org",
                OR: [{ phone: null }, { phone: "" }],
            },
            data: { phone: "9811122233" },
        });
    });

    it("writes nothing with no phone given, or a contact removed", async () => {
        expect(
            await fillContactPhoneInTx(tx as never, "org", "c_1", null),
        ).toBe(false);
        resolve.mockResolvedValue({ id: "c_1", removed: true });
        expect(
            await fillContactPhoneInTx(tx as never, "org", "c_1", "9811122233"),
        ).toBe(false);
        expect(tx.contact.updateMany).not.toHaveBeenCalled();
    });
});
