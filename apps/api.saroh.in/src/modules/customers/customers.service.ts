import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import { isLocationScoped } from "../orders/order-location";
import { requireOrderRead } from "../stores/order-read-access";
import { StoresService } from "../stores/stores.service";
import type { CreateCustomerDto, UpdateCustomerDto } from "./dto";
import type { CustomerListItemDto } from "./serialize";
import { serializeCustomerListItem } from "./serialize";

/**
 * Store customers. Authorization delegates to StoresService (read = store
 * access, less the kitchen's stage-only roles). Creating, changing and
 * deleting ask `contact:write`, as Customer Detail on /contacts does (C13,
 * DEC-042: a delete is of a record with no orders), never `store:write`
 * (audit 2026-11-12 #6). Email is
 * unique per store, not globally (@@unique([storeId, email])).
 */
@Injectable()
export class CustomersService {
    constructor(
        private readonly stores: StoresService,
        // @Optional for the same reason ModuleLifecycleService's is: this
        // service is also constructed directly in DB-backed specs, which pass
        // only what they exercise. Requiring it made every such construction
        // throw on first write. `app.bootstrap.spec` asserts it IS resolved in
        // the real graph, so optional here cannot become silently inert (#176).
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    /**
     * The list a merchant reads: each customer with their order count, what
     * they have paid and when they last bought. The orders come back as a
     * narrow select and are aggregated in `serialize`, because the three
     * figures are facts about Orders and the frontend would otherwise need
     * every order of every customer to work them out.
     *
     * Emails and spend, so it takes a read of the store's orders, not only a
     * way into the store: a Member at the counter (`order:stage`, no
     * `order:read`) is refused, as on the store's order list (R7, #508).
     */
    async list(
        storeId: string,
        userId: string,
    ): Promise<CustomerListItemDto[]> {
        await requireOrderRead(this.stores, storeId, userId, "customers");
        await this.refuseLocationTeam(storeId, userId);
        const customers = await prisma.customer.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
            include: {
                orders: {
                    select: {
                        total: true,
                        currency: true,
                        paymentStatus: true,
                        createdAt: true,
                    },
                },
            },
        });
        return customers.map(serializeCustomerListItem);
    }

    /** One store customer, with the same rule as the list. */
    async get(storeId: string, customerId: string, userId: string) {
        await requireOrderRead(this.stores, storeId, userId, "customers");
        await this.refuseLocationTeam(storeId, userId);
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, storeId },
        });
        if (!customer) {
            throw new NotFoundException("Customer not found");
        }
        return customer;
    }

    async create(storeId: string, userId: string, dto: CreateCustomerDto) {
        const organizationId = await this.requireWrite(storeId, userId);
        try {
            const customer = await prisma.customer.create({
                data: { storeId, organizationId, ...this.fields(dto) },
            });
            if (organizationId) {
                await this.activation?.firstCustomerCreated(
                    organizationId,
                    customer.id,
                );
            }
            return { id: customer.id };
        } catch {
            throw new ConflictException({
                message: "A customer with that email already exists",
                field: "email",
            });
        }
    }

    async update(
        storeId: string,
        customerId: string,
        userId: string,
        dto: UpdateCustomerDto,
    ) {
        await this.requireWrite(storeId, userId);
        const existing = await prisma.customer.findFirst({
            where: { id: customerId, storeId },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException("Customer not found");
        }
        try {
            await prisma.customer.update({
                where: { id: customerId },
                data: this.fields(dto),
            });
            return { id: customerId };
        } catch {
            throw new ConflictException({
                message: "A customer with that email already exists",
                field: "email",
            });
        }
    }

    /**
     * Delete a customer who has never ordered. `contact:write`, as for an
     * edit; a missing id or another store's customer 404s.
     *
     * A customer with orders is refused with a 409 rather than taken apart:
     * an order is the business's record of a sale and names who bought, so
     * it is never orphaned (the schema restricts it too). Their carts go with
     * them; a product review stays, unattributed.
     */
    async remove(storeId: string, customerId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const existing = await prisma.customer.findFirst({
            where: { id: customerId, storeId },
            select: { id: true, _count: { select: { orders: true } } },
        });
        if (!existing) {
            throw new NotFoundException("Customer not found");
        }
        const orders = existing._count.orders;
        if (orders > 0) {
            throw new ConflictException({
                message: `This customer has ${orders === 1 ? "an order" : `${orders} orders`}, and an order keeps who bought it, so they stay.`,
                orders,
            });
        }
        await prisma.customer.delete({ where: { id: customerId } });
        return { id: customerId, deleted: true as const };
    }

    private fields(dto: CreateCustomerDto) {
        return {
            email: dto.email,
            firstName: dto.firstName ?? null,
            lastName: dto.lastName ?? null,
            phone: dto.phone ?? null,
            country: dto.country ?? null,
            state: dto.state ?? null,
            city: dto.city ?? null,
            zipCode: dto.zipCode ?? null,
        };
    }

    /**
     * A location's team reads its storefronts' orders, money included, to
     * take and change them (owner, 13 Nov 2026), but never the customer
     * list: their emails and what each has spent (DEC-074).
     */
    private async refuseLocationTeam(
        storeId: string,
        userId: string,
    ): Promise<void> {
        if (isLocationScoped(await this.stores.roleKeyAt(storeId, userId))) {
            throw new ForbiddenException("Your role can't see customers.");
        }
    }

    /**
     * Assert the caller may change this storefront's customers AND return
     * the owning Organization id, so every create in this service can stamp
     * `organizationId` (#173). A store they can't see is a 404; one they see
     * without `contact:write` in its business is a 403 in words
     * (`customer-access.ts`). `store:write` never decides it.
     */
    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const store = await this.stores.getForUser(storeId, userId);
        if (
            !(await this.stores.memberAllows(storeId, userId, "contact:write"))
        ) {
            throw new ForbiddenException(
                "Your role can't change customers' details.",
            );
        }
        return store.organizationId;
    }
}
