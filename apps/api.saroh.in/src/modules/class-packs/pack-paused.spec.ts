/**
 * A website a move to a lower plan paused (#800) takes no orders for class
 * packs either: buying one online from the account is refused with
 * `NOT_TAKING_ORDERS` before anything is drafted, and the packs read says
 * the site isn't taking orders, with Buy off. What is paused is mocked.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        classPack: { findFirst: jest.fn(), findMany: jest.fn() },
        site: { findFirst: jest.fn() },
        $transaction: jest.fn(),
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

const siteTaking = jest.fn();
jest.mock("../orders/checkout-paused", () => ({
    ...jest.requireActual("../orders/checkout-paused"),
    siteTakingOrders: (...a: unknown[]) => siteTaking(...a),
}));

jest.mock("../organizations/organization-lifecycle.gate", () => ({
    assertOrganizationOpen: () => Promise.resolve(),
}));

jest.mock("./packs-offered", () => ({
    packsOffered: () => Promise.resolve(true),
}));

jest.mock("../bookings/public-booking-page", () => ({
    takesOnlinePayment: () => Promise.resolve(true),
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    NOT_TAKING_ORDERS,
    NOT_TAKING_ORDERS_MESSAGE,
} from "../billing/paused-errors";
import type { PaymentsService } from "../payments/payments.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { PublicPackPurchaseService } from "./public-pack-purchase.service";
import { PublicPacksService } from "./public-packs.service";

const packFindFirst = prisma.classPack.findFirst as jest.Mock;
const packFindMany = prisma.classPack.findMany as jest.Mock;
const siteFindFirst = prisma.site.findFirst as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const CUSTOMER: CustomerContext = {
    organizationId: "org_1",
    siteId: "site_2",
    accountId: "acc_1",
    contactId: "contact_1",
} as CustomerContext;

function purchases() {
    return new PublicPackPurchaseService({} as PaymentsService);
}

beforeEach(() => {
    jest.clearAllMocks();
    siteTaking.mockResolvedValue(true);
    packFindMany.mockResolvedValue([]);
    siteFindFirst.mockResolvedValue({ organizationId: "org_1" });
});

describe("buying a class pack online on a paused website (#800)", () => {
    it("is refused with NOT_TAKING_ORDERS in the customer's words, before anything is drafted", async () => {
        siteTaking.mockResolvedValue(false);
        const err = await purchases()
            .start(CUSTOMER, "pack_1", "key_1")
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message: NOT_TAKING_ORDERS_MESSAGE,
            details: { code: NOT_TAKING_ORDERS, reason: "notTakingOrders" },
        });
        expect(siteTaking).toHaveBeenCalledWith("org_1", "site_2");
        expect(packFindFirst).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it("goes on to the pack when the site takes orders", async () => {
        packFindFirst.mockResolvedValue(null);
        await expect(
            purchases().start(CUSTOMER, "pack_1", "key_1"),
        ).rejects.toThrow("Class pack not found");
        expect(packFindFirst).toHaveBeenCalled();
    });

    it("lists the packs with Buy off and says the site isn't taking orders", async () => {
        siteTaking.mockResolvedValue(false);
        await expect(purchases().onSale(CUSTOMER)).resolves.toEqual({
            payOnline: false,
            packs: [],
            notTakingOrders: true,
        });
    });

    it("lists them as before when the site takes orders", async () => {
        await expect(purchases().onSale(CUSTOMER)).resolves.toEqual({
            payOnline: true,
            packs: [],
        });
    });
});

describe("the site's packs read on a paused website (#800)", () => {
    it("shows the packs with Buy off, and says the site isn't taking orders", async () => {
        siteTaking.mockResolvedValue(false);
        await expect(
            new PublicPacksService().list("site_2", "visitor"),
        ).resolves.toEqual({
            payOnline: false,
            packs: [],
            notTakingOrders: true,
        });
    });

    it("is unchanged while the site takes orders", async () => {
        await expect(
            new PublicPacksService().list("site_1", "visitor"),
        ).resolves.toEqual({ payOnline: true, packs: [] });
    });
});
