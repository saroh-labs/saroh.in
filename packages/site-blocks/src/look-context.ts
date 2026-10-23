import type { LookId } from "@saroh/block-contract";
import { isLookId } from "@saroh/block-contract";

/**
 * What every block is told about the page it is drawn on (DEC-172, U4):
 * the site's look, and whether this is the owner's preview.
 *
 * A plain module, not a React context: the blocks are server components,
 * and the page that draws them already knows both, so `PageSections`
 * hands them down as props. Nothing here reads a request.
 *
 * - `look`: Folio, Quiet or Live; ABSENT is Classic, which draws exactly
 *   as it did before looks (the `classic-pin` snapshots hold that). A
 *   block picks its layout by it only where its section chose none
 *   (`resolveVariant(type, content, look)`, KD2).
 * - `isOwnerPreview`: the page is a draft shown to the business (the
 *   preview link, the editor's previews), never to a customer. Only then
 *   may a block say what is missing, such as "No photo yet" (R8). False,
 *   or absent, on every page a customer can reach.
 */
export interface LookProps {
    look?: LookId;
    isOwnerPreview?: boolean;
}

/**
 * A publication's look as the renderer takes it: a listed look, or
 * undefined (Classic) for anything else. A snapshot is JSON, so a value
 * this build does not know draws Classic rather than half a look.
 */
export function lookOf(value: unknown): LookId | undefined {
    return isLookId(value) ? value : undefined;
}

/**
 * The mark a page's root wears for its look (`data-site-look`), so a rule
 * or a block's class can tell the looks apart in CSS
 * (`[data-site-look=quiet]`). Nothing at all for Classic, whose markup is
 * unchanged.
 */
export function lookScope(look: unknown): { "data-site-look"?: LookId } {
    const id = lookOf(look);
    return id ? { "data-site-look": id } : {};
}
