import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";
import type {
    ApiKeyList,
    ApiKeyView,
    CreateApiKeyBody,
    CreatedApiKey,
    UpdateApiKeyBody,
} from "@saroh/api-contract";
import { createApiKeyBody, updateApiKeyBody } from "@saroh/api-contract";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ApiKeysService } from "./api-keys.service";

/**
 * Settings › API and AI apps › Keys (plan 2026-11-10-001, U5). Owner only
 * (`apikey:manage`), checked in the service. Answers are never cached: a
 * make or roll carries the token, once.
 */
@Controller("organizations/:organizationId/api-keys")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ApiKeysController {
    constructor(private readonly keys: ApiKeysService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    list(@OrgContext() ctx: OrganizationContext): Promise<ApiKeyList> {
        return this.keys.list(ctx);
    }

    @Post()
    @Header("Cache-Control", "no-store")
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body(new ZodContractPipe(createApiKeyBody)) body: CreateApiKeyBody,
    ): Promise<CreatedApiKey> {
        return this.keys.create(ctx, body);
    }

    @Patch(":keyId")
    @Header("Cache-Control", "no-store")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("keyId") keyId: string,
        @Body(new ZodContractPipe(updateApiKeyBody)) body: UpdateApiKeyBody,
    ): Promise<ApiKeyView> {
        return this.keys.update(ctx, keyId, body);
    }

    @Post(":keyId/roll")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    roll(
        @OrgContext() ctx: OrganizationContext,
        @Param("keyId") keyId: string,
    ): Promise<CreatedApiKey> {
        return this.keys.roll(ctx, keyId);
    }

    /** Stopping a key is never refused for a business that is closing. */
    @Post(":keyId/revoke")
    @LifecycleWrite("wind-down")
    @HttpCode(200)
    revoke(
        @OrgContext() ctx: OrganizationContext,
        @Param("keyId") keyId: string,
    ): Promise<ApiKeyView> {
        return this.keys.revoke(ctx, keyId);
    }
}
