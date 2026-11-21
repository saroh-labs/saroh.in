import type { DraftSection, SectionInput } from "./service";

interface Photo {
    src: string;
    alt?: string;
}

/** The photo at `path` ("image", "images.2") inside a section's content. */
function photoIn(content: unknown, path: string): Photo | null {
    let at: unknown = content;
    for (const key of path.split(".")) {
        if (typeof at !== "object" || at === null) return null;
        // Own fields only: `__proto__` would reach Object.prototype.
        if (key === "__proto__" || !Object.hasOwn(at, key)) return null;
        at = (at as Record<string, unknown>)[key];
    }
    return typeof at === "object" &&
        at !== null &&
        typeof (at as { src?: unknown }).src === "string"
        ? (at as Photo)
        : null;
}

/** The photo's address, to show it while describing; null when it's gone. */
export function photoAt(
    sections: readonly DraftSection[],
    sectionIndex: number,
    path: string,
): string | null {
    return photoIn(sections.at(sectionIndex)?.content, path)?.src ?? null;
}

/**
 * "Describe it" (plan U10): the draft's sections with one photo's
 * description (`alt`) written in. `path` is the check's `field`. Null when
 * the photo isn't there any more (the page changed since the check), so
 * nothing else is touched. The sections go back without `order`: array
 * position is the order.
 */
export function withPhotoDescription(
    sections: readonly DraftSection[],
    sectionIndex: number,
    path: string,
    alt: string,
): SectionInput[] | null {
    const section = sections.at(sectionIndex);
    if (!section) return null;
    const content = structuredClone(section.content);
    const photo = photoIn(content, path);
    if (!photo) return null;
    photo.alt = alt.trim();
    return sections.map((s, i) => {
        const { order: _order, ...rest } = s;
        return (
            i === sectionIndex ? { ...rest, content } : rest
        ) as SectionInput;
    });
}
