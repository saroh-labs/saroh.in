import { Controller, Param, Query, UseGuards } from "@nestjs/common";
import type {
    EnquiryView,
    ListFormEntriesQuery,
    PageQuery,
} from "@saroh/api-contract";
import {
    id,
    listFormEntriesQuery,
    pageQuery,
    v1GetEnquiry,
    v1ListEnquiries,
    v1ListFormEntries,
} from "@saroh/api-contract";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { authorize } from "../organizations/organization-policy";
import { enquiriesPage, enquiryById, formEntriesPage } from "./v1-reads";
import { ContractRoute, notFound } from "./v1-support";

/** Enquiries and form entries on `/v1` (plan 2026-11-10-001, U8): read only. */
@Controller("v1")
@UseGuards(ApiKeyGuard)
export class EnquiriesV1Controller {
    @ContractRoute(v1ListEnquiries)
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "lead:read");
        return enquiriesPage(ctx.organizationId, query);
    }

    @ContractRoute(v1GetEnquiry)
    async get(
        @OrgContext() ctx: OrganizationContext,
        @Param("enquiryId", new ZodContractPipe(id)) enquiryId: string,
    ): Promise<EnquiryView> {
        authorize(ctx, "lead:read");
        const found = await enquiryById(ctx.organizationId, enquiryId);
        if (!found) throw notFound("enquiry");
        return found;
    }

    @ContractRoute(v1ListFormEntries)
    formEntries(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(listFormEntriesQuery))
        query: ListFormEntriesQuery,
    ) {
        authorize(ctx, "form:read");
        return formEntriesPage(ctx.organizationId, query);
    }
}
