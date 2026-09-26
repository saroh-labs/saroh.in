import type { BadgeProps } from "@saroh/ui/badge";

import type { ProductStatus } from "@/lib/products/service";

/**
 * The Products list's colour roles (#519), in one place so the table and
 * the quick look say a state the same way. The class strings sit here, not
 * in `lib/`, because Tailwind doesn't scan `lib/`.
 */

export const STATUS_LABEL: Record<ProductStatus, string> = {
    PUBLISHED: "Published",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
};

/** Published is success; a draft and an archived product ask nothing yet. */
export const STATUS_VARIANT: Record<
    ProductStatus,
    NonNullable<BadgeProps["variant"]>
> = {
    PUBLISHED: "success",
    DRAFT: "neutral",
    ARCHIVED: "neutral",
};

/**
 * Stock words, coloured only to reinforce them: danger text for nothing to
 * sell or short, Saffron 700 text at the warning level, plain otherwise.
 */
export const TONE_TEXT = {
    danger: "text-destructive-subtle-foreground",
    warn: "text-brand-subtle-foreground",
    plain: "text-neutral-700 dark:text-foreground",
    muted: "text-muted-foreground",
} as const;
