/**
 * Stock words' colours, one map for every screen that says them — the
 * Stock screen, the product page, the Products list and its quick look —
 * so "Sold out" or "3 left" reads the same wherever the same product is
 * shown. Both designs colour them with `--danger-text` (#8F1E18, the
 * destructive 700 cut) and `--accent-text` (#91550C, Saffron 700). Only
 * plain text differs by screen, as the designs have it. Here, not in
 * `lib/`, because Tailwind scans components.
 */
export const STOCK_TEXT = {
    danger: "text-destructive-subtle-foreground",
    warn: "text-brand-subtle-foreground",
    ok: "text-success-subtle-foreground",
    muted: "text-muted-foreground",
} as const;
