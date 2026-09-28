import type { CrmResult } from "@/lib/api/http";
import { apiFetch, getJson, mutate, orgBase } from "@/lib/api/http";

import type { CourierFields } from "./courier";
import type { DetailAllergyNote } from "./lifecycle";
import { allergyNotesFrom } from "./lifecycle";
import type { AllergyNote, KitchenStage, OrderRead } from "./read";

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
 * What the customer's notes say they are allergic to, from the contact's
 * detail read (U8) — each note that names allergens, by the ids of every
 * storefront's allergen of that name.
 *
 * `null` when it could not be read: the banner then says the notes could not
 * be checked, rather than saying nothing, because silence reads as "no
 * allergy". Not `getJson`: a 403 there would take over the whole order page,
 * and this is one panel of it.
 */
export async function getAllergyNotes(
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
            notes: { rows: DetailAllergyNote[] } | null;
        };
        if (!body.notes) return null;
        return allergyNotesFrom(body.notes.rows);
    } catch {
        // An unreachable API: the banner names the notes as unchecked.
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

export function undoOrderStage(
    orderId: string,
    eventId: string,
): Promise<CrmResult<{ stage: string }>> {
    return mutate(
        path(orderId, "/stage/undo"),
        "POST",
        { eventId },
        "That step couldn't be undone.",
    );
}

export interface EditOrderInput {
    lines?: { itemId: string; quantity: number }[];
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
 * refund instead of a second one. `putBack` ("Put N back in stock") puts
 * units back on the shelf once the provider confirms the refund.
 */
export function refundOrderLines(
    orderId: string,
    input: {
        lines: { itemId: string; quantity: number }[] | null;
        putBack?: { itemId: string; quantity: number }[];
        idempotencyKey: string;
    },
): Promise<CrmResult<RefundOutcome>> {
    return mutate(
        path(orderId, "/refund"),
        "POST",
        {
            ...(input.lines ? { lines: input.lines } : {}),
            ...(input.putBack?.length ? { putBack: input.putBack } : {}),
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
