import { Body, Controller, Param, Query, Req, UseGuards } from "@nestjs/common";
import type {
    CreateProductBody,
    CreateServiceBody,
    CreateVariantBody,
    HoursView,
    PageQuery,
    PatchProductBody,
    PatchServiceBody,
    PatchVariantBody,
    ProductView,
    ServiceView,
    SetHoursBody,
    SetStockBody,
    StockView,
} from "@saroh/api-contract";
import {
    createProductBody,
    createServiceBody,
    createVariantBody,
    id,
    pageQuery,
    patchProductBody,
    patchServiceBody,
    patchVariantBody,
    setHoursBody,
    setStockBody,
    v1CreateProduct,
    v1CreateService,
    v1CreateVariant,
    v1GetHours,
    v1GetProduct,
    v1GetService,
    v1GetStock,
    v1ListPosts,
    v1ListProducts,
    v1ListServices,
    v1ListSubscriptionPlans,
    v1PatchProduct,
    v1PatchService,
    v1PatchVariant,
    v1SetHours,
    v1SetStock,
} from "@saroh/api-contract";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { KeyedRequest } from "../api-keys/api-key.guard";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { BookingsService } from "../bookings/bookings.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import { InventoryService } from "../products/inventory.service";
import { ProductsService } from "../products/products.service";
import { VariantsService } from "../products/variants.service";
import { productStatus } from "./v1-enums";
import {
    businessTimezone,
    plansPage,
    postsPage,
    productById,
    productsPage,
    serviceById,
    servicesPage,
    variantOf,
} from "./v1-reads";
import {
    ContractRoute,
    invalid,
    notFound,
    once,
    toDecimal,
} from "./v1-support";

const anId = new ZodContractPipe(id);

/**
 * Catalogue on `/v1` (plan 2026-11-10-001, U8): products, variants, prices
 * and stock; services and their hours; posts and subscription plans to
 * read. The business is the key's; every write goes through the workspace's
 * own services, so the same rules hold as in the app.
 */
@Controller("v1")
@UseGuards(ApiKeyGuard, ModuleEnforcementGuard)
export class CatalogueV1Controller {
    constructor(
        private readonly products: ProductsService,
        private readonly variants: VariantsService,
        private readonly inventory: InventoryService,
        private readonly bookings: BookingsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @ContractRoute(v1ListProducts)
    @RequireModule("COMMERCE")
    listProducts(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "store:read");
        return productsPage(ctx.organizationId, query);
    }

    @ContractRoute(v1CreateProduct)
    @RequireModule("COMMERCE")
    createProduct(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(createProductBody)) body: CreateProductBody,
    ): Promise<ProductView> {
        authorize(ctx, "store:write");
        return once(this.idempotency, req, ctx, body, async () => {
            const scope = await this.products.access.write(
                ctx,
                undefined,
                body.storefrontId,
            );
            const made = await this.products.createIn(scope, {
                name: body.name,
                price: toDecimal(body.price.amountMinor),
                currency: body.price.currency,
                ...(body.description !== undefined
                    ? { description: body.description }
                    : {}),
                ...(body.slug !== undefined ? { slug: body.slug } : {}),
                ...(body.status !== undefined
                    ? { status: productStatus.in(body.status) }
                    : {}),
            });
            return this.product(ctx, made.id);
        });
    }

    @ContractRoute(v1GetProduct)
    @RequireModule("COMMERCE")
    getProduct(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId", anId) productId: string,
    ): Promise<ProductView> {
        authorize(ctx, "store:read");
        return this.product(ctx, productId);
    }

    @ContractRoute(v1PatchProduct)
    @RequireModule("COMMERCE")
    patchProduct(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("productId", anId) productId: string,
        @Body(new ZodContractPipe(patchProductBody)) body: PatchProductBody,
    ): Promise<ProductView> {
        authorize(ctx, "store:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { productId, body },
            async () => {
                const current = await this.product(ctx, productId);
                if (
                    body.price &&
                    body.price.currency !== current.price.currency
                ) {
                    throw invalid(
                        `body.price.currency: This product is priced in ${current.price.currency}`,
                    );
                }
                const dto = {
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.price
                        ? { price: toDecimal(body.price.amountMinor) }
                        : {}),
                    ...(body.description !== undefined
                        ? { description: body.description }
                        : {}),
                    ...(body.status !== undefined
                        ? { status: productStatus.in(body.status) }
                        : {}),
                };
                await this.products.patchIn(
                    await this.products.access.edit(
                        ctx,
                        productId,
                        undefined,
                        dto,
                    ),
                    productId,
                    dto,
                );
                return this.product(ctx, productId);
            },
        );
    }

    @ContractRoute(v1CreateVariant)
    @RequireModule("COMMERCE")
    createVariant(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("productId", anId) productId: string,
        @Body(new ZodContractPipe(createVariantBody)) body: CreateVariantBody,
    ): Promise<ProductView> {
        authorize(ctx, "store:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { productId, body },
            async () => {
                const current = await this.product(ctx, productId);
                assertCurrency(body.price, current.price.currency);
                await this.variants.createIn(
                    await this.products.access.edit(ctx, productId),
                    productId,
                    {
                        sku: body.sku,
                        title: body.title,
                        price: body.price
                            ? toDecimal(body.price.amountMinor)
                            : null,
                    },
                );
                return this.product(ctx, productId);
            },
        );
    }

    @ContractRoute(v1PatchVariant)
    @RequireModule("COMMERCE")
    patchVariant(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("productId", anId) productId: string,
        @Param("variantId", anId) variantId: string,
        @Body(new ZodContractPipe(patchVariantBody)) body: PatchVariantBody,
    ): Promise<ProductView> {
        authorize(ctx, "store:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { productId, variantId, body },
            async () => {
                const current = await this.product(ctx, productId);
                assertCurrency(body.price, current.price.currency);
                const variant = await variantOf(
                    ctx.organizationId,
                    productId,
                    variantId,
                );
                if (!variant) throw notFound("variant");
                // The workspace's save is the whole variant: fill in what
                // this change leaves alone.
                const price =
                    body.price === undefined
                        ? variant.price
                        : body.price === null
                          ? null
                          : toDecimal(body.price.amountMinor);
                await this.variants.updateIn(
                    await this.products.access.edit(ctx, productId),
                    productId,
                    variantId,
                    {
                        sku: body.sku ?? variant.sku,
                        title: body.title ?? variant.title,
                        price,
                        mrp: variant.mrp,
                    },
                );
                return this.product(ctx, productId);
            },
        );
    }

    @ContractRoute(v1GetStock)
    @RequireModule("COMMERCE")
    async getStock(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId", anId) productId: string,
    ): Promise<StockView> {
        authorize(ctx, "store:read");
        return this.inventory.getIn(
            await this.products.access.read(ctx, productId),
            productId,
        );
    }

    @ContractRoute(v1SetStock)
    @RequireModule("COMMERCE")
    setStock(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("productId", anId) productId: string,
        @Body(new ZodContractPipe(setStockBody)) body: SetStockBody,
    ): Promise<StockView> {
        authorize(ctx, "inventory:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { productId, body },
            async () => {
                const scope = await this.products.access.stock(ctx, productId);
                if ("variants" in body) {
                    await this.inventory.setVariantsIn(scope, productId, body);
                } else {
                    await this.inventory.upsertIn(scope, productId, body);
                }
                return this.inventory.getIn(scope, productId);
            },
        );
    }

    @ContractRoute(v1ListServices)
    @RequireModule("APPOINTMENTS")
    listServices(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "service:read");
        return servicesPage(ctx.organizationId, query);
    }

    @ContractRoute(v1CreateService)
    @RequireModule("APPOINTMENTS")
    createService(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(createServiceBody)) body: CreateServiceBody,
    ): Promise<ServiceView> {
        authorize(ctx, "service:write");
        return once(this.idempotency, req, ctx, body, async () => {
            const { price, timezone, ...rest } = body;
            const zone =
                timezone ?? (await businessTimezone(ctx.organizationId));
            if (!zone) {
                throw invalid(
                    "body.timezone: Name the time zone by its IANA name, like Europe/London",
                );
            }
            const made = await this.bookings.createService(ctx, {
                ...rest,
                timezone: zone,
                ...(price
                    ? {
                          priceCents: price.amountMinor,
                          currency: price.currency,
                      }
                    : {}),
            });
            return this.service(ctx, made.id);
        });
    }

    @ContractRoute(v1GetService)
    @RequireModule("APPOINTMENTS")
    getService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId", anId) serviceId: string,
    ): Promise<ServiceView> {
        authorize(ctx, "service:read");
        return this.service(ctx, serviceId);
    }

    @ContractRoute(v1PatchService)
    @RequireModule("APPOINTMENTS")
    patchService(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("serviceId", anId) serviceId: string,
        @Body(new ZodContractPipe(patchServiceBody)) body: PatchServiceBody,
    ): Promise<ServiceView> {
        authorize(ctx, "service:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { serviceId, body },
            async () => {
                const { price, description, ...rest } = body;
                await this.bookings.updateService(ctx, serviceId, {
                    ...rest,
                    // Null clears it, as the app's empty box does.
                    ...(description !== undefined
                        ? { description: description ?? "" }
                        : {}),
                    ...(price
                        ? {
                              priceCents: price.amountMinor,
                              currency: price.currency,
                          }
                        : {}),
                });
                return this.service(ctx, serviceId);
            },
        );
    }

    @ContractRoute(v1GetHours)
    @RequireModule("APPOINTMENTS")
    async getHours(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId", anId) serviceId: string,
    ): Promise<HoursView> {
        authorize(ctx, "service:read");
        return hoursOf(await this.bookings.listRules(ctx, serviceId));
    }

    /** A PUT: sending the same week twice leaves the same week. */
    @ContractRoute(v1SetHours)
    @RequireModule("APPOINTMENTS")
    setHours(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("serviceId", anId) serviceId: string,
        @Body(new ZodContractPipe(setHoursBody)) body: SetHoursBody,
    ): Promise<HoursView> {
        authorize(ctx, "service:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { serviceId, body },
            async () => {
                await this.bookings.replaceRules(ctx, serviceId, body.windows);
                return hoursOf(await this.bookings.listRules(ctx, serviceId));
            },
        );
    }

    @ContractRoute(v1ListPosts)
    listPosts(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "site:read");
        return postsPage(ctx.organizationId, query);
    }

    @ContractRoute(v1ListSubscriptionPlans)
    listSubscriptionPlans(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(pageQuery)) query: PageQuery,
    ) {
        authorize(ctx, "subscription:read");
        return plansPage(ctx.organizationId, query);
    }

    private async product(ctx: OrganizationContext, productId: string) {
        const found = await productById(ctx.organizationId, productId);
        if (!found) throw notFound("product");
        return found;
    }

    private async service(ctx: OrganizationContext, serviceId: string) {
        const found = await serviceById(ctx.organizationId, serviceId);
        if (!found) throw notFound("service");
        return found;
    }
}

/** A variant is priced in its product's currency. */
function assertCurrency(
    price: { currency: string } | null | undefined,
    currency: string,
) {
    if (price && price.currency !== currency) {
        throw invalid(
            `body.price.currency: This product is priced in ${currency}`,
        );
    }
}

function hoursOf(
    rules: { dayOfWeek: number; startMinute: number; endMinute: number }[],
): HoursView {
    return {
        windows: rules.map(({ dayOfWeek, startMinute, endMinute }) => ({
            dayOfWeek,
            startMinute,
            endMinute,
        })),
    };
}
