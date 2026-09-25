import { BLOCK_META } from "./fixtures";
import type { SectionType } from "./section-contract";

/**
 * What a block starts with when a merchant adds it: the same example the
 * picker previewed, in the AUTHORED shape the editor saves (a button carries
 * an `action`, not an `href`).
 *
 * A block added blank is an empty box to fill in; one added with the example
 * reads like the preview the merchant just chose. The cost is example text
 * that could go live unedited, so every string here is also what the flag
 * engine looks for (`exampleTextIn`) and names in the pre-publish check.
 *
 * Deliberately NOT every block:
 * - testimonials — made-up quotes under made-up names would be fake reviews
 *   the moment they went live;
 * - contact — an invented phone number or address is worse than none;
 * - gallery — needs the merchant's own photos;
 * - enquiry, booking, servicesList — already seeded with working defaults,
 *   or read the business's live data.
 * Those start as they always have.
 */
export interface BlockExample {
    contractVersion: number;
    content: Record<string, unknown>;
    /**
     * What the merchant still has to supply before the block is complete —
     * the split hero's photo. The editor holds such a block back from saving
     * and says what is missing, exactly as for a block added blank.
     */
    awaits?: "image";
}

const hero = BLOCK_META.hero.fixtures.centered;
const features = BLOCK_META.features.fixtures;
const faq = BLOCK_META.faq.fixtures.default;

export const BLOCK_EXAMPLES: Partial<
    Record<SectionType, Record<string, BlockExample>>
> = {
    hero: {
        centered: {
            contractVersion: 2,
            content: {
                variant: "centered",
                heading: hero.heading,
                subheading: hero.subheading,
                // Home always exists, so the example button never points at
                // a page this site does not have.
                cta: {
                    label: hero.cta.label,
                    action: { kind: "url", href: "/" },
                    style: "primary",
                },
            },
        },
        split: {
            contractVersion: 2,
            content: {
                variant: "split",
                heading: hero.heading,
                subheading: hero.subheading,
                cta: {
                    label: hero.cta.label,
                    action: { kind: "url", href: "/" },
                    style: "primary",
                },
            },
            // The merchant's own photo goes here; there is no example one.
            awaits: "image",
        },
    },
    richText: {
        default: {
            contractVersion: 1,
            content: {
                variant: "default",
                format: "html",
                value: BLOCK_META.richText.fixtures.default.value,
            },
        },
    },
    cta: {
        default: {
            contractVersion: 2,
            content: {
                variant: "default",
                label: BLOCK_META.cta.fixtures.default.label,
                action: { kind: "url", href: "/" },
                style: "primary",
            },
        },
    },
    features: {
        grid: {
            contractVersion: 1,
            content: {
                variant: "grid",
                heading: features.grid.heading,
                items: features.grid.items.map((i) => ({ ...i })),
            },
        },
        list: {
            contractVersion: 1,
            content: {
                variant: "list",
                heading: features.list.heading,
                intro: features.list.intro,
                items: features.list.items.map((i) => ({ ...i })),
            },
        },
    },
    faq: {
        default: {
            contractVersion: 1,
            content: {
                variant: "default",
                heading: faq.heading,
                items: faq.items.map((i) => ({ ...i })),
            },
        },
    },
};

/** The example for a block and look, or undefined when it starts blank. */
export function blockExample(
    type: SectionType,
    variant?: string,
): BlockExample | undefined {
    const looks = BLOCK_EXAMPLES[type];
    if (!looks) return undefined;
    return (variant ? looks[variant] : undefined) ?? Object.values(looks)[0];
}

/**
 * The pieces of text in a string: the whole of plain text, or each run of
 * words between tags in HTML, so one example paragraph is found inside a
 * merchant's longer rich text.
 *
 * `<[^<>]*>`, not `<[^>]*>`: from every "<" the old form scanned on to the
 * end for a ">", quadratic on a run of "<" (CodeQL js/polynomial-redos);
 * this one stops at the next "<", so it is linear. The old form was
 * reachable, if only by a signed-in merchant: the flag engine runs this on
 * the API over a block's content, and a few strings (a hero's subheading)
 * are capped only by the 100 KB request body — 32 KB of "<" took ~350 ms,
 * 100 KB some 3 s. A site visitor never reaches it.
 */
function piecesOf(value: string): string[] {
    return value
        .split(/<[^<>]*>/)
        .map((piece) => piece.replace(/\s+/g, " ").trim())
        .filter((piece) => piece !== "");
}

/** Every string inside a value, however deep. */
function stringsIn(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
    else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach((v) => stringsIn(v, out));
    }
    return out;
}

/**
 * The example text still in a block's content, if any — for the flag engine.
 *
 * Only the example's own sentences count, and only ones long enough that
 * nobody writes them by chance: "Send" or "Default" can be the merchant's own
 * word, "Fresh bread, baked every morning" on a packaging supplier cannot.
 */
export function exampleTextIn(type: string, content: unknown): string | null {
    const looks = BLOCK_EXAMPLES[type as SectionType];
    if (!looks) return null;
    const examples = new Set(
        Object.values(looks)
            .flatMap((l) => stringsIn(l.content))
            .flatMap(piecesOf)
            .filter((piece) => piece.length >= 12),
    );
    for (const value of stringsIn(content)) {
        for (const piece of piecesOf(value)) {
            if (examples.has(piece)) return piece;
        }
    }
    return null;
}
