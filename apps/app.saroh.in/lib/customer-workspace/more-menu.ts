/**
 * What Customer Detail's More menu holds, by what the viewer may do. Pure,
 * so who sees which item is tested.
 *
 * Link, "This isn't them" and Delete are drawn for every role and the menu
 * is disabled, with its reason, for one that may not edit (#384). Merge is
 * its own permission (`customer:merge`, C9) and is shown only with it
 * (C10); a role that may merge but not edit sees Merge alone.
 */

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
        /** The business sells, so store customers can be linked. */
        canLink: boolean;
        /** Their site account can be parted from them (A4). */
        canUnlink: boolean;
    },
    go: {
        merge: () => void;
        link: () => void;
        notThem: () => void;
        remove: () => void;
    },
): MoreItem[] {
    const writes = may.canWrite || !may.canMerge;
    const items: MoreItem[] = [];
    if (may.canMerge) {
        items.push({ label: "Merge with a duplicate…", go: go.merge });
    }
    if (!writes) return items;
    if (may.canLink) {
        items.push({ label: "Link a store customer…", go: go.link });
    }
    if (may.canUnlink) {
        items.push({ label: "This isn't them…", go: go.notThem });
    }
    items.push({ label: "Delete their record…", danger: true, go: go.remove });
    return items;
}
