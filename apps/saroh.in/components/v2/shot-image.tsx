import { cn } from "@/lib/cn";
import Image from "next/image";

import type { Shot } from "@/content/shots";

/**
 * One screenshot from the manifest, or — until the capture pipeline (U20) has
 * shot it — a neutral frame of the same shape, so the page's layout already
 * matches the design. The placeholder keeps the alt as its accessible name.
 */
export function ShotImage({
    shot,
    alt,
    sizes,
    priority = false,
    className,
}: {
    shot: Shot;
    alt: string;
    sizes: string;
    priority?: boolean;
    className?: string;
}) {
    if (shot.src === null) {
        return (
            <span
                role="img"
                aria-label={alt}
                style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
                className={cn(
                    "grid w-full min-w-[min(100%,320px)] place-items-center bg-muted",
                    className,
                )}
            />
        );
    }
    return (
        <Image
            src={shot.src}
            alt={alt}
            width={shot.width}
            height={shot.height}
            sizes={sizes}
            priority={priority}
            className={cn("block h-auto w-full", className)}
        />
    );
}
