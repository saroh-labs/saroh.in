import type { CrmResult } from "@/lib/api/http";
import { apiFetch, getJson, mutate, orgBase } from "@/lib/api/http";

import { allergyNotesOf } from "./attention";
import type { CourierFields } from "./courier";
import type {
    AllergyNote,
    FulfilmentType,
    KitchenStage,
    OrderAttention,
    OrderRead,
} from "./read";

/**
 * One order's kitchen flow, scoped by the active organization (ADR-008, U6):
 * the read Order Detail renders, stage moves and their Undo, edits before
 * preparing, and refunds by line.
 *
 * Separate from `service.ts`, which reads one storefront's orders by a store
 * id in the path. That read hands money to anyone who can read the store — a
 * Member — so Order Detail no longer uses it; this one leaves money out for a
 * role without a money read, in the API. Server-only.
 */

/** The order, or null when there is no such order in this business. */
export async function getOrderRead(orderId: string): Promise<OrderRead | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<OrderRead>(`${base}/orders/${encodeURIComponent(orderId)}`);
}

/**
 * The order as the Orders list's quick view reads it (B5): Order Detail's
 * read, with the customer's phone and email left out by the API for a role
 * that doesn't read contacts (`?view=quick`). Not `getJson`: the quick view
 * is one panel over the list, so a refusal or a failure is said in the panel
 * and never takes over the page.
 */
export async function readOrderQuickView(
    orderId: string,
): Promise<
    | { ok: true; order: OrderRead }
    | { ok: false; reason: "gone" | "denied" | "failed" }
> {
    const base = await orgBase();
    if (!base) return { ok: false, reason: "failed" };
    const res = await apiFetch(
        `${base}/orders/${encodeURIComponent(orderId)}?view=quick`,
    );
    if (res.status === 404) return { ok: false, reason: "gone" };
    if (res.status === 403) return { ok: false, reason: "denied" };
    if (!res.ok) return { ok: false, reason: "failed" };
    return { ok: true, order: (await res.json()) as OrderRead };
}

/**
 * The customer's allergies from their Needs attention (C1, Z2a), read from
 * the contact's detail: each Allergy entry that names an allergen, by every
 * allergen of that name in the business. Only for an order read from before
 * B15, which carries no `attention` of its own. Notes carry text only.
 *
 * `null` when it could not be read: the banner then says the allergies could
 * not be checked, rather than saying nothing, because silence reads as "no
 * allergy". Not `getJson`: a 403 there would take over the whole order page,
 * and this is one panel of it.
 */
export async function getAttentionAllergies(
    contactId: string,
): Promise<AllergyNote[] | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(
            `${base}/customers/${encodeURIComponent(contactId)}/detail`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as {
            attention?: OrderAttention | null;
        };
        return allergyNotesOf(body.attention ?? null) ?? null;
    } catch {
        // An unreachable API: the banner names the allergies as unchecked.
        return null;
    }
}

const path = (orderId: string, rest = "") =>
    `/orders/${encodeURIComponent(orderId)}${rest}`;

/**
 * A move to the next step. The handover to a courier carries who took it
 * and their number and link, all optional (B2b, B10); no other step takes
 * them.
 */
export interface MoveStageInput extends CourierFields {
    to: KitchenStage;
    note?: string;
}

export function moveOrderStage(
    orderId: string,
    input: MoveStageInput,
): Promise<CrmResult<{ eventId: string; stage: string }>> {
    return mutate(
        path(orderId, "/stage"),
        "POST",
        input,
        "The order didn't move. Try again.",
    );
}

/**
 * Fill in or correct the courier, number or link on an order handed to a
 * courier (`order:stage`). Null clears one. Each change is a step on the
 * timeline.
 */
export function saveOrderCourier(
    orderId: string,
    input: CourierFields,
): Promise<CrmResult<{ eventId: string | null }>> {
    return mutate(
        path(orderId),
        "PATCH",
        input,
        "The tracking details weren't saved. Try again.",
    );
}

/**
 * "Mark visit N attended" on a treatment's order (B14, `order:stage`): only
 * once the visit has started; the last one fulfils the order.
 */
export function markOrderVisitAttended(
    orderId: string,
    visitNumber: number,
): Promise<
    CrmResult<{
        visitNumber: number;
        attended: number;
        visits: number;
        done: boolean;
    }>
> {
    return mutate(
        path(
            orderId,
            `/visits/${encodeURIComponent(String(visitNumber))}/attended`,
        ),
        "POST",
        {},
        "The visit wasn't marked. Try again.",
    );
}

export function undoOrderStage(
    orderId: string,
    eventId: string,
): Promise<CrmResult<{ stage: string; told?: boolean }>> {
    return mutate(
        path(orderId, "/stage/undo"),
        "POST",
        { eventId },
        "That step couldn't be undone.",
    );
}

export interface EditOrderInput {
    lines?: { itemId: string; quantity: number }[];
    /** "Add an item" (B8): held at the order's own storefront. */
    add?: { productId: string; variantId?: string; quantity: number }[];
    address?: {
        line1: string;
        line2?: string | null;
        city: string;
        state: string;
        postalCode: string;
        name?: string | null;
        phone?: string | null;
    };
}

export interface EditOrderOutcome {
    differenceCents: number;
    settleCents: number;
    refund: { amountCents: number; status: string } | null;
    moneyError: string | null;
}

export function editOrderBeforePreparing(
    orderId: string,
    input: EditOrderInput,
): Promise<CrmResult<EditOrderOutcome>> {
    return mutate(
        path(orderId),
        "PATCH",
        input,
        "The order wasn't changed. Try again.",
    );
}

export interface RefundOutcome {
    amountCents: number;
    status: string;
    /** The provider hasn't said yet whether it went; the money is held. */
    beingConfirmed: boolean;
}

/**
 * Refund chosen lines — or, with none, everything still refundable. The API
 * works out the amount; `idempotencyKey` makes a retry return the first
 * refund instead of a second one. `putBack` ("Put back in stock") puts
 * units back on the shelf once the provider confirms the refund.
 *
 * `goodwill` ("Or another amount", B8) refunds that amount instead, and no
 * line: it needs a `reason`, and the API caps it at what is left.
 */
export function refundOrderLines(
    orderId: string,
    input: {
        lines: { itemId: string; quantity: number }[] | null;
        putBack?: { itemId: string; quantity: number }[];
        /** Why, as the order keeps it. */
        reason?: string | null;
        /** Another amount, as money ("49.50"). */
        goodwill?: string | null;
        idempotencyKey: string;
    },
): Promise<CrmResult<RefundOutcome>> {
    const reason = input.reason ? { reason: input.reason } : {};
    return mutate(
        path(orderId, "/refund"),
        "POST",
        input.goodwill
            ? {
                  kind: "goodwill",
                  amount: input.goodwill,
                  ...reason,
                  idempotencyKey: input.idempotencyKey,
              }
            : {
                  ...(input.lines ? { lines: input.lines } : {}),
                  ...(input.putBack?.length ? { putBack: input.putBack } : {}),
                  ...reason,
                  idempotencyKey: input.idempotencyKey,
              },
        "The refund didn't go through. Nothing was sent back.",
    );
}

/**
 * Make the order's pay link (B11) — or a new one, which stops the old one
 * working. The address comes back this once; the API keeps only its hash.
 */
export function createOrderPayLink(
    orderId: string,
): Promise<CrmResult<{ url: string; payLinkCreatedAt: string }>> {
    return mutate(
        path(orderId, "/pay-link"),
        "POST",
        {},
        "The pay link wasn't made. Try again.",
    );
}

/**
 * Try again a refund the provider hasn't answered for. The API asks the
 * provider for it first and sends it again only if the provider has none.
 */
export function retryOrderRefund(
    orderId: string,
    refundId: string,
): Promise<CrmResult<RefundOutcome>> {
    return mutate(
        path(orderId, `/refunds/${encodeURIComponent(refundId)}/retry`),
        "POST",
        {},
        "We couldn't check on the refund. Nothing was sent twice — try again in a minute.",
    );
}

export interface ChangeFulfilmentInput {
    fulfilment: FulfilmentType;
    /** The delivery charge now, as money ("40.00"). */
    shipping: string;
    address?: EditOrderInput["address"];
    /** Say so in the customer's messages. */
    tell?: boolean;
    idempotencyKey?: string;
}

export interface ChangeFulfilmentOutcome {
    differenceCents: number;
    /** Still to take (+), now due, or handed back (-). */
    settleCents: number;
    byHand: boolean;
    refund: { amountCents: number; status: string } | null;
    moneyError: string | null;
    told: boolean;
}

/**
 * "Change how it's fulfilled…" (B9): the new way and the delivery charge
 * staff typed; the API works the difference out and charges or refunds it.
 */
export function changeOrderFulfilment(
    orderId: string,
    input: ChangeFulfilmentInput,
): Promise<CrmResult<ChangeFulfilmentOutcome>> {
    return mutate(
        path(orderId, "/fulfilment"),
        "POST",
        input,
        "How it's fulfilled wasn't changed. Try again.",
    );
}

export interface CancelOutcome {
    cancelled: boolean;
    refund: {
        amountCents: number;
        currency: string;
        beingConfirmed: boolean;
        partlyRefused: boolean;
    } | null;
    byHand: { amountCents: number; currency: string } | null;
    told: boolean;
}

/**
 * "Cancel order…" (B9): a refund in full, and the order kept as cancelled.
 * `idempotencyKey` makes a retry find the refund the first one made.
 */
export function cancelOrderInFull(
    orderId: string,
    input: { reason: string | null; idempotencyKey: string; tell?: boolean },
): Promise<CrmResult<CancelOutcome>> {
    return mutate(
        path(orderId, "/cancel"),
        "POST",
        input,
        "The order wasn't cancelled. Nothing was sent back.",
    );
}
