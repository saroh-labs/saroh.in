"use client";

import { MediaPicker } from "@/components/sites/media-picker";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import type { ImageValue } from "@/lib/sites/service";
import { FIELD_LABEL } from "./constants";
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
    const setImages = (images: ImageValue[]) =>
        onChange({ ...section, content: { ...c, images } });
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
                {c.images.map((img, i) => (
                    <div key={i} className="flex items-start gap-2">
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
