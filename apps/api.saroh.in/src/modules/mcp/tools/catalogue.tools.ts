import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { HoursView, ProductView, ServiceView } from "@saroh/api-contract";
import {
    createProductBody,
    createProductTool,
    createServiceBody,
    createServiceTool,
    getHoursTool,
    getProductTool,
    listProductsTool,
    listServicesTool,
    patchProductBody,
    patchServiceBody,
    setHoursBody,
    setHoursTool,
    updateProductTool,
    updateServiceTool,
    WEEKDAYS,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { CatalogueV1Controller } from "../../public-api/catalogue.v1.controller";
import {
    productsPage,
    serviceById,
    servicesPage,
} from "../../public-api/v1-reads";
import { businessCurrency } from "../../stores/currency";
import type { McpCall, McpTool, ToolHints } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { money, PAGE, toMinor, v1Body, viaV1 } from "./v1-bridge";

/** A create: a retry with the same request_id makes nothing new. */
export const CREATE: ToolHints = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
/** A change that, sent twice, leaves the same result. */
export const UPDATE: ToolHints = { ...CREATE, idempotentHint: true };

const productLine = (p: ProductView) =>
    `${JSON.stringify(p.name)} (product_id ${p.id}): ${money(p.price)}, ${p.status}${p.variants.length ? `, ${p.variants.length} variants` : ""}`;

const productItem = (p: ProductView) => ({
    product_id: p.id,
    name: p.name,
    status: p.status,
    price: money(p.price),
    variants: p.variants.map((v) => ({
        variant_id: v.id,
        title: v.title,
        sku: v.sku,
        price: v.price ? money(v.price) : null,
    })),
});

const serviceItem = (s: ServiceView) => ({
    service_id: s.id,
    name: s.name,
    duration_minutes: s.durationMinutes,
    price: s.price ? money(s.price) : null,
    capacity: s.capacity,
    status: s.status,
    timezone: s.timezone,
});

const serviceLine = (s: ServiceView) =>
    `${JSON.stringify(s.name)} (service_id ${s.id}): ${s.durationMinutes} min, ${s.price ? money(s.price) : "no price"}${s.capacity > 1 ? `, class of ${s.capacity}` : ""}, ${s.status}`;

const more = (next: string | null) =>
    next ? `More: call again with cursor ${next}.` : "That's all.";

/** The business's currency (DEC-030), for a price given without one. */
async function currencyOf(ctx: OrganizationContext) {
    const currency = await businessCurrency(prisma, ctx.organizationId);
    if (currency) return currency;
    throw new ToolError(
        "This business has no currency set yet.",
        "Ask the person which currency, and send it as currency (like INR).",
    );
}

const toClock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
// "HH:MM", checked by the contract.
const toMinute = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** The catalogue tools; `catalogue` is U8's `/v1` handler. */
export function catalogueTools(catalogue: CatalogueV1Controller): McpTool[] {
    async function productDetail(ctx: OrganizationContext, p: ProductView) {
        const stock = await catalogue.getStock(ctx, p.id);
        return {
            ...productItem(p),
            description: p.description,
            stock: stock.tracked ? stock.quantity : null,
        };
    }

    async function hoursOf(
        ctx: OrganizationContext,
        serviceId: string,
        view: HoursView,
    ) {
        const service = await serviceById(ctx.organizationId, serviceId);
        const hours = view.windows.map((w) => ({
            day: WEEKDAYS[w.dayOfWeek] ?? "sunday",
            opens: toClock(w.startMinute),
            closes: toClock(w.endMinute),
        }));
        const name = JSON.stringify(service?.name ?? serviceId);
        const timezone = service?.timezone ?? "UTC";
        return {
            text: hours.length
                ? `${name} (service_id ${serviceId}) is open, in ${timezone}:\n${hours.map((h) => `- ${h.day} ${h.opens}–${h.closes}`).join("\n")}`
                : `${name} (service_id ${serviceId}) has no open hours, so it can't be booked.`,
            data: { service_id: serviceId, timezone, hours },
        };
    }

    return [
        defineTool({
            name: "list_products",
            title: "List products",
            description:
                'Use this when the person asks what they sell, or you need a product_id: products with price, status and variants, newest first. Example: query "cake". For one product\'s description and stock use get_product. Not for services; use list_services.',
            contract: listProductsTool,
            capability: "store:read",
            module: "COMMERCE",
            hints: READ_ONLY,
            async run(input, { ctx }: McpCall) {
                const page = await productsPage(ctx.organizationId, {
                    limit: input.limit ?? PAGE,
                    cursor: input.cursor,
                    query: input.query,
                });
                return {
                    text: [
                        `${page.data.length} products.`,
                        ...page.data.map((p) => `- ${productLine(p)}`),
                        more(page.nextCursor),
                    ].join("\n"),
                    data: {
                        products: page.data.map(productItem),
                        next_cursor: page.nextCursor,
                    },
                };
            },
        }),
        defineTool({
            name: "get_product",
            title: "Get a product",
            description:
                'Use this when the person asks about one product: its price, description, variants and units in stock. Example: "how many sourdough loaves are left?" Find the product_id with list_products first.',
            contract: getProductTool,
            capability: "store:read",
            module: "COMMERCE",
            hints: READ_ONLY,
            async run({ product_id }, { ctx }: McpCall) {
                const view = await catalogue.getProduct(ctx, product_id);
                const product = await productDetail(ctx, view);
                return {
                    text: `${productLine(view)}. Stock: ${product.stock ?? "not counted"}.`,
                    data: { product },
                };
            },
        }),
        defineTool({
            name: "create_product",
            title: "Add a product",
            description:
                'Use this when the person wants to sell something new. It starts as a draft (not on sale) unless status is published. Example: name "Sourdough loaf", price 180. Not for a size or flavour of an existing product, and not for bookable services (create_service).',
            contract: createProductTool,
            capability: "store:write",
            module: "COMMERCE",
            hints: CREATE,
            async run(input, call: McpCall) {
                const { ctx } = call;
                const body = v1Body(createProductBody, {
                    name: input.name,
                    price: {
                        amountMinor: toMinor(input.price),
                        currency: input.currency ?? (await currencyOf(ctx)),
                    },
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(input.status ? { status: input.status } : {}),
                    ...(input.storefront_id
                        ? { storefrontId: input.storefront_id }
                        : {}),
                });
                const made = await catalogue.createProduct(
                    ctx,
                    viaV1(call, "create_product", input.request_id),
                    body,
                );
                return {
                    text: `Added ${productLine(made)}.`,
                    data: { product: await productDetail(ctx, made) },
                    activity: { target: `product:${made.id}` },
                };
            },
        }),
        defineTool({
            name: "update_product",
            title: "Change a product",
            description:
                "Use this when the person changes a product's name, price, description, status (published puts it on sale, archived takes it off) or units in stock. Send only what changes. Example: product_id from list_products, price 200, stock 12. Not for a new product (create_product).",
            contract: updateProductTool,
            capability: "store:write",
            module: "COMMERCE",
            hints: UPDATE,
            async run({ product_id, stock, ...change }, call: McpCall) {
                const { ctx } = call;
                const req = viaV1(call, "update_product");
                let product: ProductView | null = null;
                if (Object.keys(change).length > 0) {
                    const current = await catalogue.getProduct(ctx, product_id);
                    product = await catalogue.patchProduct(
                        ctx,
                        req,
                        product_id,
                        v1Body(patchProductBody, {
                            ...(change.name !== undefined
                                ? { name: change.name }
                                : {}),
                            ...(change.description !== undefined
                                ? { description: change.description }
                                : {}),
                            ...(change.status ? { status: change.status } : {}),
                            ...(change.price !== undefined
                                ? {
                                      price: {
                                          amountMinor: toMinor(change.price),
                                          currency: current.price.currency,
                                      },
                                  }
                                : {}),
                        }),
                    );
                }
                if (stock !== undefined) {
                    await catalogue.setStock(ctx, req, product_id, {
                        quantity: stock,
                    });
                }
                if (!product && stock === undefined) {
                    throw new ToolError(
                        "Nothing to change.",
                        "Send at least one of name, price, description, status or stock.",
                    );
                }
                product ??= await catalogue.getProduct(ctx, product_id);
                const detail = await productDetail(ctx, product);
                return {
                    text: `Saved ${productLine(product)}. Stock: ${detail.stock ?? "not counted"}.`,
                    data: { product: detail },
                    activity: { target: `product:${product_id}` },
                };
            },
        }),
        defineTool({
            name: "list_services",
            title: "List services",
            description:
                'Use this when the person asks what can be booked, or you need a service_id: services with length, price and class size. Example: "what can people book?" Not for products sold in the shop (list_products), nor for opening hours (get_hours).',
            contract: listServicesTool,
            capability: "service:read",
            module: "APPOINTMENTS",
            hints: READ_ONLY,
            async run(input, { ctx }: McpCall) {
                const page = await servicesPage(ctx.organizationId, {
                    limit: input.limit ?? PAGE,
                    cursor: input.cursor,
                });
                return {
                    text: [
                        `${page.data.length} services.`,
                        ...page.data.map((s) => `- ${serviceLine(s)}`),
                        more(page.nextCursor),
                    ].join("\n"),
                    data: {
                        services: page.data.map(serviceItem),
                        next_cursor: page.nextCursor,
                    },
                };
            },
        }),
        defineTool({
            name: "create_service",
            title: "Add a service",
            description:
                'Use this when the person offers something new that customers book. Example: name "Haircut", duration_minutes 45, price 500. Capacity above 1 makes it a class. Then set when it can be booked with set_hours. Not for products (create_product).',
            contract: createServiceTool,
            capability: "service:write",
            module: "APPOINTMENTS",
            hints: CREATE,
            async run(input, call: McpCall) {
                const { ctx } = call;
                const made = await catalogue.createService(
                    ctx,
                    viaV1(call, "create_service", input.request_id),
                    v1Body(createServiceBody, {
                        name: input.name,
                        durationMinutes: input.duration_minutes,
                        ...(input.description !== undefined
                            ? { description: input.description }
                            : {}),
                        ...(input.capacity ? { capacity: input.capacity } : {}),
                        ...(input.price !== undefined
                            ? {
                                  price: {
                                      amountMinor: toMinor(input.price),
                                      currency: await currencyOf(ctx),
                                  },
                              }
                            : {}),
                    }),
                );
                return {
                    text: `Added ${serviceLine(made)}. It can be booked once it has hours (set_hours).`,
                    data: { service: serviceItem(made) },
                    activity: { target: `service:${made.id}` },
                };
            },
        }),
        defineTool({
            name: "update_service",
            title: "Change a service",
            description:
                "Use this when the person changes a service's name, length, price, description or class size. Send only what changes. Example: service_id from list_services, duration_minutes 60. For when it can be booked use set_hours.",
            contract: updateServiceTool,
            capability: "service:write",
            module: "APPOINTMENTS",
            hints: UPDATE,
            async run({ service_id, ...input }, call: McpCall) {
                const { ctx } = call;
                const current = await catalogue.getService(ctx, service_id);
                const saved = await catalogue.patchService(
                    ctx,
                    viaV1(call, "update_service"),
                    service_id,
                    v1Body(patchServiceBody, {
                        ...(input.name !== undefined
                            ? { name: input.name }
                            : {}),
                        ...(input.duration_minutes !== undefined
                            ? { durationMinutes: input.duration_minutes }
                            : {}),
                        ...(input.description !== undefined
                            ? { description: input.description }
                            : {}),
                        ...(input.capacity !== undefined
                            ? { capacity: input.capacity }
                            : {}),
                        ...(input.price !== undefined
                            ? {
                                  price: {
                                      amountMinor: toMinor(input.price),
                                      currency:
                                          current.price?.currency ??
                                          (await currencyOf(ctx)),
                                  },
                              }
                            : {}),
                    }),
                );
                return {
                    text: `Saved ${serviceLine(saved)}.`,
                    data: { service: serviceItem(saved) },
                    activity: { target: `service:${service_id}` },
                };
            },
        }),
        defineTool({
            name: "get_hours",
            title: "Get a service's hours",
            description:
                'Use this when the person asks when a service can be booked: its weekly hours, in its time zone. Example: "when is the yoga class on?" Not for whether a particular time is free; use find_free_slots.',
            contract: getHoursTool,
            capability: "service:read",
            module: "APPOINTMENTS",
            hints: READ_ONLY,
            async run({ service_id }, { ctx }: McpCall) {
                return hoursOf(
                    ctx,
                    service_id,
                    await catalogue.getHours(ctx, service_id),
                );
            },
        }),
        defineTool({
            name: "set_hours",
            title: "Set a service's hours",
            description:
                'Use this when the person changes when a service can be booked. It replaces the whole week, so read get_hours first and send every open day. Example: "closed Mondays" means send the week without monday. Bookings already made stay.',
            contract: setHoursTool,
            capability: "service:write",
            module: "APPOINTMENTS",
            hints: UPDATE,
            async run({ service_id, hours }, call: McpCall) {
                const { ctx } = call;
                const view = await catalogue.setHours(
                    ctx,
                    viaV1(call, "set_hours"),
                    service_id,
                    v1Body(setHoursBody, {
                        windows: hours.map((h) => ({
                            dayOfWeek: WEEKDAYS.indexOf(h.day),
                            startMinute: toMinute(h.opens),
                            endMinute: toMinute(h.closes),
                        })),
                    }),
                );
                const result = await hoursOf(ctx, service_id, view);
                return {
                    ...result,
                    text: `Saved the hours. ${result.text}`,
                    activity: { target: `service:${service_id}` },
                };
            },
        }),
    ];
}

/** Registers the catalogue tools at boot. */
@Injectable()
export class CatalogueTools implements OnModuleInit {
    constructor(
        private readonly registry: McpToolRegistry,
        private readonly catalogue: CatalogueV1Controller,
    ) {}

    onModuleInit(): void {
        this.registry.register(...catalogueTools(this.catalogue));
    }
}
