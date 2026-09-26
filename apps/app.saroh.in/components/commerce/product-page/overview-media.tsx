import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import Link from "next/link";

import { MediaThumb } from "@/components/commerce/product-sections/media-thumb";
import { mediaCounter } from "@/lib/products/editor-sections";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { onTheShop } from "@/lib/products/overview-rules";
import { detailTag } from "@/lib/products/overview-words";

import { CardHead, DetailRow, ShownTag } from "./overview-parts";
import { SheetButton } from "./sheet-button";

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Photos and videos on the Overview (#522): the first four as square tiles
 * — the cover marked, a fourth saying how many more — each opening the
 * Photos tab, and the count against the limits.
 */
export function OverviewPhotos({
    overview,
    storeId,
    photosHref,
}: {
    overview: ProductOverview;
    storeId: string;
    photosHref: string;
}) {
    const { product } = overview;
    const media = product.images;
    return (
        <Card className="min-w-0 rounded-[12px] p-0">
            <CardHead title="Photos and videos">
                {overview.canWrite ? (
                    <SheetButton
                        kind="photos"
                        label="Edit"
                        ariaLabel="Edit photos and videos"
                        product={product}
                        storeId={storeId}
                    />
                ) : null}
                <Link
                    href={photosHref}
                    scroll={false}
                    className={`${FOCUS} rounded-sm px-0.5 text-[12px] text-brand hover:text-foreground coarse:min-h-11`}
                >
                    {media.length ? `See all ${media.length}` : "Add"}
                </Link>
            </CardHead>
            <div className="grid gap-2.5 px-[18px] pb-4">
                {media.length > 0 ? (
                    <div className="grid max-w-[480px] grid-cols-4 gap-1.5">
                        {media.slice(0, 4).map((m, i) => {
                            const more = i === 3 && media.length > 4;
                            return (
                                <Link
                                    key={m.id}
                                    href={photosHref}
                                    scroll={false}
                                    aria-label={
                                        more
                                            ? `See all ${media.length}`
                                            : `${m.alt || (m.kind === "video" ? "Video" : "Photo")}${i === 0 ? ", the cover" : ""} — open Photos`
                                    }
                                    className={`${FOCUS} relative block aspect-square overflow-hidden rounded-lg bg-muted`}
                                >
                                    <MediaThumb item={m} alt="" small />
                                    {i === 0 && m.kind !== "video" ? (
                                        <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-1.5 py-px text-[10.5px] font-semibold text-background">
                                            Cover
                                        </span>
                                    ) : null}
                                    {more ? (
                                        <span className="absolute inset-0 flex items-center justify-center bg-neutral-900/55 text-[13px] font-semibold text-neutral-50">
                                            +{media.length - 3}
                                        </span>
                                    ) : null}
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-7 text-center text-[13px] text-muted-foreground">
                        No photos yet. The shop shows a plain tile until you add
                        one.
                    </p>
                )}
                <p className="text-[12px] text-muted-foreground">
                    {mediaCounter(media)}
                </p>
            </div>
        </Card>
    );
}

/**
 * Description and ingredients (#522): the words customers read, the key
 * points under them, and what it is made of and contains — each with
 * whether the shop shows it.
 */
export function OverviewDescription({
    overview,
    storeId,
}: {
    overview: ProductOverview;
    storeId: string;
}) {
    const { product } = overview;
    const { contains, mayContain } = product.allergens;
    return (
        <Card className="rounded-[12px] p-0">
            <CardHead title="Description and ingredients">
                {overview.canWrite ? (
                    <SheetButton
                        kind="description"
                        label="Edit"
                        ariaLabel="Edit description and ingredients"
                        product={product}
                        storeId={storeId}
                    />
                ) : null}
            </CardHead>
            <div className="px-[18px] pb-1.5">
                <div className="max-w-[70ch] pb-3 text-[14px] leading-[1.6]">
                    {product.description ? (
                        <div
                            className="prose prose-sm max-w-none text-neutral-700 dark:prose-invert dark:text-muted-foreground"
                            // Sanitised by the API on every save (#461).
                            dangerouslySetInnerHTML={{
                                __html: product.description,
                            }}
                        />
                    ) : (
                        <p className="text-muted-foreground">
                            No description yet.
                        </p>
                    )}
                    {product.keyPoints.length > 0 ? (
                        <ul className="mt-2.5 list-disc pl-5 text-neutral-700 dark:text-muted-foreground">
                            {product.keyPoints.map((p) => (
                                <li key={p}>{p}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
                <dl>
                    <DetailRow
                        label="Ingredients or material"
                        muted={!product.materials}
                        tag={detailTag(
                            Boolean(product.materials),
                            onTheShop(product.shopFields, "materials"),
                        )}
                    >
                        {product.materials ?? "Not given."}
                    </DetailRow>
                    {contains.length > 0 || mayContain.length > 0 ? (
                        <div className="flex items-baseline gap-3 border-t border-border py-[11px]">
                            <dt className="w-[104px] shrink-0 text-[12.5px] text-muted-foreground">
                                Contains
                            </dt>
                            <dd className="flex min-w-0 flex-1 flex-col gap-1.5">
                                {contains.length > 0 ? (
                                    <span className="flex flex-wrap gap-1.5">
                                        {contains.map((a) => (
                                            <Badge
                                                key={a.id}
                                                variant="draft"
                                                className="rounded-full px-[9px] py-0.5 text-[12px] font-semibold"
                                            >
                                                {a.name}
                                            </Badge>
                                        ))}
                                    </span>
                                ) : null}
                                {mayContain.length > 0 ? (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        May contain:{" "}
                                        {mayContain
                                            .map((a) => a.name.toLowerCase())
                                            .join(", ")}{" "}
                                        — same kitchen.
                                    </span>
                                ) : null}
                            </dd>
                            <ShownTag tag="On the shop" />
                        </div>
                    ) : null}
                </dl>
            </div>
        </Card>
    );
}
