import {
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import { StoresService } from "../stores/stores.service";
import type { CreateCustomerDto, UpdateCustomerDto } from "./dto";
import type { CustomerListItemDto } from "./serialize";
import { serializeCustomerListItem } from "./serialize";

/**
 * Store customers. Authorization delegates to StoresService (read = store
 * access, write = canWrite). Email is unique per store, not globally
 * (@@unique([storeId, email])).
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
     */
    async list(
        storeId: string,
        userId: string,
    ): Promise<CustomerListItemDto[]> {
        await this.stores.getForUser(storeId, userId);
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

    async get(storeId: string, customerId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
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
     * Assert write access AND return the owning Organization id, so every
     * create in this service can stamp `organizationId` (#173). Returning it
     * here rather than looking it up at each call site makes the stamp hard to
     * forget: the guard you must call already hands you the value.
     */
    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) {
            throw new NotFoundException("Store not found");
        }
        return writable.organizationId;
    }
}
