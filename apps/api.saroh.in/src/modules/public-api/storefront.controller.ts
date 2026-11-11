import {
    All,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from "@nestjs/common";
import type {
    AvailabilityQuery,
    BookBody,
    DaysQuery,
    FormSubmitBody,
    HoldBody,
    HoldTokenBody,
    MintStorefrontTokenBody,
    OrderBody,
    StorefrontTokenView,
} from "@saroh/api-contract";
import {
    availabilityQuery,
    bookBody,
    daysQuery,
    formSubmitBody,
    holdBody,
    holdTokenBody,
    mintStorefrontTokenBody,
    orderBody,
} from "@saroh/api-contract";
import type { StorefrontToken } from "@saroh/database";

import { hashClientIp, visitorAddress } from "../../common/client-ip";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { KeyedRequest } from "../api-keys/api-key.guard";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { authorize } from "../organizations/organization-policy";
import type { TokenRequest } from "./storefront-token.guard";
import { StorefrontTokenGuard } from "./storefront-token.guard";
import { StorefrontTokensService } from "./storefront-tokens.service";
import { StorefrontService } from "./storefront.service";

/**
 * What the edge and a browser may keep of a catalogue read (U17): the
 * same for every visitor, so briefly shared. Live reads (stock, slots,
 * days) are never kept: a slot that goes must stop being offered.
 */
export const CATALOGUE_CACHE = "public, max-age=30, s-maxage=30";

const visitorOf = (req: KeyedRequest) =>
    hashClientIp(visitorAddress(req, env.TRUST_PROXY));

/** The token the guard put on the request; it lets nothing through without. */
function tokenOf(req: TokenRequest): StorefrontToken {
    if (!req.storefrontToken) throw new UnauthorizedException();
    return req.storefrontToken;
}

/**
 * A visitor's writes (plan 2026-11-10-001, U7), `/v1/storefront/write/…`
 * with a storefront token. Registered before the reads, so `write` is
 * never taken for a key. Each needs `storefront:mint` on the token's
 * context (the minting key's scope ∩ its creator's live role).
 */
@Controller("v1/storefront/write")
@UseGuards(StorefrontTokenGuard)
export class StorefrontWriteController {
    constructor(private readonly storefront: StorefrontService) {}

    @Post("bookings")
    @Header("Cache-Control", "no-store")
    book(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Body(new ZodContractPipe(bookBody)) body: BookBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.book(
            ctx.organizationId,
            tokenOf(req),
            body,
            req.visitorHash,
        );
    }

    @Post("holds")
    @Header("Cache-Control", "no-store")
    hold(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Body(new ZodContractPipe(holdBody)) body: HoldBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.hold(
            ctx.organizationId,
            tokenOf(req),
            body,
            req.visitorHash,
        );
    }

    @Post("holds/release")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    release(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Body(new ZodContractPipe(holdTokenBody)) body: HoldTokenBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.release(
            ctx.organizationId,
            body.holdToken,
            req.visitorHash,
        );
    }

    @Post("payments")
    @Header("Cache-Control", "no-store")
    pay(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Body(new ZodContractPipe(holdTokenBody)) body: HoldTokenBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.pay(
            ctx.organizationId,
            body.holdToken,
            req.visitorHash,
        );
    }

    @Post("orders")
    @Header("Cache-Control", "no-store")
    order(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Body(new ZodContractPipe(orderBody)) body: OrderBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.order(
            ctx.organizationId,
            tokenOf(req),
            body,
            req.visitorHash ?? `token:${req.storefrontToken?.id ?? ""}`,
        );
    }

    @Post("forms/:formId/submissions")
    @Header("Cache-Control", "no-store")
    submit(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: TokenRequest,
        @Param("formId") formId: string,
        @Body(new ZodContractPipe(formSubmitBody)) body: FormSubmitBody,
    ) {
        authorize(ctx, "storefront:mint");
        return this.storefront.submitForm(
            ctx.organizationId,
            formId,
            body,
            req.visitorHash,
        );
    }
}

/**
 * The storefront's reads (U7), `/v1/storefront/{pk_…}/…`: what the
 * business's website already shows, with each item's hosted link. The
 * publishable key is read-only; `ApiKeyGuard` refuses any other method.
 */
@Controller("v1/storefront/:key")
@UseGuards(ApiKeyGuard)
export class StorefrontController {
    constructor(private readonly storefront: StorefrontService) {}

    @Get("products")
    @Header("Cache-Control", CATALOGUE_CACHE)
    products(@OrgContext() ctx: OrganizationContext, @Req() req: KeyedRequest) {
        authorize(ctx, "store:read");
        return this.storefront.products(ctx.organizationId, visitorOf(req));
    }

    @Get("products/:slug")
    @Header("Cache-Control", CATALOGUE_CACHE)
    product(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("slug") slug: string,
    ) {
        authorize(ctx, "store:read");
        return this.storefront.product(
            ctx.organizationId,
            slug,
            visitorOf(req),
        );
    }

    @Get("stock")
    @Header("Cache-Control", "no-store")
    stock(@OrgContext() ctx: OrganizationContext, @Req() req: KeyedRequest) {
        authorize(ctx, "store:read");
        return this.storefront.stock(ctx.organizationId, visitorOf(req));
    }

    @Get("services")
    @Header("Cache-Control", CATALOGUE_CACHE)
    services(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "service:read");
        return this.storefront.services(ctx.organizationId);
    }

    @Get("services/:serviceId/availability")
    @Header("Cache-Control", "no-store")
    availability(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Query(new ZodContractPipe(availabilityQuery)) query: AvailabilityQuery,
    ) {
        authorize(ctx, "service:read");
        return this.storefront.availability(
            ctx.organizationId,
            serviceId,
            query,
        );
    }

    @Get("services/:serviceId/days")
    @Header("Cache-Control", "no-store")
    days(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Query(new ZodContractPipe(daysQuery)) query: DaysQuery,
    ) {
        authorize(ctx, "service:read");
        return this.storefront.days(ctx.organizationId, serviceId, query);
    }

    @Get("services/:serviceId/staff")
    @Header("Cache-Control", CATALOGUE_CACHE)
    staff(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ) {
        authorize(ctx, "service:read");
        return this.storefront.staff(ctx.organizationId, serviceId);
    }

    @Get("posts")
    @Header("Cache-Control", CATALOGUE_CACHE)
    posts(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "site:read");
        return this.storefront.posts(ctx.organizationId);
    }

    @Get("posts/:slug")
    @Header("Cache-Control", CATALOGUE_CACHE)
    post(@OrgContext() ctx: OrganizationContext, @Param("slug") slug: string) {
        authorize(ctx, "site:read");
        return this.storefront.post(ctx.organizationId, slug);
    }

    @Get("plans")
    @Header("Cache-Control", CATALOGUE_CACHE)
    plans(@OrgContext() ctx: OrganizationContext, @Req() req: KeyedRequest) {
        authorize(ctx, "subscription:read");
        return this.storefront.planList(ctx.organizationId, visitorOf(req));
    }

    /**
     * Anything else under a key: `ApiKeyGuard` has refused it already when
     * it isn't a read (403); an unknown read is a 404. Last, so every
     * route above wins.
     */
    @All("*path")
    unknown(@OrgContext() ctx: OrganizationContext): never {
        authorize(ctx, "store:read");
        throw new NotFoundException();
    }
}

/**
 * `POST /v1/storefront-tokens` (U7), with a secret key holding
 * `storefront:mint`: one visitor's token, about 30 minutes, with the
 * allowed origins of the publishable key named. Given once.
 */
@Controller("v1/storefront-tokens")
@UseGuards(ApiKeyGuard)
export class StorefrontTokensController {
    constructor(private readonly tokens: StorefrontTokensService) {}

    @Post()
    @Header("Cache-Control", "no-store")
    mint(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(mintStorefrontTokenBody))
        body: MintStorefrontTokenBody,
    ): Promise<StorefrontTokenView> {
        authorize(ctx, "storefront:mint");
        return this.tokens.mint(ctx, req.apiKey?.id ?? "", body);
    }
}
