import { env } from "@/env";

import type { ReviewGoneReason, ReviewInvitation } from "./reviews-shape";
import { goneReason, isReviewInvitation } from "./reviews-shape";

export type { ReviewInvitation, ReviewLine } from "./reviews-shape";

/**
 * Server-side only. The review page reads and posts server-to-server — the
 * preview pages' pattern — because a browser on a tenant host cannot reach
 * the API (CORS), and locally the browser's API base points at production.
 */
const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

export type ReviewLookup =
    | { ok: true; invitation: ReviewInvitation }
    | { ok: false; reason: ReviewGoneReason | "missing" | "unavailable" };

export async function getReviewInvitation(
    token: string,
): Promise<ReviewLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/product-reviews/${encodeURIComponent(token)}`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
        return isReviewInvitation(body)
            ? { ok: true, invitation: body }
            : { ok: false, reason: "unavailable" };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (res.status === 410) {
        return { ok: false, reason: goneReason(body) ?? "expired" };
    }
    return { ok: false, reason: "unavailable" };
}

export interface ReviewInput {
    orderItemId: string;
    rating: number;
    body?: string;
    displayName: string;
}

export type PostResult =
    { ok: true; completed: boolean } | { ok: false; message: string };

/**
 * Post one line's review. The page's own sentences, never the API's text —
 * the API's messages are written for the merchant (checkout's rule).
 */
export async function postReview(
    token: string,
    input: ReviewInput,
): Promise<PostResult> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/product-reviews/${encodeURIComponent(token)}/reviews`,
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                },
                body: JSON.stringify(input),
            },
        );
    } catch {
        return {
            ok: false,
            message: "We couldn't reach the shop. Try again in a moment.",
        };
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
        const completed =
            typeof body === "object" && body !== null && "completed" in body
                ? Boolean(body.completed)
                : false;
        return { ok: true, completed };
    }
    switch (res.status) {
        case 400:
            return {
                ok: false,
                message: "Check the stars and your name, then post again.",
            };
        case 409:
            return {
                ok: false,
                message: "You've already reviewed this one — thank you.",
            };
        case 410:
        case 404:
            return { ok: false, message: "This link no longer takes reviews." };
        case 429:
            return {
                ok: false,
                message: "That's a lot at once. Wait a minute and try again.",
            };
        default:
            return {
                ok: false,
                message: "Something went wrong on our side. Try again.",
            };
    }
}
