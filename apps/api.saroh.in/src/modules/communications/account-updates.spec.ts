// "Updates in your customers' Messages" (12 Oct 2026), with the database
// stood in: what the workspace reads to draw the row, who may change it,
// and what a notice's reach says once a business has turned its updates
// off, read through the rule itself (`accountThreadOn`), not a stand-in
// for it. The DB-backed twin is account-updates.db.spec.ts.
jest.mock("../../env", () => ({ env: {} }));

const flagOn = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({
        isEnabled: flagOn,
    })),
}));
jest.mock("../site-accounts/account-area", () => ({
    accountAreaOn: jest.fn(),
}));
jest.mock("../customer-workspace/resolve-contact", () => ({
    resolveContact: jest.fn(),
}));
jest.mock("./saroh-may-send", () => ({
    ...jest.requireActual<object>("./saroh-may-send"),
    emailRoute: jest.fn(),
    sarohRoomLeft: jest.fn(),
}));
jest.mock("@saroh/database", () => ({
    prisma: {
        businessProfile: { findUnique: jest.fn(), upsert: jest.fn() },
        communicationProvider: { findUnique: jest.fn() },
    },
}));

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { resolveContact } from "../customer-workspace/resolve-contact";
import { allows, roleDenial } from "../organizations/organization-policy";
import { accountAreaOn } from "../site-accounts/account-area";
import { contactReach, noticeChannels } from "../site-accounts/notice-reach";
import { readAccountUpdates, writeAccountUpdates } from "./account-updates";
import { CommunicationsService } from "./communications.service";
import { emailRoute } from "./saroh-may-send";

const areaOn = accountAreaOn as jest.Mock;
const profile = prisma.businessProfile.findUnique as jest.Mock;
const upsert = prisma.businessProfile.upsert as jest.Mock;
const provider = prisma.communicationProvider.findUnique as jest.Mock;
const route = emailRoute as jest.Mock;
const resolve = resolveContact as jest.Mock;

/** A stand-in for the caller's transaction: who has an account, who agreed. */
function db(accounts = 1) {
    return {
        communicationProvider: { findUnique: jest.fn() },
        customerAccount: { count: jest.fn().mockResolvedValue(accounts) },
        consent: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: jest.fn(),
    } as unknown as Prisma.TransactionClient;
}

const ctx = (actions: string[]) =>
    ({
        organizationId: "org_1",
        userId: "u_1",
        role: "MEMBER",
        roleKey: "custom",
        actions: new Set(actions),
    }) as never;

beforeEach(() => {
    jest.clearAllMocks();
    areaOn.mockReturnValue(true);
    flagOn.mockResolvedValue(true);
    profile.mockResolvedValue({ accountUpdates: true });
    upsert.mockResolvedValue({});
    provider.mockResolvedValue({ status: "CONNECTED" });
    route.mockResolvedValue({ route: "PROVIDER", provider: "RESEND" });
    resolve.mockImplementation((_db: unknown, id: string) =>
        Promise.resolve({
            id,
            organizationId: "org_1",
            mergedFrom: null,
            removed: false,
        }),
    );
});

describe("what the workspace reads", () => {
    it("on by default, offered while the thread could be posted to, and whether it emails", async () => {
        profile.mockResolvedValue(null);
        expect(await readAccountUpdates("org_1")).toEqual({
            on: true,
            offered: true,
            emailConnected: true,
        });
    });

    it("turned off, it is still offered: that is how it is turned back on", async () => {
        profile.mockResolvedValue({ accountUpdates: false });
        expect(await readAccountUpdates("org_1")).toMatchObject({
            on: false,
            offered: true,
        });
    });

    it.each([
        ["the account area off", false, true],
        ["the rollout flag off for the business", true, false],
    ])("is not offered with %s", async (_what, area, flag) => {
        areaOn.mockReturnValue(area);
        flagOn.mockResolvedValue(flag);
        expect((await readAccountUpdates("org_1")).offered).toBe(false);
    });

    it.each([[null], [{ status: "DISABLED" }]])(
        "no connected email provider (%j) is said, never guessed",
        async (row) => {
            provider.mockResolvedValue(row);
            expect((await readAccountUpdates("org_1")).emailConnected).toBe(
                false,
            );
        },
    );
});

describe("the write", () => {
    it("sets the choice, making the profile if the business has none", async () => {
        profile.mockResolvedValue({ accountUpdates: false });
        expect(await writeAccountUpdates("org_1", false)).toMatchObject({
            on: false,
        });
        expect(upsert).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            create: { organizationId: "org_1", accountUpdates: false },
            update: { accountUpdates: false },
        });
    });
});

describe("who may", () => {
    const service = new CommunicationsService();

    it("someone who manages messaging setup reads and changes it", async () => {
        const c = ctx(["comms:manage"]);
        expect(await service.accountUpdates(c)).toMatchObject({ on: true });
        await service.setAccountUpdates(c, false);
        expect(upsert).toHaveBeenCalledTimes(1);
    });

    it("nobody else does, and nothing is written", async () => {
        const c = ctx(["message:read", "message:write", "contact:read"]);
        expect(allows(c, "comms:manage")).toBe(false);
        const denied = { response: roleDenial("comms:manage") };
        await expect(service.accountUpdates(c)).rejects.toMatchObject(denied);
        await expect(service.setAccountUpdates(c, false)).rejects.toMatchObject(
            denied,
        );
        expect(upsert).not.toHaveBeenCalled();
    });
});

describe("a notice's reach once the business has turned its updates off", () => {
    beforeEach(() => profile.mockResolvedValue({ accountUpdates: false }));

    it("with its own email: emailed, as while the thread was not live", async () => {
        expect(await noticeChannels(db(), "org_1")).toEqual({
            email: true,
            thread: false,
        });
        expect(await contactReach(db(), "org_1", "ct_1")).toBe("EMAIL");
    });

    it("with no email provider: nothing is sent, and it is said so", async () => {
        route.mockResolvedValue({ route: null, refusal: null });
        expect(await noticeChannels(db(), "org_1")).toEqual({
            email: false,
            thread: false,
        });
        expect(await contactReach(db(), "org_1", "ct_1")).toBe("NONE");
    });

    it("a customer with no account is not told it waits for their sign-in", async () => {
        expect(await contactReach(db(0), "org_1", "ct_1")).toBe("NONE");
    });

    it("turned on again, the thread is a channel again", async () => {
        profile.mockResolvedValue({ accountUpdates: true });
        expect(await contactReach(db(), "org_1", "ct_1")).toBe(
            "EMAIL_AND_ACCOUNT",
        );
        expect(await contactReach(db(0), "org_1", "ct_1")).toBe("ON_SIGN_IN");
    });
});
