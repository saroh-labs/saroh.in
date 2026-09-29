import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { AddCustomerDto, CustomerAddService } from "./customer-add.service";
import { ADDED_AS_CUSTOMER } from "./customers-list.sql";

/**
 * Add customer (DEC-056, C14) with a mocked database: a contact only, marked
 * as added on the Customers list, and never a second person for one email.
 */

function ctx(actions: OrgAction[]): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
        actions: new Set(actions),
    } as OrganizationContext;
}

function make() {
    const db = {
        contact: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "c_new" }),
        },
        customer: { create: jest.fn() },
    };
    const service = new CustomerAddService(
        db as unknown as ConstructorParameters<typeof CustomerAddService>[0],
    );
    return { service, db };
}

const ASHA = {
    email: "asha@example.com",
    firstName: " Asha ",
    lastName: "",
    phone: "+91 98450 12345",
};

describe("CustomerAddService.add", () => {
    it("makes a contact only, marked as added on the Customers list", async () => {
        const { service, db } = make();

        const out = await service.add(ctx(["contact:write"]), ASHA);

        expect(out).toEqual({ contactId: "c_new" });
        expect(db.contact.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                email: "asha@example.com",
                firstName: "Asha",
                lastName: null,
                phone: "+91 98450 12345",
                company: null,
                source: ADDED_AS_CUSTOMER,
            },
            select: { id: true },
        });
        // Never a storefront's customer (DEC-056).
        expect(db.customer.create).not.toHaveBeenCalled();
    });

    it("is refused without contact:write", async () => {
        const { service, db } = make();
        await expect(
            service.add(ctx(["contact:read"]), ASHA),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("names the contact that already holds the email, in any case", async () => {
        const { service, db } = make();
        db.contact.findFirst.mockResolvedValue({
            id: "c_old",
            firstName: "Asha",
            lastName: "Rao",
        });

        const err = await service
            .add(ctx(["contact:write"]), ASHA)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message: "Asha Rao already has this email.",
            details: { field: "email", contactId: "c_old", name: "Asha Rao" },
        });
        expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            email: { equals: "asha@example.com", mode: "insensitive" },
        });
        expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("names the winner when someone adds the same email at the same moment", async () => {
        const { service, db } = make();
        db.contact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: "c_race",
            firstName: null,
            lastName: null,
        });
        db.contact.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("Unique", {
                code: "P2002",
                clientVersion: "test",
            }),
        );

        const err = await service
            .add(ctx(["contact:write"]), ASHA)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            details: { contactId: "c_race" },
        });
    });

    it("needs an email, and trims and lowers it", async () => {
        const none = plainToInstance(AddCustomerDto, { firstName: "Asha" });
        expect((await validate(none)).map((e) => e.property)).toContain(
            "email",
        );
        const typed = plainToInstance(AddCustomerDto, {
            email: "  Asha@Example.com ",
        });
        expect(await validate(typed)).toEqual([]);
        expect(typed.email).toBe("asha@example.com");
    });
});
