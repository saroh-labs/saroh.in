jest.mock("../communications/account-thread", () => ({
    accountThreadOn: jest.fn(),
}));
jest.mock("./account-area", () => ({ accountAreaOn: jest.fn() }));
jest.mock("../customer-workspace/resolve-contact", () => ({
    resolveContact: jest.fn(),
}));

import type { Prisma } from "@saroh/database";

import { accountThreadOn } from "../communications/account-thread";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { accountAreaOn } from "./account-area";
import { contactReach, noticeChannels, reachOf } from "./notice-reach";

const threadFlag = accountThreadOn as jest.Mock;
const areaOn = accountAreaOn as jest.Mock;
const resolve = resolveContact as jest.Mock;

function makeDb(provider: string | null = "CONNECTED", accounts = 1) {
    return {
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue(provider ? { status: provider } : null),
        },
        customerAccount: { count: jest.fn().mockResolvedValue(accounts) },
        consent: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: jest.fn(),
    };
}
const asDb = (db: ReturnType<typeof makeDb>) =>
    db as unknown as Prisma.TransactionClient;

beforeEach(() => {
    jest.clearAllMocks();
    areaOn.mockReturnValue(true);
    threadFlag.mockResolvedValue(true);
    resolve.mockImplementation((_db: unknown, id: string) =>
        Promise.resolve({
            id,
            organizationId: "org_1",
            mergedFrom: null,
            removed: false,
        }),
    );
});

describe("how a notice reaches a customer (A14)", () => {
    it("the rule, every combination", () => {
        expect(reachOf({ email: true, thread: true }, true)).toBe(
            "EMAIL_AND_ACCOUNT",
        );
        expect(reachOf({ email: true, thread: false }, true)).toBe("EMAIL");
        expect(reachOf({ email: false, thread: true }, true)).toBe("ACCOUNT");
        expect(reachOf({ email: true, thread: true }, false)).toBe(
            "ON_SIGN_IN",
        );
        expect(reachOf({ email: false, thread: true }, false)).toBe(
            "ON_SIGN_IN",
        );
        // Email goes only to a verified site account.
        expect(reachOf({ email: true, thread: false }, false)).toBe("NONE");
        expect(reachOf({ email: false, thread: false }, true)).toBe("NONE");
    });

    it("the thread is live only with the account area on and the business's flag on", async () => {
        expect(await noticeChannels(asDb(makeDb()), "org_1")).toEqual({
            email: true,
            thread: true,
        });
        threadFlag.mockResolvedValue(false);
        expect((await noticeChannels(asDb(makeDb()), "org_1")).thread).toBe(
            false,
        );
        threadFlag.mockResolvedValue(true);
        areaOn.mockReturnValue(false);
        expect((await noticeChannels(asDb(makeDb()), "org_1")).thread).toBe(
            false,
        );
    });

    it("email only through a connected provider", async () => {
        expect(
            (await noticeChannels(asDb(makeDb("DISABLED")), "org_1")).email,
        ).toBe(false);
        expect((await noticeChannels(asDb(makeDb(null)), "org_1")).email).toBe(
            false,
        );
    });

    it("a contact: their account decides; a removed or missing one hears nothing", async () => {
        expect(await contactReach(asDb(makeDb()), "org_1", "ct_1")).toBe(
            "EMAIL_AND_ACCOUNT",
        );
        expect(
            await contactReach(asDb(makeDb("CONNECTED", 0)), "org_1", "ct_1"),
        ).toBe("ON_SIGN_IN");
        expect(await contactReach(asDb(makeDb()), "org_1", null)).toBe("NONE");
        resolve.mockResolvedValueOnce(null);
        expect(await contactReach(asDb(makeDb()), "org_1", "ct_x")).toBe(
            "NONE",
        );
        resolve.mockResolvedValueOnce({
            id: "ct_1",
            organizationId: "org_1",
            mergedFrom: null,
            removed: true,
        });
        expect(await contactReach(asDb(makeDb()), "org_1", "ct_1")).toBe(
            "NONE",
        );
    });

    it("a revoked email consent is never said to be emailed", async () => {
        const db = makeDb();
        db.consent.findUnique.mockResolvedValue({ status: "REVOKED" });
        expect(await contactReach(asDb(db), "org_1", "ct_1")).toBe("ACCOUNT");
        threadFlag.mockResolvedValue(false);
        expect(await contactReach(asDb(db), "org_1", "ct_1")).toBe("NONE");
    });

    it("a merged-away contact is read as its survivor", async () => {
        const db = makeDb();
        resolve.mockResolvedValueOnce({
            id: "ct_survivor",
            organizationId: "org_1",
            mergedFrom: "ct_1",
            removed: false,
        });
        await contactReach(asDb(db), "org_1", "ct_1");
        expect(db.customerAccount.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                contactId: "ct_survivor",
                status: "ACTIVE",
            },
        });
    });
});
