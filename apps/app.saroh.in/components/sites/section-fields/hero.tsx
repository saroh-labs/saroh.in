"use client";

import { MediaPicker } from "@/components/sites/media-picker";
import { Input } from "@saroh/ui/input";

import type { HeroContent } from "@/lib/sites/service";
import { buildImage } from "./build-image";
import { CtaActionFields, actionOf } from "./cta-action-fields";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `hero` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function HeroFields({
    section,
    pages,
    onChange,
}: SectionFieldsProps<"hero">) {
    const c = section.content;
    const patch = (next: Partial<HeroContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="Welcome"
                />
            </Field>
            <Field label="Subheading">
                <Input
                    value={c.subheading ?? ""}
                    onChange={(e) => patch({ subheading: e.target.value })}
                    placeholder="A short tagline"
                />
            </Field>
            <Field label="Button label">
                <Input
                    value={c.cta?.label ?? ""}
                    onChange={(e) => {
                        // Writing the button writes it as v2, lifting
                        // a v1 href into an action on the way.
                        const label = e.target.value;
                        const action = actionOf(c.cta);
                        const blank =
                            !label.trim() &&
                            action.kind === "url" &&
                            !action.href.trim();
                        onChange({
                            ...section,
                            contractVersion: 2,
                            content: {
                                ...c,
                                cta: blank
                                    ? undefined
                                    : {
                                          label,
                                          action,
                                          style: c.cta?.style ?? "primary",
                                      },
                            },
                        });
                    }}
                    placeholder="Get started"
                />
            </Field>
            {c.cta?.label.trim() ? (
                <CtaActionFields
                    action={actionOf(c.cta)}
                    pages={pages}
                    onChange={(action) =>
                        onChange({
                            ...section,
                            contractVersion: 2,
                            content: {
                                ...c,
                                cta: {
                                    label: c.cta?.label ?? "",
                                    action,
                                    style: c.cta?.style ?? "primary",
                                },
                            },
                        })
                    }
                />
            ) : null}
            <Field label="Image">
                {/*
                 * The picture first, the address second. A merchant
                 * has the photo on their phone; the URL field stays
                 * for the one who genuinely has an address, but it is
                 * no longer the only door.
                 */}
                <MediaPicker
                    onPick={(img) =>
                        patch({
                            image: {
                                src: img.src,
                                alt: c.image?.alt,
                                width: img.width,
                                height: img.height,
                            },
                        })
                    }
                />
                <Input
                    value={c.image?.src ?? ""}
                    onChange={(e) =>
                        patch({
                            image: buildImage(
                                e.target.value,
                                c.image?.alt ?? "",
                            ),
                        })
                    }
                    placeholder="or paste an image address"
                    aria-label="Image address"
                    className="mt-1.5"
                />
            </Field>
            {c.image?.src ? (
                <Field label="Describe the image">
                    {/*
                     * Alt text is asked where the image is chosen, not
                     * in a settings screen later. It is only shown once
                     * there is an image to describe.
                     */}
                    <Input
                        value={c.image.alt ?? ""}
                        onChange={(e) => {
                            // Narrowing from the surrounding `c.image?.src`
                            // does not reach into this closure.
                            if (!c.image) return;
                            patch({
                                image: {
                                    ...c.image,
                                    alt: e.target.value,
                                },
                            });
                        }}
                        placeholder="What is in the picture, for someone who cannot see it"
                    />
                </Field>
            ) : null}
        </div>
    );
}
