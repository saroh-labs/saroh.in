import type { ImageValue } from "@/lib/sites/service";

/** Build a hero image, or undefined when there is no source. */
export function buildImage(src: string, alt: string): ImageValue | undefined {
    if (!src.trim()) return undefined;
    return { src, alt: alt.trim() || undefined };
}
