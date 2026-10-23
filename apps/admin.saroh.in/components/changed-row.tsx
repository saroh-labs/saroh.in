import type { ComponentPropsWithoutRef, ElementType } from "react";

/**
 * The attributes that draw a changed row's highlight (`globals.css`,
 * `--just-changed`), for a row drawn by another component (`TableRow`).
 * `on` is `useChangeFeedback`'s `isHighlighted(id)` or `keep(...)`'s
 * `highlighted(id)`.
 */
export function changedRowProps(on: boolean) {
    return {
        "data-changed-row": "",
        "data-just-changed": on ? "" : undefined,
    } as const;
}

type ChangedRowProps<As extends ElementType> = {
    /** The element the row is: a `tr` in a table, `li` in a list. */
    as?: As;
    /** Whether the row is inside its highlight. */
    changed: boolean;
} & Omit<ComponentPropsWithoutRef<As>, "as" | "changed">;

/**
 * A row a live write can change (R9). While `changed`, it wears the
 * just-changed ground; the colour comes and goes on the token's own
 * transition, so no screen times or tints it itself.
 */
export function ChangedRow<As extends ElementType = "div">({
    as,
    changed,
    ...props
}: ChangedRowProps<As>) {
    const Row: ElementType = as ?? "div";
    return <Row {...props} {...changedRowProps(changed)} />;
}
