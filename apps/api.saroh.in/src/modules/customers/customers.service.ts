import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StoresService } from "../stores/stores.service";
import type { CreateCustomerDto, UpdateCustomerDto } from "./dto";

/**
 * Store customers. Authorization delegates to StoresService (read = store
 * access, write = canWrite). Email is unique per store, not globally
 * (@@unique([storeId, email])).
 */
@Injectable()
export class CustomersService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        return prisma.customer.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
        });
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
        await this.requireWrite(storeId, userId);
        try {
            const customer = await prisma.customer.create({
                data: { storeId, ...this.fields(dto) },
            });
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
            firstName: dto.firstName || null,
            lastName: dto.lastName || null,
            phone: dto.phone || null,
            country: dto.country || null,
            state: dto.state || null,
            city: dto.city || null,
            zipCode: dto.zipCode || null,
        };
    }

    private async requireWrite(storeId: string, userId: string): Promise<void> {
        if (!(await this.stores.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }
    }
}
