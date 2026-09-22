/**
 * Deleting a customer (#384). Pure unit test with a mocked Prisma and a fake
 * StoresService: a customer who never ordered can go; one with orders stays,
 * because an order keeps who bought it.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        customer: { findFirst: jest.fn(), delete: jest.fn() },
    },
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import type { StoresService } from "../stores/stores.service";

import { CustomersService } from "./customers.service";

const findFirst = prisma.customer.findFirst as jest.Mock;
const remove = prisma.customer.delete as jest.Mock;
const writableOrganization = jest.fn();

function service(): CustomersService {
    return new CustomersService(
        { writableOrganization } as unknown as StoresService,
        {} as ActivationEvents,
    );
}

describe("CustomersService.remove", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        writableOrganization.mockResolvedValue({ organizationId: "org_1" });
    });

    it("deletes a customer who has never ordered", async () => {
        findFirst.mockResolvedValue({ id: "cu_1", _count: { orders: 0 } });
        await expect(
            service().remove("store_1", "cu_1", "user_1"),
        ).resolves.toEqual({ id: "cu_1", deleted: true });
        expect(findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "cu_1", storeId: "store_1" },
            }),
        );
        expect(remove).toHaveBeenCalledWith({ where: { id: "cu_1" } });
    });

    it("keeps a customer with orders, and says how many", async () => {
        findFirst.mockResolvedValue({ id: "cu_1", _count: { orders: 3 } });
        const refused = service().remove("store_1", "cu_1", "user_1");
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(refused).rejects.toMatchObject({
            response: { orders: 3, message: expect.stringMatching(/3 orders/) },
        });
        expect(remove).not.toHaveBeenCalled();
    });

    it("404s another store's customer", async () => {
        findFirst.mockResolvedValue(null);
        await expect(
            service().remove("store_1", "cu_other", "user_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(remove).not.toHaveBeenCalled();
    });

    it("404s someone who may not write to the store", async () => {
        writableOrganization.mockResolvedValue(null);
        await expect(
            service().remove("store_1", "cu_1", "user_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(findFirst).not.toHaveBeenCalled();
    });
});
