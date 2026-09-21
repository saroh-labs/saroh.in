import { cn } from "@saroh/ui/lib/utils";
import Image from "next/image";

import type { ThemedImage as Pair } from "@/lib/site-content";

/**
 * A screen in the theme the site is wearing. Both render and CSS picks one:
 * the theme class is on <html> before hydration, so the right picture is the
 * one painted first, with no flash and no mounted flag.
 */
export function ThemedImage({
    image,
    alt,
    priority,
    sizes,
    className,
}: {
    image: Pair;
    alt: string;
    priority?: boolean;
    sizes?: string;
    className?: string;
}) {
    const shared = {
        width: image.w,
        height: image.h,
        alt,
        priority,
        sizes,
    };
    return (
        <>
            <Image
                {...shared}
                src={image.light}
                className={cn("dark:hidden", className)}
            />
            <Image
                {...shared}
                src={image.dark}
                className={cn("hidden dark:block", className)}
            />
        </>
    );
}
