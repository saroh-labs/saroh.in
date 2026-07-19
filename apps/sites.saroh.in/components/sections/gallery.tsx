import type { GalleryContent } from "@/lib/publication";
import { cn } from "@/lib/utils";

/**
 * `gallery` v1 — an ordered set of images. `carousel` degrades to a horizontal
 * scroll strip; `grid` and `masonry` lay images out responsively. All variants
 * are keyboard/scroll accessible and never overflow the page horizontally.
 */
export default function GallerySection({
    content,
}: {
    content: GalleryContent;
}) {
    const layout = content.layout ?? "grid";

    if (layout === "carousel") {
        return (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-8">
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
                    {content.images.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={i}
                            src={img.src}
                            alt={img.alt ?? ""}
                            className="h-64 w-auto flex-none snap-start rounded-lg object-cover"
                        />
                    ))}
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-12 sm:px-8">
            <div
                className={cn(
                    layout === "masonry"
                        ? "columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4"
                        : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
                )}
            >
                {content.images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={i}
                        src={img.src}
                        alt={img.alt ?? ""}
                        className={cn(
                            "w-full rounded-lg object-cover",
                            layout === "masonry"
                                ? "h-auto"
                                : "aspect-square h-full",
                        )}
                    />
                ))}
            </div>
        </section>
    );
}
