import type { CrmResult } from "@/lib/api/http";
import { apiFetch, getJson, mutate, orgBase } from "@/lib/api/http";

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
 * detail read (U8) — each note that names allergens, by id.
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
            notes: { rows: AllergyNote[] } | null;
        };
        if (!body.notes) return null;
        return body.notes.rows
            .filter((n) => n.allergens.length > 0)
            .map((n) => ({ body: n.body, allergens: n.allergens }));
    } catch {
        // An unreachable API: the banner names the notes as unchecked.
        return null;
    }
}

const path = (orderId: string, rest = "") =>
    `/orders/${encodeURIComponent(orderId)}${rest}`;

export function moveOrderStage(
    orderId: string,
    input: { to: KitchenStage; trackingUrl?: string; note?: string },
): Promise<CrmResult<{ eventId: string; stage: string }>> {
    return mutate(
        path(orderId, "/stage"),
        "POST",
        input,
        "The order didn't move. Try again.",
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

/**
 * Refund chosen lines — or, with none, everything still refundable. The API
 * works out the amount; `idempotencyKey` makes a retry return the first
 * refund instead of a second one.
 */
export function refundOrderLines(
    orderId: string,
    input: {
        lines: { itemId: string; quantity: number }[] | null;
        idempotencyKey: string;
    },
): Promise<CrmResult<{ amountCents: number; status: string }>> {
    return mutate(
        path(orderId, "/refund"),
        "POST",
        {
            ...(input.lines ? { lines: input.lines } : {}),
            idempotencyKey: input.idempotencyKey,
        },
        "The refund didn't go through. Nothing was sent back.",
    );
}
