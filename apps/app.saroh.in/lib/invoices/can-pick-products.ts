import { listCataloguePage } from "@/lib/products/service";

/**
 * Whether New invoice offers "+ Pick from your products" (U14 #1126): the
 * business has a product this person can read. A business with none, a
 * role the catalogue refuses, or a read that fails offers only "+ Add a
 * line", which was always there. Server-only.
 */
export function canPickProducts(): Promise<boolean> {
    return listCataloguePage({ limit: 1 })
        .then((page) => page !== null && page.total > 0)
        .catch(() => false);
}
