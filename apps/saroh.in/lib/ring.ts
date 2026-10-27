/**
 * The focus ring (DESIGN.md), written once (DEC-195, C1). Width, offset,
 * colour, then the style: tailwind-merge 3 reads `outline` as a width, so the
 * style is the arbitrary outline-style property below, never `outline` (see
 * lib/cn.ts).
 *
 * The class names are spelt out whole so Tailwind finds them here
 * (tailwind.config.ts adds this file to `content`); Tailwind reads comments
 * too, so none of them is written up here.
 */
const OFFSET = {
    0: "",
    1: "focus-visible:outline-offset-1",
    2: "focus-visible:outline-offset-2",
    3: "focus-visible:outline-offset-[3px]",
    4: "focus-visible:outline-offset-4",
    inset: "focus-visible:-outline-offset-2",
} as const;

const COLOR = {
    /** Saffron 500 on paper, the default. */
    brand: "focus-visible:outline-brand-500",
    /** Ink. */
    ink: "focus-visible:outline-foreground",
    /** Paper, on an Ink surface. */
    paper: "focus-visible:outline-background",
    /** The band's Saffron, on Ink. */
    saffron: "focus-visible:outline-mk-saffron",
} as const;

export function ring({
    offset = 2,
    color = "brand",
}: { offset?: keyof typeof OFFSET; color?: keyof typeof COLOR } = {}) {
    return [
        "focus-visible:outline-2",
        OFFSET[offset],
        COLOR[color],
        "focus-visible:[outline-style:solid]",
    ]
        .filter(Boolean)
        .join(" ");
}
