import type { SectionType } from "@saroh/block-contract";
import {
    BLOCK_META,
    blockFixture,
    getSectionContract,
    parseRenderedContent,
} from "@saroh/block-contract";
import Link from "next/link";

import { PALETTES, PREVIEW_WIDTHS } from "@/lib/data/palettes";

import { PreviewFrame } from "./preview-frame";

/**
 * One block: every look, every palette, both widths, and the content that
 * produced them.
 *
 * The palettes side by side are the argument. A merchant's site must never
 * inherit Saroh's brand, and the only convincing way to show that a block obeys
 * that is to change the palette and change nothing else.
 */
export default function BlockDetail({ type }: { type: SectionType }) {
    const meta = BLOCK_META[type];

    return (
        <div className="px-6 py-14">
            <header className="max-w-[62ch]">
                <Link
                    href="/blocks"
                    className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
                >
                    ← Site blocks
                </Link>
                <h1 className="mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.03em]">
                    {meta.label}
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {meta.description}
                </p>
                <p className="mt-3 font-mono text-[12px] text-muted-foreground/70">
                    section type <span className="text-foreground">{type}</span>
                    {" · "}
                    contract v{latestVersionOf(type)}
                </p>
            </header>

            {meta.variants.map((variant) => {
                const content = blockFixture(type, variant.id);
                const check = parseRenderedContent(type, content);

                return (
                    <section key={variant.id} className="mt-16">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b pb-3">
                            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
                                {variant.label}
                            </h2>
                            <code className="text-[12px] text-muted-foreground">
                                variant: &quot;{variant.id}&quot;
                            </code>
                        </div>
                        <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
                            {variant.description}
                        </p>

                        {/* Gate G4 has already parsed every fixture in CI. It is
                            repeated on the page because a catalog quietly
                            showing a broken example is the failure this whole
                            surface would otherwise introduce — and unlike a test
                            run, this is visible to whoever is looking at it. */}
                        {!check.success ? (
                            <p
                                role="alert"
                                className="mt-4 rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground"
                            >
                                This fixture does not match the block&rsquo;s
                                rendered schema, so the preview below cannot be
                                trusted.
                            </p>
                        ) : null}

                        {PREVIEW_WIDTHS.map((width) => (
                            <div key={width.id} className="mt-8">
                                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                    {width.label} · {width.px}px
                                </p>
                                <div className="mt-3 flex flex-wrap gap-6">
                                    {PALETTES.map((palette) => (
                                        <figure key={palette.id}>
                                            <div className="overflow-hidden rounded-lg border">
                                                <PreviewFrame
                                                    src={`/preview/${type}?variant=${variant.id}&palette=${palette.id}`}
                                                    title={`${meta.label}, ${variant.label}, ${palette.label}, ${width.label}`}
                                                    width={width.px}
                                                    scale={
                                                        width.px > 640
                                                            ? 0.42
                                                            : 1
                                                    }
                                                />
                                            </div>
                                            <figcaption className="mt-2 text-[12px] text-muted-foreground">
                                                <span className="font-medium text-foreground">
                                                    {palette.label}
                                                </span>{" "}
                                                — {palette.note}
                                            </figcaption>
                                        </figure>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <details className="mt-8">
                            <summary className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">
                                The content that produced this
                            </summary>
                            <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-4 text-[12px] leading-relaxed">
                                <code>{JSON.stringify(content, null, 2)}</code>
                            </pre>
                            <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
                                This is the <strong>rendered</strong> shape —
                                what a publication snapshot carries and a
                                component draws. A button here has an{" "}
                                <code>href</code>; the editor writes an{" "}
                                <code>action</code>, and publish resolves it.
                            </p>
                        </details>
                    </section>
                );
            })}
        </div>
    );
}

/**
 * The newest contract version registered for a block.
 *
 * Shown because a block's authoring shape is versioned and its rendered shape
 * is not — `hero@1` and `hero@2` differ in how a button is written, and publish
 * resolves both to the same `href`. Someone reading this page should be able to
 * see which contract they would be authoring against.
 */
function latestVersionOf(type: SectionType): number {
    let version = 1;
    while (getSectionContract(type, version + 1)) version += 1;
    return version;
}
