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
import {
    contactNotice,
    contactReach,
    noticeChannels,
    reachOf,
} from "./notice-reach";

const threadFlag = accountThreadOn as jest.Mock;
const areaOn = accountAreaOn as jest.Mock;
const resolve = resolveContact as jest.Mock;

function makeDb(
    provider: string | null = "CONNECTED",
    accounts = 1,
    contactEmail: string | null = "asha@example.com",
) {
    return {
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    provider ? { status: provider, provider: "RESEND" } : null,
                ),
        },
        customerAccount: {
            count: jest.fn().mockResolvedValue(accounts),
            findFirst: jest
                .fn()
                .mockResolvedValue(
                    accounts > 0 ? { email: "asha.account@example.com" } : null,
                ),
        },
        contact: {
            findFirst: jest
                .fn()
                .mockResolvedValue(
                    contactEmail === null ? null : { email: contactEmail },
                ),
        },
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
        // `email`: an email goes to this contact (provider, address, consent).
        expect(reachOf({ email: true, thread: true }, true)).toBe(
            "EMAIL_AND_ACCOUNT",
        );
        expect(reachOf({ email: true, thread: false }, true)).toBe("EMAIL");
        expect(reachOf({ email: false, thread: true }, true)).toBe("ACCOUNT");
        // D1: no account needed for email.
        expect(reachOf({ email: true, thread: true }, false)).toBe("EMAIL");
        expect(reachOf({ email: true, thread: false }, false)).toBe("EMAIL");
        expect(reachOf({ email: false, thread: true }, false)).toBe(
            "ON_SIGN_IN",
        );
        expect(reachOf({ email: false, thread: false }, true)).toBe("NONE");
        expect(reachOf({ email: false, thread: false }, false)).toBe("NONE");
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
        // D1: a contact with no account but an email of their own is emailed.
        expect(
            await contactReach(asDb(makeDb("CONNECTED", 0)), "org_1", "ct_1"),
        ).toBe("EMAIL");
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

describe("the contact's own email (DEC-174 D1, U2)", () => {
    it("a desk or phone customer with an email and no account: emailed to their own address", async () => {
        threadFlag.mockResolvedValue(false);
        expect(
            await contactNotice(asDb(makeDb("CONNECTED", 0)), "org_1", "ct_1"),
        ).toEqual({ reach: "EMAIL", to: "asha@example.com" });
    });

    it("A2: a live site account's verified address wins over the contact's", async () => {
        expect(await contactNotice(asDb(makeDb()), "org_1", "ct_1")).toEqual({
            reach: "EMAIL_AND_ACCOUNT",
            to: "asha.account@example.com",
        });
    });

    it("a contact with no email, or only a placeholder, and no account: nothing by email", async () => {
        threadFlag.mockResolvedValue(false);
        expect(
            await contactNotice(
                asDb(makeDb("CONNECTED", 0, "")),
                "org_1",
                "ct_1",
            ),
        ).toEqual({ reach: "NONE", to: null });
        expect(
            await contactNotice(
                asDb(makeDb("CONNECTED", 0, "phone+x@phone.invalid")),
                "org_1",
                "ct_1",
            ),
        ).toEqual({ reach: "NONE", to: null });
        // With the thread live they see it when they sign in.
        threadFlag.mockResolvedValue(true);
        expect(
            await contactReach(
                asDb(makeDb("CONNECTED", 0, "")),
                "org_1",
                "ct_1",
            ),
        ).toBe("ON_SIGN_IN");
    });

    it("a revoked email consent: no address is named", async () => {
        const db = makeDb("CONNECTED", 0);
        db.consent.findUnique.mockResolvedValue({ status: "REVOKED" });
        threadFlag.mockResolvedValue(false);
        expect(await contactNotice(asDb(db), "org_1", "ct_1")).toEqual({
            reach: "NONE",
            to: null,
        });
    });

    it("no provider: never said to be emailed, whatever address they have", async () => {
        threadFlag.mockResolvedValue(false);
        expect(
            await contactNotice(asDb(makeDb(null, 0)), "org_1", "ct_1"),
        ).toEqual({ reach: "NONE", to: null });
    });
});

describe("no provider, no email (DEC-086 removed, #1134)", () => {
    it("a business with no connected provider emails nobody: its customers hear in their account alone", async () => {
        expect((await noticeChannels(asDb(makeDb(null)), "org_1")).email).toBe(
            false,
        );
        expect(await contactReach(asDb(makeDb(null)), "org_1", "ct_1")).toBe(
            "ACCOUNT",
        );
        // With no thread either, nothing reaches them, and nothing says so.
        threadFlag.mockResolvedValue(false);
        expect(await contactReach(asDb(makeDb(null)), "org_1", "ct_1")).toBe(
            "NONE",
        );
    });

    it("a disconnected provider sends nothing", async () => {
        expect(
            await contactReach(asDb(makeDb("DISABLED")), "org_1", "ct_1"),
        ).toBe("ACCOUNT");
    });
});
