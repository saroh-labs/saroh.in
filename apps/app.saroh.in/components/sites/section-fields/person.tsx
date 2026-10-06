"use client";

import { PERSON_BIO_MAX, PERSON_CREDENTIALS_MAX } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import { MediaPicker } from "@/components/sites/media-picker";
import type { PersonContent } from "@/lib/sites/service";

import {
    CtaActionFields,
    actionOf,
    withCtaAction,
    withCtaLabel,
} from "./cta-action-fields";
import { Field } from "./field";
import { ImageBrief } from "./image-brief";
import type { SectionFieldsProps } from "./props";

/**
 * The `person` section's editor fields (industry templates U2): a photo,
 * the name, what they do, their qualifications (up to the contract's cap),
 * a few lines about them and an optional button, such as "Book with Anika".
 *
 * Nothing is invented: a just-added block has an empty name. The photo goes
 * through the media library and its description is asked for here, needed
 * before publishing (the pre-publish check names a photo without one). A
 * template's brief for the photo shows in the empty slot (KTD-5).
 */
export function PersonFields({
    section,
    pages,
    onChange,
}: SectionFieldsProps<"person">) {
    const c = section.content;
    const patch = (next: Partial<PersonContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const credentials = c.credentials ?? [];
    const setCredentials = (next: string[]) =>
        patch({ credentials: next.length > 0 ? next : undefined });
    const hintId = useId();
    const image = c.image?.src ? c.image : undefined;

    return (
        <div className="grid gap-3">
            <Field label="Photo">
                <div className="flex items-start gap-2.5">
                    {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photo, a thumbnail outside next/image's allowlist
                        <img
                            src={image.src}
                            alt=""
                            className="h-14 w-11 flex-none rounded-md border border-border object-cover"
                        />
                    ) : null}
                    <MediaPicker
                        className="min-w-0 flex-1"
                        label={image ? "Replace…" : "Upload a photo…"}
                        onPick={(picked) =>
                            patch({
                                image: {
                                    src: picked.src,
                                    alt: image?.alt,
                                    width: picked.width,
                                    height: picked.height,
                                },
                            })
                        }
                    />
                </div>
                <ImageBrief brief={c.imageBrief} hasImage={Boolean(image)} />
                {image ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-end text-destructive hover:text-destructive"
                        onClick={() => patch({ image: undefined })}
                    >
                        Remove photo
                    </Button>
                ) : null}
            </Field>
            {image ? (
                <div className="grid gap-1">
                    <Field label="Describe the photo">
                        <Input
                            value={image.alt ?? ""}
                            onChange={(e) =>
                                patch({
                                    image: { ...image, alt: e.target.value },
                                })
                            }
                            placeholder="What is in the photo, for someone who can't see it"
                            aria-describedby={hintId}
                        />
                    </Field>
                    <p id={hintId} className="text-xs text-muted-foreground">
                        {image.alt?.trim()
                            ? "Read aloud to visitors who can't see it."
                            : "Needed before you publish."}
                    </p>
                </div>
            ) : null}

            <Field label="Name">
                <Input
                    value={c.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Their name, as they'd introduce themselves"
                />
            </Field>
            <Field label="What they do">
                <Input
                    value={c.role ?? ""}
                    onChange={(e) =>
                        patch({ role: e.target.value || undefined })
                    }
                    placeholder="Clinical dietician"
                />
            </Field>

            <Field label="Qualifications">
                <div className="grid gap-2">
                    {credentials.map((line, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                value={line}
                                aria-label={`Qualification ${i + 1}`}
                                onChange={(e) =>
                                    setCredentials(
                                        credentials.map((v, j) =>
                                            j === i ? e.target.value : v,
                                        ),
                                    )
                                }
                                placeholder="MSc Clinical Nutrition"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove qualification ${i + 1}`}
                                onClick={() =>
                                    setCredentials(
                                        credentials.filter((_, j) => j !== i),
                                    )
                                }
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                    {credentials.length < PERSON_CREDENTIALS_MAX ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-self-start"
                            onClick={() => setCredentials([...credentials, ""])}
                        >
                            Add a qualification
                        </Button>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            That is the most this block lists.
                        </p>
                    )}
                </div>
            </Field>

            <Field label="About them">
                <Textarea
                    value={c.bio ?? ""}
                    onChange={(e) =>
                        patch({ bio: e.target.value || undefined })
                    }
                    rows={4}
                    maxLength={PERSON_BIO_MAX}
                    placeholder="A few lines in their own words. Optional."
                />
            </Field>

            <Field label="Button label">
                <Input
                    value={c.cta?.label ?? ""}
                    onChange={(e) =>
                        patch({ cta: withCtaLabel(c.cta, e.target.value) })
                    }
                    placeholder="Book a consultation"
                />
            </Field>
            {c.cta?.label.trim() ? (
                <CtaActionFields
                    action={actionOf(c.cta)}
                    pages={pages}
                    onChange={(action) =>
                        patch({ cta: withCtaAction(c.cta, action) })
                    }
                />
            ) : null}
        </div>
    );
}
