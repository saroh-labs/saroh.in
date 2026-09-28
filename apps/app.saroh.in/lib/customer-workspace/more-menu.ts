/**
 * What Customer Detail's More menu holds, by what the viewer may do. Pure,
 * so who sees which item is tested.
 *
 * Link, "This isn't them" and Delete are drawn for every role and the menu
 * is disabled, with its reason, for one that may not edit (#384). Merge is
 * its own permission (`customer:merge`, C9) and is shown only with it
 * (C10); so is "Remove their details (privacy request)…" (`customer:remove`,
 * C11), last, as the design has it. A role that may merge or remove but not
 * edit sees those alone.
 *
 * Delete their record (the hard delete) is for a record kept by mistake. For
 * someone with orders or invoices, a viewer who may remove is offered the
 * privacy removal instead, which keeps what the business must keep (R12).
 */

/**
 * Whether they have orders or invoices, from what this viewer's read holds;
 * undefined when neither could be read (the hard delete stays offered, and
 * the API decides).
 */
export function hasMoneyRecords(d: {
    stats: { orders?: number | null };
    invoices?: { rows: unknown[] } | null;
}): boolean | undefined {
    const orders = d.stats.orders;
    const invoices = d.invoices ? d.invoices.rows.length : undefined;
    if ((orders ?? 0) > 0 || (invoices ?? 0) > 0) return true;
    if (typeof orders === "number" && invoices !== undefined) return false;
    return undefined;
}

export interface MoreItem {
    label: string;
    danger?: boolean;
    go: () => void;
}

export function moreMenu(
    may: {
        /** `contact:write`. */
        canWrite: boolean;
        /** `customer:merge`. */
        canMerge: boolean;
        /** `customer:remove`. */
        canRemove?: boolean;
        /** The business sells, so store customers can be linked. */
        canLink: boolean;
        /** Their site account can be parted from them (A4). */
        canUnlink: boolean;
        /**
         * They have orders or invoices; undefined when that couldn't be
         * read for this viewer.
         */
        hasRecords?: boolean;
    },
    go: {
        merge: () => void;
        link: () => void;
        notThem: () => void;
        remove: () => void;
        /** Remove their details (privacy request). */
        removeDetails?: () => void;
    },
): MoreItem[] {
    const canRemove = !!may.canRemove && !!go.removeDetails;
    const writes = may.canWrite || (!may.canMerge && !canRemove);
    const items: MoreItem[] = [];
    if (may.canMerge) {
        items.push({ label: "Merge with a duplicate…", go: go.merge });
    }
    if (writes) {
        if (may.canLink) {
            items.push({ label: "Link a store customer…", go: go.link });
        }
        if (may.canUnlink) {
            items.push({ label: "This isn't them…", go: go.notThem });
        }
        if (!(canRemove && may.hasRecords === true)) {
            items.push({
                label: "Delete their record…",
                danger: true,
                go: go.remove,
            });
        }
    }
    if (canRemove && go.removeDetails) {
        items.push({
            label: "Remove their details (privacy request)…",
            danger: true,
            go: go.removeDetails,
        });
    }
    return items;
}
