"use server";

import { firstName } from "@/lib/names";

import { listReviews } from "./service";

/** A product review the merchant may put on a page (round 3, A9). */
export interface PickerReview {
    id: string;
    rating: number;
    quote: string;
    /** The customer's first name, as it goes with the quote. */
    name: string;
    productName: string;
    createdAt: string;
}

/**
 * Add › A review's product reviews (round 3, `EBReviewPicker`): only those
 * the customer agreed to show (published, not hidden) and that say
 * something, newest first. The first name and the product go with the
 * quote. Null when they can't be read (no Commerce, or the role can't).
 */
export async function readReviewsForPicker(): Promise<PickerReview[] | null> {
    const reviews = await listReviews({ status: "PUBLISHED" }).catch(
        () => null,
    );
    if (!reviews) return null;
    return reviews
        .filter((r) => r.status === "PUBLISHED" && r.body?.trim())
        .map((r) => ({
            id: r.id,
            rating: r.rating,
            quote: (r.body ?? "").trim().slice(0, 600),
            name: firstName(r.displayName) || r.displayName,
            productName: r.productName,
            createdAt: r.createdAt,
        }));
}
