"use client";

import { MediaPicker } from "@/components/shared/fields/media-picker";
import { pickedSizes } from "@/components/shared/fields/picked-image";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import { liftToLatest, resolveVariant } from "@saroh/block-contract";

import { FIELD_LABEL } from "@/components/sites/section-fields/constants";
import { ImageBrief } from "@/components/sites/section-fields/image-brief";
import type { SectionFieldsProps } from "@/components/sites/section-fields/props";
import { useGridCatalogue } from "@/components/sites/selling-sections/use-grid-catalogue";
import type { GalleryContent, GalleryImage } from "@/lib/sites/service";

import { LookbookItemFields } from "./lookbook-item-fields";

/**
 * The `gallery` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function GalleryFields(props: SectionFieldsProps<"gallery">) {
    // Only a lookbook links photos to products, so only it reads them.
    return resolveVariant("gallery", props.section.content) === "lookbook" ? (
        <LookbookGalleryFields {...props} />
    ) : (
        <GalleryFieldsView {...props} catalogue={null} />
    );
}

function LookbookGalleryFields(props: SectionFieldsProps<"gallery">) {
    const catalogue = useGridCatalogue();
    return <GalleryFieldsView {...props} catalogue={catalogue} />;
}

function GalleryFieldsView({
    section,
    onChange,
    pages,
    services,
    catalogue,
}: SectionFieldsProps<"gallery"> & {
    /** The products a lookbook photo can link to; null for other looks. */
    catalogue: ReturnType<typeof useGridCatalogue> | null;
}) {
    const c = section.content;
    const setImages = (images: GalleryImage[]) =>
        onChange({ ...section, content: { ...c, images } });
    /*
     * A caption (U2) lives on gallery@2 only — v1 is frozen — so writing one
     * lifts the section, `layout` becoming the `variant` it always meant,
     * exactly as choosing a look does. The look does not change.
     */
    const setCaptioned = (images: GalleryImage[]) => {
        const lifted = liftToLatest("gallery", section.contractVersion, {
            ...c,
            images,
        });
        onChange({
            ...section,
            contractVersion: lifted.version,
            content: lifted.content as unknown as GalleryContent,
        });
    };
    return (
        <div className="grid gap-3">
            {/*
                The Layout select lived here until #254 folded it into the
                block's look. The dispatcher renders that picker above these
                fields now, from the same list the catalog browses — one place a
                look is chosen, not two.
            */}
            <div className="grid gap-2">
                <Label className={FIELD_LABEL}>Images</Label>
                <ImageBrief
                    brief={c.imageBrief}
                    hasImage={c.images.some((img) => img.src.trim() !== "")}
                />
                {c.images.map((img, i) => (
                    <div key={i} className="grid gap-1.5">
                        <div className="flex items-start gap-2">
                            <Input
                                value={img.src}
                                onChange={(e) =>
                                    setImages(
                                        c.images.map((im, idx) =>
                                            idx === i
                                                ? {
                                                      // Another address: the
                                                      // old photo's blur and
                                                      // copies don't fit it.
                                                      ...im,
                                                      placeholder: undefined,
                                                      widths: undefined,
                                                      src: e.target.value,
                                                  }
                                                : im,
                                        ),
                                    )
                                }
                                placeholder="Image source"
                            />
                            <Input
                                value={img.alt ?? ""}
                                onChange={(e) =>
                                    setImages(
                                        c.images.map((im, idx) =>
                                            idx === i
                                                ? {
                                                      ...im,
                                                      alt: e.target.value,
                                                  }
                                                : im,
                                        ),
                                    )
                                }
                                placeholder="Alt text"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Remove image"
                                onClick={() =>
                                    setImages(
                                        c.images.filter((_, idx) => idx !== i),
                                    )
                                }
                            >
                                ✕
                            </Button>
                        </div>
                        {/* A line under the photo (U2), on the site under it. */}
                        <Input
                            value={img.caption ?? ""}
                            onChange={(e) =>
                                setCaptioned(
                                    c.images.map((im, idx) =>
                                        idx === i
                                            ? {
                                                  ...im,
                                                  caption:
                                                      e.target.value ||
                                                      undefined,
                                              }
                                            : im,
                                    ),
                                )
                            }
                            placeholder="Caption, shown under the photo. Optional."
                            aria-label={`Caption for image ${i + 1}`}
                        />
                        {catalogue ? (
                            <LookbookItemFields
                                image={img}
                                index={i}
                                services={services}
                                catalogue={catalogue}
                                pages={pages}
                                onChange={(next) =>
                                    setCaptioned(
                                        c.images.map((im, idx) =>
                                            idx === i ? next : im,
                                        ),
                                    )
                                }
                            />
                        ) : null}
                    </div>
                ))}
                {/*
              The picker appends; the rows below stay editable by address,
              so a merchant can mix uploaded photographs with pictures they
              already host somewhere.
            */}
                <MediaPicker
                    label="Add a photo"
                    onPick={(img) =>
                        setImages([
                            ...c.images,
                            {
                                src: img.src,
                                alt: "",
                                width: img.width,
                                height: img.height,
                                ...pickedSizes(img),
                            },
                        ])
                    }
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() =>
                        setImages([...c.images, { src: "", alt: "" }])
                    }
                >
                    + Image
                </Button>
            </div>
        </div>
    );
}
