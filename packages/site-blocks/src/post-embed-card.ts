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
