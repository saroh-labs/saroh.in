import { Body, Controller, Param, Query, Req, UseGuards } from "@nestjs/common";
import type {
    CreateCustomerBody,
    CustomerView,
    PageQuery,
    PatchCustomerBody,
} from "@saroh/api-contract";
import {
    createCustomerBody,
    id,
    pageQuery,
    patchCustomerBody,
    v1CreateCustomer,
    v1GetCustomer,
    v1ListCustomers,
    v1PatchCustomer,
} from "@saroh/api-contract";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { KeyedRequest } from "../api-keys/api-key.guard";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { ContactsService } from "../contacts/contacts.service";
import { CustomerAddService } from "../customer-workspace/customer-add.service";
import { authorize } from "../organizations/organization-policy";
import { customerById, customersPage } from "./v1-reads";
import { ContractRoute, notFound, once } from "./v1-support";

const anId = new ZodContractPipe(id);

/**
 * Customers on `/v1` (plan 2026-11-10-001, U8). Answers are the fixed
 * fields of `customerView`: nothing `customer:sensitive` is ever in one,
 * even for a key an owner made.
 */
@Controller("v1")
@UseGuards(ApiKeyGuard)
export class CustomersV1Controller {
    constructor(
        private readonly adds: CustomerAddService,
        private readonly contacts: ContactsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @ContractRoute(v1ListCustomers)
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "contact:read");
        return customersPage(ctx.organizationId, query);
    }

    @ContractRoute(v1GetCustomer)
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("customerId", anId) customerId: string,
    ): Promise<CustomerView> {
        authorize(ctx, "contact:read");
        return this.customer(ctx, customerId);
    }

    /** An email another customer already has is a 409, as in the app. */
    @ContractRoute(v1CreateCustomer)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(createCustomerBody)) body: CreateCustomerBody,
    ): Promise<CustomerView> {
        authorize(ctx, "contact:write");
        return once(this.idempotency, req, ctx, body, async () => {
            const { contactId } = await this.adds.add(ctx, body);
            return this.customer(ctx, contactId);
        });
    }

    @ContractRoute(v1PatchCustomer)
    patch(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("customerId", anId) customerId: string,
        @Body(new ZodContractPipe(patchCustomerBody)) body: PatchCustomerBody,
    ): Promise<CustomerView> {
        authorize(ctx, "contact:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { customerId, body },
            async () => {
                await this.customer(ctx, customerId);
                await this.contacts.update(ctx, customerId, body);
                return this.customer(ctx, customerId);
            },
        );
    }

    private async customer(ctx: OrganizationContext, customerId: string) {
        const found = await customerById(ctx.organizationId, customerId);
        if (!found) throw notFound("customer");
        return found;
    }
}
