/**
 * A post's card from the business (U15b), in the site's own look: one set
 * of classes for the live page (saroh.app's `post-embeds.ts`, an HTML
 * string) and the writer's preview in the editor (`embed-card.tsx`), so the
 * two cannot drift (G6, #252).
 */
export const POST_EMBED_CARD = {
    card: "not-prose my-6 flex min-w-0 items-center gap-4 rounded-[calc(var(--site-radius)*1.4)] border border-site-border bg-site-surface p-4 text-site-fg",
    name: "m-0 font-site-heading text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight [overflow-wrap:anywhere]",
    line: "m-0 mt-1 text-sm tabular-nums text-site-body",
    button: "coarse:h-11 inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg no-underline hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg",
    image: "m-0 size-16 shrink-0 rounded-[var(--site-radius)] object-cover",
    /** The editor's stand-in where the live card has its picture. */
    tile: "grid size-12 shrink-0 place-items-center rounded-[var(--site-radius)] bg-site-fg/5 text-site-muted",
} as const;

/**
 * The post body's own blocks (W2): a highlight box (`div[data-box=note]`),
 * a gallery (`div[data-gallery]` of photos), a button (`p[data-button] > a`)
 * and the contents list (`[data-contents]`). Classes on the body, not on the
 * stored HTML, so the post stores only the shape the sanitizer keeps; the
 * live page and the editor wear the same set.
 */
export const POST_BODY_BLOCKS = [
    "[&_[data-box=note]]:my-6 [&_[data-box=note]]:rounded-[calc(var(--site-radius)*1.4)] [&_[data-box=note]]:border-l-4 [&_[data-box=note]]:border-site-accent [&_[data-box=note]]:bg-site-surface [&_[data-box=note]]:px-5 [&_[data-box=note]]:py-1",
    "[&_[data-gallery]]:my-6 [&_[data-gallery]]:grid [&_[data-gallery]]:grid-cols-2 [&_[data-gallery]]:gap-2 sm:[&_[data-gallery]]:grid-cols-3 [&_[data-gallery]_img]:m-0 [&_[data-gallery]_img]:aspect-square [&_[data-gallery]_img]:w-full [&_[data-gallery]_img]:rounded-[var(--site-radius)] [&_[data-gallery]_img]:object-cover",
    "[&_[data-button]]:my-6 [&_[data-button]>a]:inline-flex [&_[data-button]>a]:min-h-11 [&_[data-button]>a]:items-center [&_[data-button]>a]:rounded-[var(--site-radius)] [&_[data-button]>a]:bg-site-accent [&_[data-button]>a]:px-5 [&_[data-button]>a]:font-bold [&_[data-button]>a]:text-site-accent-fg [&_[data-button]>a]:no-underline [&_[data-button]>a:hover]:opacity-90",
    "[&_[data-contents]]:my-6 [&_[data-contents]]:rounded-[calc(var(--site-radius)*1.4)] [&_[data-contents]]:border [&_[data-contents]]:border-site-border [&_[data-contents]]:p-4",
].join(" ");
