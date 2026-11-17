import type { ProductStatus } from "./service";

/**
 * A product's status in one word, said the same on every product screen:
 * the list's pill and status filter, the product page's header and
 * details, the editor's Visibility, the collections picker and the
 * import's review. One place, so the word for a product that is no longer
 * sold ("Archived" today; the owner may test "Hidden", 16 Nov) changes
 * once. Not for website posts' or modules' "Archived", which mean other
 * things. `lib/products/status-word.test.ts` keeps the screens on it.
 */
export const PRODUCT_STATUS_WORD: Record<ProductStatus, string> = {
    PUBLISHED: "Live",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
};
