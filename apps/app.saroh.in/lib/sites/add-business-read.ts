"use server";

import { listForms } from "@/lib/forms/service";
import { listProducts } from "@/lib/products/service";

/**
 * Rail › Add › From your business's live counts (A9, `fix/WXBAdd`):
 * "32 products", "Bridal enquiry, 1 more". Each part is null when it
 * could not be read (no access, or the API refused), so the row shows
 * without a count rather than a wrong one.
 */
export interface AddBusinessCounts {
    products: number | null;
    forms: { count: number; first: string } | null;
}

export async function readAddBusiness(): Promise<AddBusinessCounts> {
    const [products, forms] = await Promise.all([
        listProducts({ status: "PUBLISHED" }).catch(() => null),
        listForms().catch(() => null),
    ]);
    return {
        products: products ? products.length : null,
        forms:
            forms && forms.length > 0
                ? { count: forms.length, first: forms[0].name }
                : null,
    };
}
