"use client";

import {
    isSafeHref,
    PROJECTS_MAX,
    resolveVariant,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import { MediaPicker } from "@/components/sites/media-picker";
import type { ProjectItem, ProjectsContent } from "@/lib/sites/service";

import { Field } from "./field";
import { ImageBrief } from "./image-brief";
import { OptionSwitch } from "./option-switch";
import type { SectionFieldsProps } from "./props";
import { RepeatedItems } from "./repeated-items";

/**
 * The `projects` section's editor fields (K11).
 *
 * A title over the merchant's own work, one card per project: a photo from
 * the media library, a title, a line about it and a link. Projects are added,
 * moved up and down and removed here, up to the contract's cap. The look,
 * cards or list, is the picker the dispatcher renders above these fields.
 *
 * Nothing is invented: a just-added block holds one empty project, and the
 * merchant types their own.
 */
export function ProjectsFields({
    section,
    onChange,
}: SectionFieldsProps<"projects">) {
    const c = section.content;
    const patch = (next: Partial<ProjectsContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Selected work"
                />
            </Field>

            <RepeatedItems
                items={c.items}
                onChange={(items) => patch({ items })}
                max={PROJECTS_MAX}
                itemNoun="Project"
                addLabel="Add a project"
                fullMessage="That is the most this block carries. A longer list wants a page of its own."
                newItem={() => ({ title: "" })}
                reorderable
            >
                {(item, set) => (
                    <ProjectFields
                        item={item}
                        set={set}
                        rows={resolveVariant("projects", c) === "rows"}
                    />
                )}
            </RepeatedItems>

            <OptionSwitch
                label="Count the projects"
                checked={c.showCount === true}
                onChange={(on) => patch({ showCount: on ? true : undefined })}
                note="Beside the title, counted from the projects here: “5 projects across 8 years”, the span read from their years."
            />
        </div>
    );
}

function ProjectFields({
    item,
    set,
    rows,
}: {
    item: ProjectItem;
    set: (next: Partial<ProjectItem>) => void;
    /** The rows look draws no photos, so it asks for none. */
    rows: boolean;
}) {
    const linkHint = useId();
    const link = item.link ?? "";
    const badLink = link.trim() !== "" && !isSafeHref(link.trim());
    return (
        <>
            {rows ? null : <ProjectPhoto item={item} set={set} />}
            {rows ? (
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Year">
                        <Input
                            value={item.year ?? ""}
                            onChange={(e) =>
                                set({ year: e.target.value || undefined })
                            }
                            maxLength={20}
                            placeholder="2026"
                        />
                    </Field>
                    <Field label="Your role">
                        <Input
                            value={item.role ?? ""}
                            onChange={(e) =>
                                set({ role: e.target.value || undefined })
                            }
                            maxLength={80}
                            placeholder="Sole engineer"
                        />
                    </Field>
                </div>
            ) : null}
            <Field label="Title">
                <Input
                    value={item.title}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="What the project was"
                />
            </Field>
            <Field label="About it">
                <Textarea
                    value={item.summary ?? ""}
                    onChange={(e) =>
                        set({ summary: e.target.value || undefined })
                    }
                    rows={2}
                    placeholder="A line or two: who it was for, what came of it. Optional."
                />
            </Field>
            <Field label="Details">
                <Input
                    value={item.meta ?? ""}
                    onChange={(e) => set({ meta: e.target.value || undefined })}
                    maxLength={160}
                    placeholder="Optional. A short line of facts, like the tools used."
                />
            </Field>
            <div className="grid gap-1">
                <Field label="Link">
                    <Input
                        value={link}
                        onChange={(e) =>
                            set({ link: e.target.value.trim() || undefined })
                        }
                        placeholder="https://… or a page on this site, like /work"
                        aria-describedby={linkHint}
                        aria-invalid={badLink || undefined}
                    />
                </Field>
                <p
                    id={linkHint}
                    className={
                        badLink
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                    }
                >
                    {badLink
                        ? "A link must be a web address, an email or phone link, or a path on this site."
                        : "Shown as View project. Leave empty for none."}
                </p>
            </div>
        </>
    );
}

/**
 * The project's photo: a thumbnail, "Upload a photo…" (or "Replace…"),
 * Remove, and its description, as the text block's photo asks (G7). Uploads
 * go through the media library, so a photo on a published page is guarded
 * from deletion there too. The description is needed before publishing, not
 * on save: the pre-publish check names a photo without one.
 */
function ProjectPhoto({
    item,
    set,
}: {
    item: ProjectItem;
    set: (next: Partial<ProjectItem>) => void;
}) {
    const hintId = useId();
    const image = item.image?.src ? item.image : undefined;
    const undescribed = image !== undefined && !image.alt?.trim();
    return (
        <>
            <Field label="Photo">
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
                            set({
                                image: {
                                    src: picked.src,
                                    // A new photo keeps a description only
                                    // if one was written for the photo it
                                    // replaces.
                                    alt: image?.alt,
                                    width: picked.width,
                                    height: picked.height,
                                },
                            })
                        }
                    />
                </div>
                <ImageBrief brief={item.imageBrief} hasImage={Boolean(image)} />
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        Optional. Without one, the project shows as words only.
                    </p>
                    {image ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => set({ image: undefined })}
                        >
                            Remove photo
                        </Button>
                    ) : null}
                </div>
            </Field>
            {image ? (
                <div className="grid gap-1">
                    <Field label="Describe the photo">
                        <Input
                            value={image.alt ?? ""}
                            onChange={(e) =>
                                set({
                                    image: { ...image, alt: e.target.value },
                                })
                            }
                            placeholder="What is in the photo, for someone who can't see it"
                            aria-describedby={hintId}
                        />
                    </Field>
                    <p id={hintId} className="text-xs text-muted-foreground">
                        {undescribed
                            ? "Needed before you publish."
                            : "Read aloud to visitors who can't see it."}
                    </p>
                </div>
            ) : null}
            {image ? (
                <Field label="Caption">
                    <Input
                        value={item.caption ?? ""}
                        onChange={(e) =>
                            set({ caption: e.target.value || undefined })
                        }
                        placeholder="A line under the photo, like who took it. Optional."
                    />
                </Field>
            ) : null}
        </>
    );
}
