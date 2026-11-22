"use client";

import { MediaPicker } from "@/components/shared/fields/media-picker";
import { pickedSizes } from "@/components/shared/fields/picked-image";
import { PhotoSheetButton } from "@/components/sites/editor/sheets/photo-sheet-opener";
import type { HeroPanelKind } from "@saroh/block-contract";
import { resolveVariant, SAME_DAY_CALL_WORDS } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";
import { useId, useRef } from "react";

import { buildImage } from "@/components/sites/section-fields/build-image";
import {
    actionOf,
    CtaActionFields,
    withCtaAction,
    withCtaLabel,
} from "@/components/sites/section-fields/cta-action-fields";
import { ImageBrief } from "@/components/sites/section-fields/image-brief";
import { OptionSwitch } from "@/components/sites/section-fields/option-switch";
import { PhoneTextField } from "@/components/sites/section-fields/phone-text-field";
import type { SectionFieldsProps } from "@/components/sites/section-fields/props";
import type { HeroContent } from "@/lib/sites/service";

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
/** The hero's second link, or none while it has no words (DEC-172). */
function secondLink(
    label: string,
    href: string | undefined,
    phoneLabel?: string,
): HeroContent["secondaryCta"] {
    if (label.trim() === "") return undefined;
    return {
        label,
        href: href ?? "/",
        ...(phoneLabel === undefined ? {} : { phoneLabel }),
    };
}

/** The answer panel's kinds as the owner reads them (KD14, DEC-228). */
const PANEL_KINDS: readonly (readonly [HeroPanelKind, string])[] = [
    ["today", "Today's classes"],
    ["nextFree", "Next open time"],
    ["sameDayCall", "Same-day call"],
    ["consultation", "One consultation"],
    ["pickup", "Pickup"],
];

export function HeroFields({
    section,
    pages,
    onChange,
}: SectionFieldsProps<"hero">) {
    const c = section.content;
    const id = useId();
    const headingRef = useRef<HTMLInputElement>(null);
    const patch = (next: Partial<HeroContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    // The `none` look is a page title: it may keep its heading for screen
    // readers only, when the header already shows the same name.
    const look = resolveVariant("hero", c);
    const titleOnly = look === "none";
    const panel = c.panel ?? { kind: "today" as const };
    const patchPanel = (next: Partial<NonNullable<HeroContent["panel"]>>) =>
        patch({ panel: { ...panel, ...next } });
    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    ref={headingRef}
                    value={c.heading}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="Welcome"
                />
            </Field>
            {/* One h1, the same on every width (DEC-237): no phone version. */}
            <p className="-mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Same on phone and desktop. Search engines read the phone page,
                and a page has one main heading. Too long for a phone?{" "}
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => headingRef.current?.focus()}
                    className="h-auto p-0 text-[12px] font-semibold coarse:min-h-11"
                >
                    Shorten it for both.
                </Button>
            </p>
            {titleOnly ? (
                <div className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`${id}-title`}>Show the heading</Label>
                        <Switch
                            id={`${id}-title`}
                            checked={c.titleVisible !== false}
                            onCheckedChange={(on) =>
                                patch({ titleVisible: on ? undefined : false })
                            }
                        />
                    </div>
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                        Off, the heading is kept for screen readers and search
                        engines only. Use it for a page whose menu already shows
                        the same name.
                    </p>
                </div>
            ) : null}
            <Field label="Subheading">
                <Input
                    value={c.subheading ?? ""}
                    onChange={(e) => patch({ subheading: e.target.value })}
                    placeholder="A short tagline"
                />
            </Field>
            {c.subheading?.trim() ? (
                <PhoneTextField
                    label="Subheading"
                    value={c.phoneLine}
                    fallback={c.subheading}
                    maxLength={200}
                    searchHint
                    onChange={(phoneLine) => patch({ phoneLine })}
                />
            ) : null}
            <Field label="Button label">
                <Input
                    value={c.cta?.label ?? ""}
                    onChange={(e) =>
                        // Writing the button writes it as v2, lifting
                        // a v1 href into an action on the way.
                        onChange({
                            ...section,
                            contractVersion: 2,
                            content: {
                                ...c,
                                cta: withCtaLabel(c.cta, e.target.value),
                            },
                        })
                    }
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
                                cta: withCtaAction(c.cta, action),
                            },
                        })
                    }
                />
            ) : null}
            {c.cta?.label.trim() ? (
                <PhoneTextField
                    label="Button"
                    value={c.cta.phoneLabel}
                    fallback={c.cta.label}
                    maxLength={40}
                    onChange={(phoneLabel) =>
                        patch({ cta: c.cta && { ...c.cta, phoneLabel } })
                    }
                />
            ) : null}
            <Field label="Second link">
                <Input
                    value={c.secondaryCta?.label ?? ""}
                    onChange={(e) =>
                        patch({
                            secondaryCta: secondLink(
                                e.target.value,
                                c.secondaryCta?.href,
                                c.secondaryCta?.phoneLabel,
                            ),
                        })
                    }
                    placeholder="See more"
                />
            </Field>
            {c.secondaryCta ? (
                <Field label="Second link goes to">
                    <Input
                        value={c.secondaryCta.href}
                        onChange={(e) =>
                            patch({
                                secondaryCta: secondLink(
                                    c.secondaryCta?.label ?? "",
                                    e.target.value,
                                    c.secondaryCta?.phoneLabel,
                                ),
                            })
                        }
                        placeholder="/#contact"
                    />
                </Field>
            ) : null}
            {c.secondaryCta ? (
                <PhoneTextField
                    label="Second link"
                    value={c.secondaryCta.phoneLabel}
                    fallback={c.secondaryCta.label}
                    maxLength={40}
                    onChange={(phoneLabel) =>
                        patch({
                            secondaryCta: c.secondaryCta && {
                                ...c.secondaryCta,
                                phoneLabel,
                            },
                        })
                    }
                />
            ) : null}
            <p className="-mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                A quieter link beside the button. The Quiet, Folio and Live
                looks show it.
            </p>
            {look === "answer" ? (
                <>
                    <Field label="The panel answers">
                        <Select
                            value={panel.kind}
                            onValueChange={(v) =>
                                patchPanel({ kind: v as HeroPanelKind })
                            }
                        >
                            <SelectTrigger aria-label="The panel answers">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PANEL_KINDS.map(([kind, words]) => (
                                    <SelectItem key={kind} value={kind}>
                                        {words}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {panel.kind === "sameDayCall" ? (
                        <>
                            <Field optional label="The panel's line">
                                <Input
                                    value={panel.words ?? ""}
                                    onChange={(e) =>
                                        patchPanel({
                                            words: e.target.value || undefined,
                                        })
                                    }
                                    maxLength={160}
                                    placeholder={SAME_DAY_CALL_WORDS}
                                />
                            </Field>
                            <Field
                                optional
                                label="Number to call"
                                hint="Leave empty to use your business's phone."
                            >
                                <Input
                                    type="tel"
                                    value={panel.phone ?? ""}
                                    onChange={(e) =>
                                        patchPanel({
                                            phone: e.target.value || undefined,
                                        })
                                    }
                                />
                            </Field>
                        </>
                    ) : null}
                    {panel.kind === "pickup" ? (
                        <>
                            <Field label="Order by">
                                <Input
                                    value={panel.orderBy ?? ""}
                                    onChange={(e) =>
                                        patchPanel({
                                            orderBy:
                                                e.target.value || undefined,
                                        })
                                    }
                                    maxLength={80}
                                    placeholder="Order by 9 pm for tomorrow"
                                />
                            </Field>
                            <Field label="Where to pick up">
                                <Input
                                    value={panel.where ?? ""}
                                    onChange={(e) =>
                                        patchPanel({
                                            where: e.target.value || undefined,
                                        })
                                    }
                                    maxLength={160}
                                    placeholder="From the counter"
                                />
                            </Field>
                        </>
                    ) : null}
                </>
            ) : null}
            {!titleOnly && look !== "fullBleed" ? (
                <>
                    <OptionSwitch
                        label="Open now, directions and call"
                        checked={c.answerRow === true}
                        onChange={(on) =>
                            patch({ answerRow: on ? true : undefined })
                        }
                        note="A row under the buttons, read from your hours, address and phone."
                    />
                    <BylineFields
                        byline={c.byline}
                        onChange={(byline) => patch({ byline })}
                    />
                </>
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
                                ...pickedSizes(img),
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
                <PhotoSheetButton
                    field="image"
                    hasPhoto={Boolean(c.image?.src)}
                />
                <ImageBrief
                    brief={c.imageBrief}
                    hasImage={Boolean(c.image?.src)}
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

/**
 * The Byline (U4): who is behind the business, under the line. A name
 * makes one; clearing the name removes it, photo and all.
 */
function BylineFields({
    byline,
    onChange,
}: {
    byline: HeroContent["byline"];
    onChange: (next: HeroContent["byline"]) => void;
}) {
    const set = (next: Partial<NonNullable<HeroContent["byline"]>>) => {
        const merged = { name: "", ...byline, ...next };
        onChange(merged.name.trim() ? merged : undefined);
    };
    return (
        <>
            <Field
                optional
                label="Written by"
                hint="Who is behind the business, shown under the line."
            >
                <Input
                    value={byline?.name ?? ""}
                    onChange={(e) => set({ name: e.target.value })}
                    maxLength={120}
                    placeholder="Your name"
                />
            </Field>
            {byline?.name.trim() ? (
                <>
                    <Field optional label="Their role">
                        <Input
                            value={byline.role ?? ""}
                            onChange={(e) =>
                                set({ role: e.target.value || undefined })
                            }
                            maxLength={160}
                            placeholder="Founder"
                        />
                    </Field>
                    <Field optional label="Their photo">
                        <MediaPicker
                            onPick={(img) =>
                                set({
                                    image: {
                                        src: img.src,
                                        alt: "",
                                        width: img.width,
                                        height: img.height,
                                        ...pickedSizes(img),
                                    },
                                })
                            }
                        />
                    </Field>
                </>
            ) : null}
        </>
    );
}
