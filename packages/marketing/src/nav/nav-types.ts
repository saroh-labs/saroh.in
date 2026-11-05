/** A site's menus, as its server hands them to the nav. */
export interface NavItem {
    name: string;
    /** Under the name in a menu; empty where the name says it all. */
    line: string;
    href: string;
    /** Its column's heading in a desk menu; the other menus and lists ignore it. */
    group?: string;
    /** The footer's small "new" tag beside it. */
    isNew?: boolean;
}

/** A plain link in a menu: its "see all" or the quieter ones beside it. */
export interface MenuLink {
    name: string;
    href: string;
}

export type NavSection =
    | "features"
    | "solutions"
    | "pricing"
    | "resources"
    | "tools"
    | "templates"
    | null;

/**
 * Items in columns: one per `group` where they have them, else `flat` columns
 * filled top to bottom. The phone sheet's one list uses the same headings.
 */
export function menuColumns(items: readonly NavItem[], flat: number) {
    if (items.some((i) => i.group)) {
        const groups = new Map<string, NavItem[]>();
        for (const item of items) {
            const group = item.group ?? "More";
            groups.set(group, [...(groups.get(group) ?? []), item]);
        }
        return [...groups].map(([heading, inIt]) => ({ heading, items: inIt }));
    }
    const size = Math.ceil(items.length / flat);
    return Array.from({ length: flat }, (_, i) => ({
        heading: undefined,
        items: items.slice(i * size, (i + 1) * size),
    })).filter((c) => c.items.length > 0);
}
