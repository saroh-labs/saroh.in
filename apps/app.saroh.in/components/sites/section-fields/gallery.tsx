"use client";

import { MediaPicker } from "@/components/sites/media-picker";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import { liftToLatest } from "@saroh/block-contract";

import type { GalleryContent, GalleryImage } from "@/lib/sites/service";
import { FIELD_LABEL } from "./constants";
import { ImageBrief } from "./image-brief";
import type { SectionFieldsProps } from "./props";

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
export function GalleryFields({
    section,
    onChange,
}: SectionFieldsProps<"gallery">) {
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
                                                      ...im,
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
