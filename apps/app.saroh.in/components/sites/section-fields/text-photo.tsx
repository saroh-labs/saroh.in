"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useId } from "react";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { MediaPicker } from "@/components/sites/media-picker";
import type { RichTextContent } from "@/lib/sites/service";

import { Field } from "./field";

type Photo = Pick<RichTextContent, "image" | "imageSide">;

/**
 * The text block's photo (G7): one photo beside the text, on the left or the
 * right, described for someone who can't see it.
 *
 * The design's photo field: a small thumbnail, "Upload a photo…" (or
 * "Replace…" once there is one), Remove, and a note saying where it goes.
 * Uploads go through the media library as the hero's do (`media:write`, the
 * same limits and types), so a photo on a published page is guarded from
 * deletion there too.
 *
 * The description is asked for here, where the photo is chosen, and is
 * required before publishing: the pre-publish check names a photo without
 * one. It is not refused on save, because the photo is chosen first and the
 * draft saves in between.
 */
export function TextPhotoFields({
    value,
    onChange,
}: {
    value: Photo;
    /** The block's photo fields as they should now be; `{}` removes them. */
    onChange: (next: Photo) => void;
}) {
    const image = value.image?.src ? value.image : undefined;
    const side = value.imageSide ?? "right";
    const undescribed = image !== undefined && !image.alt?.trim();
    const hintId = useId();
    return (
        <>
            <Field label="Photo">
                {/* Two children, so the label stays a caption: the picker
                    and Remove carry their own names. */}
                <div className="flex items-start gap-2.5">
                    {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photo, a thumbnail outside next/image's allowlist
                        <img
                            src={image.src}
                            alt=""
                            className="h-11 w-16 flex-none rounded-md border border-border object-cover"
                        />
                    ) : null}
                    <MediaPicker
                        className="min-w-0 flex-1"
                        label={image ? "Replace…" : "Upload a photo…"}
                        onPick={(picked) =>
                            onChange({
                                image: {
                                    src: picked.src,
                                    // A new photo keeps a description
                                    // only if the merchant wrote one for
                                    // the photo it replaces.
                                    alt: image?.alt,
                                    width: picked.width,
                                    height: picked.height,
                                },
                                imageSide: value.imageSide,
                            })
                        }
                    />
                </div>
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        Beside the text. On a phone it sits above it.
                    </p>
                    {image ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onChange({})}
                        >
                            Remove
                        </Button>
                    ) : null}
                </div>
            </Field>
            {image ? (
                <>
                    <div className="grid gap-1">
                        <Field label="Describe the photo">
                            <Input
                                value={image.alt ?? ""}
                                onChange={(e) =>
                                    onChange({
                                        image: {
                                            ...image,
                                            alt: e.target.value,
                                        },
                                        imageSide: value.imageSide,
                                    })
                                }
                                placeholder="What is in the photo, for someone who can't see it"
                                aria-describedby={hintId}
                            />
                        </Field>
                        <p
                            id={hintId}
                            className="text-xs text-muted-foreground"
                        >
                            {undescribed
                                ? "Needed before you publish."
                                : "Read aloud to visitors who can't see it."}
                        </p>
                    </div>
                    <Field label="Photo side">
                        <ToggleGroup
                            type="single"
                            value={side}
                            onValueChange={(v) => {
                                if (v === "left" || v === "right") {
                                    onChange({ image, imageSide: v });
                                }
                            }}
                            aria-label="Photo side"
                            className={SEGMENTED}
                        >
                            <ToggleGroupItem value="left" className={SEGMENT}>
                                Left
                            </ToggleGroupItem>
                            <ToggleGroupItem value="right" className={SEGMENT}>
                                Right
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </Field>
                </>
            ) : null}
        </>
    );
}
