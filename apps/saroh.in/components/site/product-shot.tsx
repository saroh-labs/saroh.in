import Image from "next/image";

/**
 * A product screenshot that follows the site's theme.
 *
 * Both variants are rendered and swapped with CSS (`dark:hidden` /
 * `hidden dark:block`) rather than picking one in JavaScript. That is
 * deliberate: `next-themes` resolves the theme after hydration, so a
 * JS-selected image renders the wrong variant on first paint and then swaps —
 * a visible flash on the single largest element on the page. CSS resolves it
 * in the same pass that paints the rest of the theme.
 *
 * The cost is the second file over the wire. `loading="lazy"` on everything
 * below the fold keeps that off the critical path, and the hidden variant is
 * never the LCP element.
 *
 * `priority` is for the one shot above the fold only.
 */
export function ProductShot({
    name,
    alt,
    caption,
    priority = false,
}: {
    /** Base filename in /public/product — resolves to `-light` and `-dark`. */
    name: string;
    alt: string;
    caption?: string;
    priority?: boolean;
}) {
    const common = {
        alt,
        width: 2880,
        height: 1800,
        priority,
        // The frame is capped at ~1040px and the image is 2x that.
        sizes: "(max-width: 1100px) 100vw, 1040px",
        // `border-border`, not a hardcoded white at 6% — that was written when
        // the site was dark-only, and against a light screenshot on a light
        // card it drew nothing, leaving the shot bleeding into its own frame.
        className: "block w-full rounded-md border border-border",
    };

    return (
        <figure className="mt-14">
            <div className="rounded-xl border border-border bg-card p-1.5">
                <Image
                    {...common}
                    src={`/product/${name}-light.png`}
                    className={`${common.className} dark:hidden`}
                />
                <Image
                    {...common}
                    src={`/product/${name}-dark.png`}
                    className={`${common.className} hidden dark:block`}
                />
            </div>
            {caption ? (
                <figcaption className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {caption}
                </figcaption>
            ) : null}
        </figure>
    );
}
