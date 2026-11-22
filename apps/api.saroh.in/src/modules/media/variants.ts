/**
 * A photo's smaller copies as stored on its `Media` row (DEC-246):
 * `[{ width, key, bytes }]`, narrowest first. JSON in the database, so
 * read through here: anything else in the column reads as no copies.
 */
export interface StoredVariant {
    width: number;
    key: string;
    bytes: number;
}

export function storedVariants(value: unknown): StoredVariant[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (v): v is StoredVariant =>
            v !== null &&
            typeof v === "object" &&
            typeof (v as StoredVariant).key === "string" &&
            Number.isInteger((v as StoredVariant).width) &&
            Number.isInteger((v as StoredVariant).bytes),
    );
}

/** Every stored file of an upload: the photo, then its copies. */
export function mediaFileKeys(media: {
    key: string;
    variants: unknown;
}): string[] {
    return [media.key, ...storedVariants(media.variants).map((v) => v.key)];
}

/** The copies' widths, for a page or a thumbnail; empty when none. */
export function variantWidths(value: unknown): number[] {
    return storedVariants(value).map((v) => v.width);
}
