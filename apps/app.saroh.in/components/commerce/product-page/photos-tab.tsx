import { Badge } from "@saroh/ui/badge";
import { Image as ImageIcon } from "lucide-react";

import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";

import { StateLink, TabState } from "./panel-state";
import { SheetButton } from "./sheet-button";

/**
 * The photos in the order customers see them. The first is the cover, and
 * every variant shows the same set unless it names one of them as its own.
 */
export function ProductPhotosTab({
    overview,
    storeId,
}: {
    overview: ProductOverview;
    storeId: string;
}) {
    const { product } = overview;
    const edit = productEditHref(storeId, product.id, "photos");

    if (product.images.length === 0) {
        return (
            <TabState
                icon={ImageIcon}
                title="No photos yet"
                description="Add up to 5. The first becomes the cover on the shop and in lists."
            >
                {overview.canWrite ? (
                    <StateLink href={edit}>Add photos</StateLink>
                ) : null}
            </TabState>
        );
    }

    const usedBy = (imageId: string) =>
        product.variants
            .filter((v) => v.imageId === imageId)
            .map((v) => v.title);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13px] font-semibold">
                    {product.images.length} of 5 photos
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                    In the order customers see them. The first is the cover.
                </p>
                {overview.canWrite ? (
                    <div className="ml-auto">
                        <SheetButton
                            kind="photos"
                            label="Edit"
                            ariaLabel="Edit photos"
                            product={product}
                            storeId={storeId}
                        />
                    </div>
                ) : null}
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {product.images.map((img, i) => {
                    const variants = usedBy(img.id);
                    return (
                        <li key={img.id} className="min-w-0">
                            <div className="relative overflow-hidden rounded-[10px] border border-border">
                                {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */}
                                <img
                                    src={img.url}
                                    alt={img.alt}
                                    className="aspect-[4/3] w-full object-cover"
                                />
                                {i === 0 ? (
                                    <Badge
                                        variant="neutral"
                                        className="absolute left-2 top-2"
                                    >
                                        Cover
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="mt-1.5 text-[12.5px]">
                                {img.alt || (
                                    <span className="text-destructive">
                                        No description for screen readers yet
                                    </span>
                                )}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground">
                                {img.width && img.height
                                    ? `${img.width} × ${img.height}`
                                    : "Size not known"}
                                {variants.length > 0
                                    ? ` · shown for ${variants.join(", ")}`
                                    : ""}
                            </p>
                            {img.creditName ? (
                                <p className="text-[11.5px] text-muted-foreground">
                                    Photo:{" "}
                                    {img.creditUrl ? (
                                        <a
                                            href={img.creditUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline underline-offset-2"
                                        >
                                            {img.creditName}
                                        </a>
                                    ) : (
                                        img.creditName
                                    )}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
