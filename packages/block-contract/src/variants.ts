import { BLOCK_META } from "./fixtures";
import type { SectionType } from "./section-contract";

export {
    variantRequirements,
    type VariantRequirement,
} from "./section-contract";

/**
 * Which look a block wears, and how content that predates looks resolves (#254).
 *
 * A variant is the ONE field answering "which look". It may change what a field
 * REQUIRES — `hero/split` needs an image — but never which fields exist. That
 * asymmetry is deliberate: the rendered shape stays loose so a renderer meeting
 * a variant name it has never heard of is still handed content it can draw. If
 * the field set varied per variant, an unknown variant would leave the renderer
 * with content it cannot interpret, and the graceful degradation
 * `SectionRenderer` is built around would stop being possible.
 *
 * #257 found the same conclusion from outside: every comparable product's
 * conditional-field mechanism — Shopify `visible_if`, Builder `showIf`, Framer
 * `hidden`, Webflow switch props — is EDITOR-only. None changes the stored
 * schema. An editor may hide a field a variant ignores; that is presentation.
 */

/**
 * The look a block falls back to.
 *
 * The FIRST entry in its `variants` tuple, which the non-empty tuple type
 * guarantees exists. A block author picks the default by ordering rather than
 * by a second field — and the ordering carries a rule: **the first variant must
 * be the least demanding one**, because it is what an unrecognised variant
 * lands on, and landing on a look that needs content the section may not have
 * is not a fallback.
 */
export function defaultVariant(type: SectionType): string {
    return BLOCK_META[type].variants[0].id;
}

/** Whether `id` is a look this build knows about for `type`. */
export function isKnownVariant(type: SectionType, id: string): boolean {
    return BLOCK_META[type].variants.some((v) => v.id === id);
}

/**
 * How a block resolves content that names no variant.
 *
 * Every section written before #254, and every publication ever made, has no
 * `variant`. ABSENT therefore does not mean "the default" — it means "decide
 * from what is there", and only the block knows how.
 *
 * Declared per block for the same reason `toRendered` and `sanitizedFields` are:
 * the block declares, the pipeline acts. Sniffing would put the knowledge in the
 * pipeline, where the next block's shape breaks it.
 */
type LegacyResolver = (content: unknown) => string;

const field = (content: unknown, key: string): unknown =>
    content !== null && typeof content === "object"
        ? (content as Record<string, unknown>)[key]
        : undefined;

/**
 * Hero's rule is the one that had to be written down.
 *
 * `HeroSection` has always chosen its layout with `Boolean(content.image?.src)`
 * — a real choice that was invisible in the editor, unnameable in a template
 * manifest and unshowable in a catalog. Naming it changes nothing about what
 * ships, which is the point.
 *
 * IT IS ALSO WHY THE DEFAULT IS NOT ENOUGH. `centered` is hero's first declared
 * variant, so resolving absent content to the default would have flipped every
 * published hero CARRYING AN IMAGE from two-column to centred — a visible
 * change to live merchant pages, which is what gate G5 exists to prevent.
 */
const heroLegacy: LegacyResolver = (content) => {
    const image = field(content, "image");
    const src = field(image, "src");
    return typeof src === "string" && src.trim() !== "" ? "split" : "centered";
};

/**
 * Gallery's rule reads the v1 field that v2 replaced.
 *
 * A `gallery@1` section carries `layout: grid|carousel|masonry` and no variant.
 * Those ARE the v2 variant ids — that is the whole reason v2 folded one into the
 * other — so a v1 gallery resolves to the look it already had.
 */
const galleryLegacy: LegacyResolver = (content) => {
    const layout = field(content, "layout");
    return typeof layout === "string" && isKnownVariant("gallery", layout)
        ? layout
        : "grid";
};

/**
 * `Record<SectionType, …>` is the gate (G3): a block type added to
 * `SECTION_TYPES` without a rule for its own legacy content does not compile.
 */
const LEGACY_RESOLVERS = {
    hero: heroLegacy,
    gallery: galleryLegacy,
    // Nothing to read: these blocks have one look, so content that names none
    // was already wearing it. Stated rather than defaulted.
    richText: () => defaultVariant("richText"),
    cta: () => defaultVariant("cta"),
    enquiry: () => defaultVariant("enquiry"),
    booking: () => defaultVariant("booking"),
} satisfies Record<SectionType, LegacyResolver>;

/**
 * The look a section actually wears, for any content of any age.
 *
 * Three cases, in order:
 *   - names a look this build knows → that one;
 *   - names one it does not → the block's default, NEVER nothing. A merchant's
 *     live hero blanking because a later deployment added a look they do not use
 *     is worse than the same hero in a different arrangement;
 *   - names none → the block's declared legacy rule.
 */
export function resolveVariant(type: SectionType, content: unknown): string {
    const named = field(content, "variant");
    if (typeof named === "string" && named.trim() !== "") {
        return isKnownVariant(type, named) ? named : defaultVariant(type);
    }
    return LEGACY_RESOLVERS[type](content);
}
