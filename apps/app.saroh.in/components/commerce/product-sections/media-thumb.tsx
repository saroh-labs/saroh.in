import { cn } from "@saroh/ui/lib/utils";
import { Play } from "lucide-react";

import { formatDuration } from "@/lib/products/editor-sections";

/**
 * One photo or video of a product, as a still (#517). A photo is itself; a
 * video shows its poster — or its own first frame when it has none — with a
 * play mark and its length, so it reads as a video at a glance. Fills its
 * parent, which sets the size and the rounding and is `relative`.
 */
export function MediaThumb({
    item,
    alt,
    className,
    small = false,
    badgeAt = "right",
}: {
    item: {
        url: string;
        kind?: "photo" | "video";
        durationSec?: number | null;
        posterUrl?: string | null;
    };
    /** What it shows; "" for a thumbnail beside its own words. */
    alt: string;
    className?: string;
    /** A tighter badge for a small thumbnail. */
    small?: boolean;
    /** Where the length sits: the Editor's grid puts it bottom left (#525). */
    badgeAt?: "left" | "right";
}) {
    const fill = cn("size-full object-cover", className);
    if (item.kind !== "video") {
        return (
            /* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */
            <img src={item.url} alt={alt} className={fill} />
        );
    }
    const length = formatDuration(item.durationSec);
    return (
        <>
            {item.posterUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a tenant's own poster */
                <img src={item.posterUrl} alt={alt} className={fill} />
            ) : (
                <video
                    src={item.url}
                    preload="metadata"
                    muted
                    playsInline
                    aria-label={alt || undefined}
                    aria-hidden={alt ? undefined : true}
                    className={fill}
                />
            )}
            <span
                className={cn(
                    "absolute inline-flex items-center gap-1 rounded-full bg-foreground/85 font-semibold tabular-nums text-background",
                    small
                        ? "bottom-1 right-1 px-1.5 text-[10.5px]"
                        : "bottom-1.5 px-[7px] text-[11px]",
                    !small &&
                        (badgeAt === "left"
                            ? "left-1.5 py-0.5"
                            : "right-1.5 py-px"),
                )}
            >
                <Play
                    aria-hidden
                    className={cn(
                        "fill-current",
                        small ? "size-2" : "size-2.5",
                    )}
                />
                {length ? (
                    <>
                        <span className="sr-only">Video, </span>
                        {length}
                    </>
                ) : (
                    "Video"
                )}
            </span>
        </>
    );
}
