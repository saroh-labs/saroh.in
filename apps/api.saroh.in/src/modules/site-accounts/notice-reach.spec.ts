jest.mock("../communications/account-thread", () => ({
    accountThreadOn: jest.fn(),
}));
jest.mock("./account-area", () => ({ accountAreaOn: jest.fn() }));
jest.mock("../customer-workspace/resolve-contact", () => ({
    resolveContact: jest.fn(),
}));
jest.mock("../communications/saroh-may-send", () => ({
    ...jest.requireActual<object>("../communications/saroh-may-send"),
    sarohMaySend: jest.fn(),
    sarohRoomLeft: jest.fn(),
}));

import type { Prisma } from "@saroh/database";

import { accountThreadOn } from "../communications/account-thread";
import { sarohMaySend, sarohRoomLeft } from "../communications/saroh-may-send";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { accountAreaOn } from "./account-area";
import {
    contactReach,
    noticeChannels,
    noticeEmailRoute,
    reachOf,
} from "./notice-reach";

const threadFlag = accountThreadOn as jest.Mock;
const areaOn = accountAreaOn as jest.Mock;
const resolve = resolveContact as jest.Mock;
const sarohMay = sarohMaySend as jest.Mock;
const roomLeft = sarohRoomLeft as jest.Mock;

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
    sarohMay.mockResolvedValue(false);
    roomLeft.mockResolvedValue(true);
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

describe("email reach per notice kind (DEC-086)", () => {
    it("a booking notice with no provider is emailed when Saroh sends it", async () => {
        sarohMay.mockResolvedValue(true);
        const db = makeDb(null);
        expect(
            (await noticeChannels(asDb(db), "org_1", "BOOKING_CONFIRMED"))
                .email,
        ).toBe(true);
        expect(sarohMay).toHaveBeenCalledWith(db, "org_1", "BOOKING_CONFIRMED");
        expect(
            await noticeEmailRoute(
                asDb(makeDb("DISABLED")),
                "org_1",
                "BOOKING_MOVED",
            ),
        ).toBe("SAROH");
        expect(
            await contactReach(
                asDb(makeDb(null)),
                "org_1",
                "ct_1",
                undefined,
                "BOOKING_CANCELLED",
            ),
        ).toBe("EMAIL_AND_ACCOUNT");
    });

    it("says emailed only while this month's allowance has room (U3)", async () => {
        sarohMay.mockResolvedValue(true);
        roomLeft.mockResolvedValue(false);
        expect(
            await contactReach(
                asDb(makeDb(null)),
                "org_1",
                "ct_1",
                undefined,
                "BOOKING_CONFIRMED",
            ),
        ).toBe("ACCOUNT");
        // Its own provider is never counted, so never runs out.
        expect(
            (await noticeChannels(asDb(makeDb()), "org_1", "BOOKING_CONFIRMED"))
                .email,
        ).toBe(true);
    });

    it("account only when Saroh doesn't send it", async () => {
        sarohMay.mockResolvedValue(false);
        expect(
            await contactReach(
                asDb(makeDb(null)),
                "org_1",
                "ct_1",
                undefined,
                "BOOKING_CONFIRMED",
            ),
        ).toBe("ACCOUNT");
    });

    it("its own provider first: Saroh is never asked", async () => {
        expect(
            await noticeEmailRoute(
                asDb(makeDb("CONNECTED")),
                "org_1",
                "BOOKING_CONFIRMED",
            ),
        ).toBe("PROVIDER");
        expect(sarohMay).not.toHaveBeenCalled();
    });

    it("an order or waitlist notice, or no kind at all, reads the provider alone, as before", async () => {
        sarohMay.mockImplementation(
            (_db: unknown, _org: string, kind: string) =>
                Promise.resolve(kind.startsWith("BOOKING")),
        );
        expect(
            (await noticeChannels(asDb(makeDb(null)), "org_1", "ORDER_READY"))
                .email,
        ).toBe(false);
        expect((await noticeChannels(asDb(makeDb(null)), "org_1")).email).toBe(
            false,
        );
        expect(await contactReach(asDb(makeDb(null)), "org_1", "ct_1")).toBe(
            "ACCOUNT",
        );
    });
});
