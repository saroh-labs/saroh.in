/**
 * An empty photo slot's brief (KTD-5): what a template says belongs here,
 * shown where the photo would be until the merchant picks one. The live
 * site never shows it — it is a note to the owner — so this is the one
 * place it is read. Renders nothing once there is a photo, or no brief.
 */
export function ImageBrief({
    brief,
    hasImage,
}: {
    brief?: string;
    hasImage: boolean;
}) {
    const text = brief?.trim();
    if (hasImage || !text) return null;
    return (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Photo wanted: </span>
            {text}
        </p>
    );
}
