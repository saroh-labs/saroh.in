import type { CtaAction, SectionType } from "./section-contract";
import { ctaHref } from "./section-contract";

/**
 * Draft → rendered mapping, declared per block (#252).
 *
 * WHAT THIS REPLACES. `resolveCtaHrefs` in
 * `apps/api.saroh.in/src/modules/sites/pending-changes.ts` did this job by
 * SNIFFING the content it was handed:
 *
 *     if ("action" in c) return withHref(c);          // a cta section
 *     if ("cta" in c)    return { ...c, cta: … };     // a hero
 *     return content;                                  // everything else
 *
 * Which is correct for exactly the two shapes that existed when it was written.
 * A block nesting a button anywhere else — `buttons: [...]`, a pricing tier's
 * call to action — falls through the third branch and publishes a button with
 * no href: a label that looks like a link, does nothing, and reports nothing.
 * Fine at six blocks; a bug generator at twenty.
 *
 * So a block now DECLARES how its own draft becomes rendered content, and the
 * pipeline acts on the declaration. `sanitizedFields` is the precedent for
 * exactly this shape.
 *
 * REQUIRED EVEN WHEN IT IS IDENTITY. There is no default. A block author who
 * has not thought about resolution gets a type error rather than a silent pass,
 * which is the whole difference between a rule and a suggestion. Write
 * `identity` and mean it.
 *
 * RUNS IN TWO PLACES, AND THEY MUST AGREE. Server-side at publish (and in the
 * pending-changes diff, so the count is a diff over the same bytes publish
 * writes), and client-side in the site editor so its preview can draw with the
 * same components the live site uses. Those two agreeing is what gate G7
 * asserts; #189 is what their disagreeing looked like in production.
 */

/**
 * What resolution needs from the site around the block.
 *
 * `resolvePage` is a map of page id → path over the pages that will actually be
 * in the snapshot. A page that is hidden or gone resolves to `undefined`, and
 * the button renders as a label rather than a broken link.
 *
 * The editor builds this from the pages it already holds; publish builds it
 * from the pages it is about to write.
 */
export interface RenderContext {
    resolvePage: (pageId: string) => string | undefined;
}

/** How one block turns its authored content into what a component draws. */
export type ToRendered = (draft: unknown, ctx: RenderContext) => unknown;

/**
 * For a block whose authored content is already what a component draws.
 *
 * Explicit rather than defaulted, on purpose — see the module note.
 */
export const identity: ToRendered = (draft) => draft;

/**
 * Add the resolved `href` to one button.
 *
 * The full `action` stays beside it, exactly as publish has always written it,
 * so a later reader can still tell a call from a link. The rendered SCHEMA
 * narrows `action` to its `kind` when it parses, because that is all a
 * component may read — but this function must keep writing what publish writes,
 * or the snapshot bytes would change and G5 would (correctly) fail.
 */
function withHref(cta: unknown, ctx: RenderContext): unknown {
    if (cta === null || typeof cta !== "object") return cta;
    const action = (cta as { action?: unknown }).action;
    if (!action || typeof action !== "object") return cta;
    return {
        ...(cta as Record<string, unknown>),
        href: ctaHref(action as CtaAction, ctx.resolvePage),
    };
}

/** A block that carries one button under `cta`. */
const resolvesNestedCta: ToRendered = (draft, ctx) => {
    if (draft === null || typeof draft !== "object") return draft;
    const content = draft as Record<string, unknown>;
    if (!("cta" in content)) return draft;
    return { ...content, cta: withHref(content.cta, ctx) };
};

/** A block that IS a button. */
const resolvesOwnCta: ToRendered = (draft, ctx) => withHref(draft, ctx);

/**
 * Every block's mapping.
 *
 * `Record<SectionType, ToRendered>` is the gate (G3): a type added to
 * `SECTION_TYPES` without a mapping does not compile.
 */
export const TO_RENDERED = {
    hero: resolvesNestedCta,
    cta: resolvesOwnCta,
    // Authored content is already what the component draws. Stated, not assumed.
    richText: identity,
    gallery: identity,
    enquiry: identity,
    booking: identity,
} satisfies Record<SectionType, ToRendered>;

/**
 * Resolve one section's authored content into what a component draws.
 *
 * An unknown type returns its input untouched — the same forward-compatible
 * degradation the renderer applies to a section type it does not know, rather
 * than throwing on content from a newer contract.
 */
export function toRendered(
    type: string,
    draft: unknown,
    ctx: RenderContext,
): unknown {
    const map = (TO_RENDERED as Record<string, ToRendered | undefined>)[type];
    return map ? map(draft, ctx) : draft;
}
