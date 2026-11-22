import type {
    ComponentStyles,
    LookId,
    SectionType,
} from "@saroh/block-contract";
import {
    BLOCK_META,
    blockFamilies,
    COMING_BLOCKS,
    COMPONENT_KINDS,
    COMPONENT_LABELS,
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    isLookId,
    isSectionType,
    LOOK_IDS,
    LOOKS,
    pickComponentStyles,
    SECTION_TYPES,
} from "@saroh/block-contract";
import type {
    LibraryControl,
    LibraryGroup,
    LibraryLayout,
    LibraryOption,
} from "@saroh/marketing/library/types";

import type { LibraryBlockWords } from "@/content/website-library";
import {
    LIBRARY,
    LIBRARY_BLOCKS,
    LIBRARY_COLOURWAYS,
    LIBRARY_GROUPS,
} from "@/content/website-library";

/**
 * The website library's data (DEC-228, U11): its cards from the one
 * registry (`BLOCK_META` families and `COMING_BLOCKS`, R14) with this
 * site's words, its toolbar, and the preview route's reading of the same
 * address keys (`page-address.ts` keeps them).
 */

/** The preview route (`app/(library-preview)`), a merchant's bare page. */
export const PREVIEW_PATH = "/library-preview";

/** The frame widths a preview is laid out at: a laptop and a phone. */
export const FRAME_WIDTH = { desk: 1280, phone: 390 } as const;

/** The board's order: Classic, then the looks. */
const LOOK_ORDER: readonly LookId[] = (
    ["quiet", "folio", "live"] as const
).filter((id) => LOOK_IDS.includes(id));

const colourwayOption = (c: { id: string; name: string }): LibraryOption => ({
    value: c.id,
    label: c.name,
});

/** Look, colours, desk or phone: each the first option by default. */
export const LIBRARY_CONTROLS: readonly LibraryControl[] = [
    {
        key: "look",
        label: LIBRARY.toolbar.look,
        options: [
            { value: "classic", label: "Classic" },
            ...LOOK_ORDER.map((id) => ({ value: id, label: LOOKS[id].name })),
        ],
    },
    {
        key: "palette",
        label: LIBRARY.toolbar.palette,
        options: [
            colourwayOption(LIBRARY_COLOURWAYS[0]),
            ...LIBRARY_COLOURWAYS.slice(1).map(colourwayOption),
        ],
    },
    {
        key: "view",
        label: LIBRARY.toolbar.view,
        options: [
            { value: "desk", label: LIBRARY.toolbar.desk },
            { value: "phone", label: LIBRARY.toolbar.phone },
        ],
    },
];

/** One per kind of component; the default is the look's own (KD1: absent). */
export const COMPONENT_CONTROLS: readonly LibraryControl[] =
    COMPONENT_KINDS.map((kind) => {
        const labels: Record<string, string> = COMPONENT_OPTION_LABELS[kind];
        return {
            key: kind,
            label: COMPONENT_LABELS[kind],
            options: [
                { value: "", label: LIBRARY.toolbar.lookDefault },
                ...COMPONENT_STYLE_OPTIONS[kind].map((value) => ({
                    value,
                    label: labels[value] ?? value,
                })),
            ],
        };
    });

/** A family's layouts: each member's variants, a "Default" named for its member. */
function layoutsOf(family: {
    layouts: { type: SectionType; label: string }[];
}): LibraryLayout[] {
    return family.layouts.flatMap((member) =>
        BLOCK_META[member.type].variants.map((v) => ({
            type: member.type,
            variant: v.id,
            label: v.label === "Default" ? member.label : v.label,
        })),
    );
}

/** The cards, by group, in the board's order: every family head, then Coming. */
export function libraryGroups(): LibraryGroup[] {
    const families = new Map(
        blockFamilies(SECTION_TYPES).map((f) => [f.head, f]),
    );
    const words = Object.entries(LIBRARY_BLOCKS) as [
        SectionType,
        LibraryBlockWords,
    ][];
    return LIBRARY_GROUPS.map((group) => ({
        name: group,
        blocks: [
            ...words
                .filter(([, w]) => w.group === group)
                .flatMap(([head, w]) => {
                    const f = families.get(head);
                    return f
                        ? [
                              {
                                  id: f.head,
                                  name: f.name,
                                  what: w.what,
                                  linked: w.linked ?? LIBRARY.card.typed,
                                  layouts: layoutsOf(f),
                              },
                          ]
                        : [];
                }),
            ...COMING_BLOCKS.filter((b) => b.family === group).map((b) => ({
                id: b.id,
                name: b.name,
                what: b.description,
                linked: LIBRARY.card.typed,
                layouts: [],
                coming: true,
            })),
        ],
    })).filter((g) => g.blocks.length > 0);
}

/** A layout's preview address with the toolbar's choices (desk or phone is the frame's). */
export function previewSrc(
    layout: LibraryLayout,
    choice: Readonly<Record<string, string>>,
): string {
    const q = new URLSearchParams({ variant: layout.variant });
    for (const c of [...LIBRARY_CONTROLS, ...COMPONENT_CONTROLS]) {
        const value = choice[c.key];
        if (c.key !== "view" && value && value !== c.options[0].value) {
            q.set(c.key, value);
        }
    }
    return `${PREVIEW_PATH}/${layout.type}?${q.toString()}`;
}

export function frameWidth(choice: Readonly<Record<string, string>>): number {
    return choice.view === "phone" ? FRAME_WIDTH.phone : FRAME_WIDTH.desk;
}

/** What a preview draws, read from its own address; anything unknown is the default. */
export interface PreviewChoice {
    type: SectionType;
    variant: string;
    look?: LookId;
    palette: string;
    components?: ComponentStyles;
}

export function previewChoice(
    type: string,
    search: string,
): PreviewChoice | null {
    if (!isSectionType(type)) return null;
    const q = new URLSearchParams(search);
    const variants = BLOCK_META[type].variants;
    const variant = variants.find((v) => v.id === q.get("variant"));
    const look = q.get("look");
    const colourway =
        LIBRARY_COLOURWAYS.find((c) => c.id === q.get("palette")) ??
        LIBRARY_COLOURWAYS[0];
    return {
        type,
        variant: (variant ?? variants[0]).id,
        look: isLookId(look) ? look : undefined,
        palette: colourway.id,
        components: pickComponentStyles(Object.fromEntries(q)),
    };
}
