import type { SectionType } from "@saroh/block-contract";
import {
    BLOCK_META,
    blockFamilies,
    blockHeading,
    SECTION_TYPES,
} from "@saroh/block-contract";

/**
 * `list_section_types`' catalogue (U3, KD5): one entry per family with its
 * layouts, beside the flat `types` list it always returned. A layout is
 * still added by its own type ("hours", "contact", "packs"); a family is a
 * view, never a type. Subscribe (`COMING_BLOCKS`) is not offered: it is
 * not a section type.
 */
export function sectionTypeListing() {
    const types = SECTION_TYPES.map((t) => ({
        type: t,
        label: blockHeading(t),
        description: BLOCK_META[t].description,
        variants: BLOCK_META[t].variants.map((v) => v.id),
    }));
    const byType = new Map(types.map((t) => [t.type, t]));
    const of = (t: SectionType) => {
        const entry = byType.get(t);
        if (!entry) throw new Error(`No section type ${t}`);
        return entry;
    };
    const families = blockFamilies(SECTION_TYPES).map((f) => ({
        family: f.name,
        description: BLOCK_META[f.head].description,
        layouts: f.layouts.map((l) => ({
            type: l.type,
            label: l.label,
            variants: of(l.type).variants,
        })),
    }));
    const text = [
        `${families.length} blocks (${types.length} section types). Add a layout by its type. Call again with type for one type's fields and an example.`,
        ...families.map((f) =>
            f.layouts.length === 1
                ? `- ${f.layouts[0].type} (${f.family}): ${f.description} Variants: ${f.layouts[0].variants.join(", ")}.`
                : `- ${f.family}: ${f.description} Layouts: ${f.layouts
                      .map(
                          (l) =>
                              `${l.type} (${l.label}; variants ${l.variants.join(", ")})`,
                      )
                      .join(", ")}.`,
        ),
    ].join("\n");
    return { types, families, text };
}
