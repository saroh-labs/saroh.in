import { BLOCK_META, blockFixture, isSectionType } from "@saroh/block-contract";
import { SectionRenderer, SiteTheme } from "@saroh/site-blocks";
import { notFound } from "next/navigation";

import { paletteById } from "@/lib/data/palettes";

/**
 * ONE block, in ONE merchant palette, with nothing else on the page.
 *
 * The catalog embeds this in an iframe at a real width. It has to be its own
 * document rather than a component, because Tailwind's `sm:` and `lg:` are
 * VIEWPORT media queries: a block inside a 375px-wide div still lays itself out
 * as though it had the whole window. A catalog that showed the desk layout,
 * narrower, with "Phone" written underneath would be worse than not offering
 * the phone case at all.
 *
 * It sits outside the `(catalog)` route group so none of Saroh's chrome reaches
 * it. Nothing on this page is Saroh-coloured, and that is the property the
 * whole catalog exists to make visible — so this route adds no frame, no
 * caption and no background of its own.
 *
 * `SiteTheme` writes `:root` here, which is right: this document IS one
 * merchant's page, exactly as a published site is. The scoped variant is for
 * the catalog page around it, which shows several palettes at once.
 */
export default async function BlockPreviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ type: string }>;
    searchParams: Promise<{ variant?: string; palette?: string }>;
}) {
    const { type } = await params;
    const { variant, palette } = await searchParams;

    if (!isSectionType(type)) notFound();

    const meta = BLOCK_META[type];
    const variantId = variant ?? meta.variants[0].id;
    const content = blockFixture(type, variantId);
    if (!content) notFound();

    return (
        <>
            <SiteTheme variables={paletteById(palette).variables} />
            {/* A block sits on the merchant's page ground, so the preview has
                one. Without it the block would float on the browser default and
                every palette would look the same behind the section. */}
            <div className="min-h-screen bg-site-bg text-site-fg">
                <SectionRenderer section={{ type, content }} />
            </div>
        </>
    );
}
