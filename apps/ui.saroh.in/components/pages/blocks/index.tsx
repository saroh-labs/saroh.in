import { listBlockMeta } from "@saroh/block-contract";
import Link from "next/link";

import { PALETTES } from "@/lib/data/palettes";

import { PreviewFrame } from "./preview-frame";

/**
 * The block catalog index.
 *
 * These are the pieces a merchant's website is built from — the same components
 * `saroh.app` renders published sites with, not a reimplementation for display.
 * That is the whole reason this page is worth having: a catalog of lookalikes
 * drifts from the product and then quietly misleads the people reading it.
 */
export default function BlocksIndex() {
    const blocks = listBlockMeta();

    return (
        <div className="px-6 py-14">
            <header className="max-w-[62ch]">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Site blocks
                </p>
                <h1 className="mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.03em]">
                    What a merchant&rsquo;s website is made of.
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    Every preview below is the real component from{" "}
                    <code className="text-foreground">@saroh/site-blocks</code>,
                    rendered against the same fixture the tests use. Blocks draw
                    only from the merchant token layer, never Saroh&rsquo;s — so
                    the colours you see belong to the palette, not to this site.
                </p>
            </header>

            <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                {blocks.map(({ type, meta }) => (
                    <li key={type} className="bg-background p-6">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="text-[15.5px] font-semibold tracking-[-0.01em]">
                                <Link
                                    href={`/blocks/${type}`}
                                    className="hover:underline"
                                >
                                    {meta.label}
                                </Link>
                            </h2>
                            <span className="font-mono text-[11px] text-muted-foreground">
                                {meta.variants.length}{" "}
                                {meta.variants.length === 1 ? "look" : "looks"}
                            </span>
                        </div>
                        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                            {meta.description}
                        </p>

                        {/* One palette on the index — the comparison across
                            palettes is what the detail page is for, and three
                            frames per card would make this a scrolling wall. */}
                        <div className="mt-5 overflow-hidden rounded-lg border">
                            <PreviewFrame
                                src={`/preview/${type}?variant=${meta.variants[0].id}&palette=${PALETTES[0].id}`}
                                title={`${meta.label} — ${PALETTES[0].label}`}
                                width={1280}
                                scale={0.36}
                            />
                        </div>

                        <Link
                            href={`/blocks/${type}`}
                            className="mt-4 inline-block text-[13px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                        >
                            Every look, every palette
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
