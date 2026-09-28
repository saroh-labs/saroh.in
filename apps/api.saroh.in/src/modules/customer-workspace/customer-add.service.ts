import { Injectable, Optional } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { emailHeldBy } from "../contacts/contact-edit";
import { CreateContactDto } from "../contacts/dto";
import { authorize } from "../organizations/organization-policy";
import { ADDED_AS_CUSTOMER } from "./customers-list.sql";

/** Sell › Customers › Add customer: the same fields as Contacts' own add. */
export class AddCustomerDto extends CreateContactDto {}

/** Who holds an email, as the edit sheet's clash names them (C8). */
const HOLDER = { id: true, firstName: true, lastName: true } as const;

const blank = (v: string | undefined): string | null =>
    v?.trim() ? v.trim() : null;

/**
 * "Add customer" on the Customers list (DEC-056): someone met at the counter
 * or on the phone, added to the business as a contact only — never a
 * storefront's customer. Orders reach them later through the store
 * customers linked to them, as they do for everyone (C2, B13b).
 *
 * `contact:write`. An email another contact holds is a 409 naming them, so
 * the screen can open that person instead of making a second.
 */
@Injectable()
export class CustomerAddService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    async add(
        ctx: OrganizationContext,
        dto: AddCustomerDto,
    ): Promise<{ contactId: string }> {
        authorize(ctx, "contact:write");
        const organizationId = ctx.organizationId;
        const holder = await this.db.contact.findFirst({
            where: {
                organizationId,
                email: { equals: dto.email, mode: "insensitive" },
            },
            select: HOLDER,
        });
        if (holder) throw emailHeldBy(holder);
        try {
            const made = await this.db.contact.create({
                data: {
                    organizationId,
                    email: dto.email,
                    firstName: blank(dto.firstName),
                    lastName: blank(dto.lastName),
                    phone: blank(dto.phone),
                    company: blank(dto.company),
                    source: ADDED_AS_CUSTOMER,
                },
                select: { id: true },
            });
            return { contactId: made.id };
        } catch (err) {
            // Someone else added the same email in between.
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
            ) {
                const again = await this.db.contact.findFirst({
                    where: { organizationId, email: dto.email },
                    select: HOLDER,
                });
                if (again) throw emailHeldBy(again);
            }
            throw err;
        }
    }
}
