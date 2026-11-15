import type { AskAiDraftKind } from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { money, when } from "../../mcp/tools/v1-bridge";
import {
    customerById,
    orderById,
    productById,
    serviceById,
} from "../../public-api/v1-reads";

/**
 * What Ask AI's drafts know about each of the business write tools
 * (plan 2026-11-13-001 U5): the record a tool touches, how it is read as
 * the card shows it, how an edit is undone through the normal tools, and
 * what would make a create a duplicate. Every read is the business's own
 * (`organizationId` from the request); nothing here writes.
 */

/** A record as a draft card shows it, read the same way before and after. */
export interface TargetState {
    name: string;
    /** The row's `updatedAt`; null for hours, which have none of their own. */
    updatedAt: string | null;
    /** Shown on the card, in the units the tool's input takes. */
    fields: Record<string, unknown>;
    /** Kept to put it back, not shown (a booking's exact start). */
    restore?: Record<string, unknown>;
    /** The money fields' currency, for their labels. */
    currency?: string | null;
}

export interface ReadContext {
    ctx: OrganizationContext;
    /** A read tool's data, run as the person; null when it refuses. */
    read(
        tool: string,
        input: Record<string, unknown>,
    ): Promise<Record<string, unknown> | null>;
}

/** The tool call that undoes an edit, or why it can't be undone here. */
export type UndoPlan =
    | { tool: string; input: Record<string, unknown> }
    | { orderStage: true }
    | { cannot: string };

export interface DraftSpec {
    kind: AskAiDraftKind;
    /** An edit's record, from its input; absent for a create. */
    targetOf?: (input: Record<string, unknown>) => string;
    /** A create's new record, from the tool's data. */
    madeOf?: (data: Record<string, unknown>) => string | undefined;
    read(r: ReadContext, id: string): Promise<TargetState | null>;
    /** Puts `before` back, changing only what the confirmed edit changed. */
    undo?: (id: string, before: TargetState, after: TargetState) => UndoPlan;
    /** A record the business already has that this create would repeat. */
    duplicate?: (
        organizationId: string,
        input: Record<string, unknown>,
    ) => Promise<{ id: string; name: string } | null>;
    /** Fields a person may fill on the card when the model left them out. */
    askable?: readonly string[];
    /** Said beside Confirm, and after Undo. */
    note?: string;
    /** Said after a confirmed create, beside "Added". */
    addedNote?: string;
    undoNote?: string;
}

const LABELS: Record<string, string> = {
    name: "Name",
    price: "Price",
    description: "Description",
    status: "Status",
    stock: "In stock",
    duration_minutes: "Length (minutes)",
    capacity: "Class size",
    hours: "Opening hours",
    service: "Service",
    when: "When",
    customer: "Customer",
    items: "Items",
    total: "Total",
    notes: "Note",
    stage: "Step",
    email: "Email",
    first_name: "First name",
    last_name: "Last name",
    phone: "Phone",
    company: "Company",
    title: "Title",
    body: "Post",
    site: "Website",
};

export function labelOf(field: string, currency?: string | null): string {
    const label = LABELS[field] ?? field;
    return field === "price" && currency ? `${label} (${currency})` : label;
}

const idOf = (key: string) => (input: Record<string, unknown>) =>
    String(input[key]);
const madeIn =
    (outer: string, key: string) => (data: Record<string, unknown>) => {
        const inner = data[outer] as Record<string, unknown> | undefined;
        const id = inner?.[key];
        return typeof id === "string" ? id : undefined;
    };
const major = (amountMinor: number) => amountMinor / 100;

/** Only the fields an edit changed, so Undo touches nothing else. */
function changed(
    before: TargetState,
    after: TargetState,
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(before.fields).filter(
            ([k, v]) => JSON.stringify(v) !== JSON.stringify(after.fields[k]),
        ),
    );
}

const nameTaken = (where: "product" | "service") =>
    async function (
        organizationId: string,
        input: Record<string, unknown>,
    ): Promise<{ id: string; name: string } | null> {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name) return null;
        const same = { equals: name, mode: "insensitive" as const };
        return where === "product"
            ? prisma.product.findFirst({
                  where: { organizationId, name: same, archivedAt: null },
                  select: { id: true, name: true },
              })
            : prisma.service.findFirst({
                  where: { organizationId, name: same, deletedAt: null },
                  select: { id: true, name: true },
              });
    };

async function readProduct(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const p = await productById(r.ctx.organizationId, id);
    if (!p) return null;
    const detail = (await r.read("get_product", { product_id: id }))
        ?.product as { stock?: number | null } | undefined;
    return {
        name: p.name,
        updatedAt: p.updatedAt,
        currency: p.price.currency,
        fields: {
            name: p.name,
            price: major(p.price.amountMinor),
            description: p.description ?? null,
            status: p.status,
            stock: detail?.stock ?? null,
        },
    };
}

async function readService(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const s = await serviceById(r.ctx.organizationId, id);
    if (!s) return null;
    return {
        name: s.name,
        updatedAt: s.updatedAt,
        currency: s.price?.currency ?? null,
        fields: {
            name: s.name,
            duration_minutes: s.durationMinutes,
            price: s.price ? major(s.price.amountMinor) : null,
            description: s.description,
            capacity: s.capacity,
        },
    };
}

async function readHours(
    r: ReadContext,
    serviceId: string,
): Promise<TargetState | null> {
    const s = await serviceById(r.ctx.organizationId, serviceId);
    if (!s) return null;
    const data = await r.read("get_hours", { service_id: serviceId });
    return {
        name: s.name,
        updatedAt: null,
        fields: { hours: data?.hours ?? [] },
    };
}

async function readBooking(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const b = await prisma.booking.findFirst({
        where: { id, organizationId: r.ctx.organizationId },
        select: {
            startAt: true,
            timezone: true,
            status: true,
            bookerName: true,
            updatedAt: true,
            service: { select: { name: true } },
        },
    });
    if (!b) return null;
    return {
        name: b.bookerName
            ? `${b.service.name}, ${b.bookerName}`
            : b.service.name,
        updatedAt: b.updatedAt.toISOString(),
        fields: {
            service: b.service.name,
            when: when(b.startAt, b.timezone),
            customer: b.bookerName,
            status: b.status.toLowerCase(),
        },
        restore: { starts_at: b.startAt.toISOString() },
    };
}

async function readOrder(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const o = await orderById(r.ctx.organizationId, id, r.ctx);
    if (!o) return null;
    const ids = o.items.flatMap((i) => (i.productId ? [i.productId] : []));
    const names = new Map(
        (
            await prisma.product.findMany({
                where: {
                    organizationId: r.ctx.organizationId,
                    id: { in: ids },
                },
                select: { id: true, name: true },
            })
        ).map((p) => [p.id, p.name]),
    );
    return {
        name: `Order ${o.number}`,
        updatedAt: o.updatedAt,
        fields: {
            items: o.items.map((i) => ({
                name: (i.productId && names.get(i.productId)) ?? "",
                quantity: i.quantity,
            })),
            total: money(o.total),
            notes: o.notes,
            stage: o.stage,
            status: o.status,
        },
    };
}

async function readCustomer(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const c = await customerById(r.ctx.organizationId, id);
    if (!c) return null;
    return {
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
        updatedAt: c.updatedAt,
        fields: {
            email: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            phone: c.phone,
            company: c.company,
        },
    };
}

/** How much of a blog post's text the card shows. */
export const POST_PREVIEW = 400;

/** A post's stored HTML as plain words, for the card. */
export function postPreview(html: string): string {
    let bare = html.replace(/<\/(p|h\d|li|blockquote)>/g, " ");
    for (let before = ""; before !== bare;) {
        before = bare;
        bare = bare.replace(/<[^>]*>/g, "");
    }
    const text = bare
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > POST_PREVIEW
        ? `${text.slice(0, POST_PREVIEW).trimEnd()}…`
        : text;
}

/** A blog post's id on a card is `<siteId>:<postId>`: its editor needs both. */
async function readBlogPost(
    r: ReadContext,
    id: string,
): Promise<TargetState | null> {
    const [siteId, postId] = id.split(":");
    if (!siteId || !postId) return null;
    const post = await prisma.post.findFirst({
        where: {
            id: postId,
            siteId,
            site: { organizationId: r.ctx.organizationId },
        },
        select: {
            title: true,
            content: true,
            updatedAt: true,
            site: { select: { name: true } },
        },
    });
    if (!post) return null;
    return {
        name: post.title,
        updatedAt: post.updatedAt.toISOString(),
        fields: {
            title: post.title,
            body: postPreview(post.content),
            site: post.site.name,
        },
    };
}

const TELLS_CUSTOMER = "The customer is told when you confirm.";

/** The business write tools Ask AI drafts (Ask AI's `draftTools`). */
export const DRAFT_SPECS: Readonly<Record<string, DraftSpec>> = {
    create_product: {
        kind: "product",
        madeOf: madeIn("product", "product_id"),
        read: readProduct,
        duplicate: nameTaken("product"),
        askable: ["name", "price"],
    },
    update_product: {
        kind: "product",
        targetOf: idOf("product_id"),
        read: readProduct,
        undo(id, before, after) {
            const back = changed(before, after);
            if (back.stock === null) {
                return { cannot: "Stock wasn't counted before" };
            }
            return {
                tool: "update_product",
                input: {
                    product_id: id,
                    ...back,
                    // An empty description is how the app clears one.
                    ...(back.description === null ? { description: "" } : {}),
                },
            };
        },
    },
    create_service: {
        kind: "service",
        madeOf: madeIn("service", "service_id"),
        read: readService,
        duplicate: nameTaken("service"),
        askable: ["name", "duration_minutes"],
    },
    update_service: {
        kind: "service",
        targetOf: idOf("service_id"),
        read: readService,
        undo(id, before, after) {
            const back = changed(before, after);
            if (back.price === null) {
                return { cannot: "It had no price before" };
            }
            return {
                tool: "update_service",
                input: {
                    service_id: id,
                    ...back,
                    ...(back.description === null ? { description: "" } : {}),
                },
            };
        },
    },
    set_hours: {
        kind: "hours",
        targetOf: idOf("service_id"),
        read: readHours,
        undo: (id, before) => ({
            tool: "set_hours",
            input: { service_id: id, hours: before.fields.hours },
        }),
    },
    create_booking: {
        kind: "booking",
        madeOf: madeIn("booking", "booking_id"),
        read: readBooking,
        note: TELLS_CUSTOMER,
    },
    move_booking: {
        kind: "booking",
        targetOf: idOf("booking_id"),
        read: readBooking,
        note: TELLS_CUSTOMER,
        undo: (id, before) => ({
            tool: "move_booking",
            input: { booking_id: id, starts_at: before.restore?.starts_at },
        }),
        undoNote:
            "They've already been told about the move. Moving it back messages them again.",
    },
    create_order: {
        kind: "order",
        madeOf: madeIn("order", "order_id"),
        read: readOrder,
    },
    update_order_status: {
        kind: "order",
        targetOf: idOf("order_id"),
        read: readOrder,
        note: "The customer may be told the order's new step.",
        undo: () => ({ orderStage: true }),
    },
    create_customer: {
        kind: "customer",
        madeOf: madeIn("customer", "customer_id"),
        read: readCustomer,
        askable: ["email"],
        duplicate: async (organizationId, input) => {
            const email =
                typeof input.email === "string" ? input.email.trim() : "";
            if (!email) return null;
            const c = await prisma.contact.findFirst({
                where: {
                    organizationId,
                    email: { equals: email, mode: "insensitive" },
                },
                select: { id: true, email: true },
            });
            return c ? { id: c.id, name: c.email } : null;
        },
    },
    update_customer: {
        kind: "customer",
        targetOf: idOf("customer_id"),
        read: readCustomer,
        undo: (id, before, after) => ({
            tool: "update_customer",
            input: { customer_id: id, ...changed(before, after) },
        }),
    },
    // Owner, 14 Nov: a draft post only; publishing stays in the editor.
    draft_blog_post: {
        kind: "blog_post",
        madeOf: (data) =>
            typeof data.site_id === "string" && typeof data.post_id === "string"
                ? `${data.site_id}:${data.post_id}`
                : undefined,
        read: readBlogPost,
        note: "It's saved as a draft; nothing is published.",
        addedNote: "It's saved as a draft; nothing is published.",
    },
};

export const DRAFT_TOOL_NAMES = Object.keys(DRAFT_SPECS);
