import type { Catalog } from "@saroh/pricing-catalog";
import { freeStylesOf } from "@saroh/pricing-catalog";
import {
    DEFAULT_FONT_PAIR,
    listTemplates,
    LOOK_IDS,
    LOOKS,
    PICKABLE_FONT_PAIRS,
} from "@saroh/templates";

/**
 * The looks, typefaces and colourways admin › Plans and modules can mark
 * free (DEC-177), as this build has them. Served with `GET /admin/pricing`,
 * so the console draws the ticks without carrying its own copy of the
 * templates; the catalogue keeps only ids (`freeStyles`).
 */
export interface FreeStyleChoices {
    looks: { id: string; name: string }[];
    /** Every pair Website › Style offers but the system font, always free. */
    fontPairs: { id: string; name: string }[];
    /** Every template's colourways, newest version of each template. */
    colourways: { id: string; name: string; template: string }[];
}

export function freeStyleChoices(): FreeStyleChoices {
    const templates = new Map<
        string,
        ReturnType<typeof listTemplates>[number]
    >();
    for (const t of listTemplates()) {
        const had = templates.get(t.id);
        if (!had || had.version < t.version) templates.set(t.id, t);
    }
    const colourways = new Map<
        string,
        FreeStyleChoices["colourways"][number]
    >();
    for (const t of templates.values()) {
        for (const p of t.styles ?? []) {
            const id = `${t.id}:${p.id}`;
            if (!colourways.has(id)) {
                colourways.set(id, { id, name: p.name, template: t.name });
            }
        }
    }
    return {
        looks: LOOK_IDS.map((id) => ({ id, name: LOOKS[id].name })),
        fontPairs: PICKABLE_FONT_PAIRS.filter(
            (p) => p.key !== DEFAULT_FONT_PAIR,
        ).map((p) => ({ id: p.key, name: p.name })),
        colourways: [...colourways.values()],
    };
}

/**
 * Free-list ids this build has no such look, typeface or colourway for:
 * publishing refuses them, so a typo never reads as "nothing is free".
 */
export function unknownFreeStyles(
    catalog: Pick<Catalog, "freeStyles">,
    choices: FreeStyleChoices = freeStyleChoices(),
): string[] {
    const free = freeStylesOf(catalog);
    const known = {
        looks: new Set(choices.looks.map((c) => c.id)),
        fontPairs: new Set([
            DEFAULT_FONT_PAIR,
            ...choices.fontPairs.map((c) => c.id),
        ]),
        colourways: new Set(choices.colourways.map((c) => c.id)),
    };
    return [
        ...free.looks.filter((id) => !known.looks.has(id)),
        ...free.fontPairs.filter((id) => !known.fontPairs.has(id)),
        ...free.colourways.filter((id) => !known.colourways.has(id)),
    ];
}
