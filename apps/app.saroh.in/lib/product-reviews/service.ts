import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";

/**
 * Product reviews — read and written through the org-nested
 * `/organizations/:id/product-reviews` routes. Server-only.
 */

export interface Review {
    id: string;
    rating: number;
    body: string | null;
    displayName: string;
    productId: string | null;
    productName: string;
    storeId: string;
    invitedTo: string;
    status: "PUBLISHED" | "HIDDEN";
    reply: string | null;
    repliedAt: string | null;
    createdAt: string;
}

export interface ProductRating {
    productId: string;
    average: number;
    count: number;
}

export interface InvitableOrder {
    id: string;
    orderNumber: string;
    storeId: string;
    storeName: string;
    customerName: string | null;
    customerEmail: string;
    placedAt: string;
    itemCount: number;
}

export type InviteResult =
    | { orderId: string; status: "sent"; note?: "consent-not-checked" }
    | { orderId: string; status: "skipped"; reason: string; message: string };

export interface InvitationState {
    state: "none" | "sent" | "completed" | "expired";
    sentAt: string | null;
    sendCount: number;
    reviewed: number;
    lines: number;
    blocked: { reason: string; message: string } | null;
}

export async function listReviews(): Promise<Review[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Review[]>(`${base}/product-reviews`)) ?? [];
}

export async function reviewSummary(): Promise<ProductRating[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<ProductRating[]>(`${base}/product-reviews/summary`)) ??
        []
    );
}

export async function invitableOrders(): Promise<InvitableOrder[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<InvitableOrder[]>(
            `${base}/product-reviews/invitable-orders`,
        )) ?? []
    );
}

export async function invitationState(
    orderId: string,
): Promise<InvitationState | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<InvitationState>(
        `${base}/product-reviews/orders/${encodeURIComponent(orderId)}`,
    );
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}/product-reviews${path}`, {
        method,
        body: JSON.stringify(body ?? {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return toFailure(data, fallback);
}

export function inviteReviews(orderIds: string[]) {
    return send<InviteResult[]>(
        "/invitations",
        "POST",
        { orderIds },
        "Could not send the invitations.",
    );
}

export function replyToReview(id: string, reply: string) {
    return send<Review>(
        `/${encodeURIComponent(id)}/reply`,
        "PATCH",
        { reply },
        "Could not save the reply.",
    );
}

export function setReviewHidden(id: string, hidden: boolean) {
    return send<Review>(
        `/${encodeURIComponent(id)}/${hidden ? "hide" : "unhide"}`,
        "POST",
        {},
        hidden ? "Could not hide the review." : "Could not show the review.",
    );
}
