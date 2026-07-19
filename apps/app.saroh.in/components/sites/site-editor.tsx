"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Textarea } from "@saroh/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

import { DraftPreview } from "@/components/sites/section-preview";
import { publishSite, saveDraftSections } from "@/lib/sites/actions";
import type {
    CtaStyle,
    CtaValue,
    GalleryLayout,
    HeroContent,
    ImageValue,
    RichTextContent,
    Section,
    SectionType,
} from "@/lib/sites/service";

/**
 * SiteEditor (S2-004) — the ticket's core deliverable. A client-side editable
 * list of sections rendered next to a LIVE `DraftPreview` that reflects local
 * state with no network round-trip (that is the "preview without publishing"
 * requirement). "Save draft" and "Publish" are the only API calls, via the
 * server actions. A dirty flag (local state vs. last-saved) gates publishing.
 */

const SECTION_LABELS: Record<SectionType, string> = {
    hero: "Hero",
    richText: "Rich text",
    cta: "Call to action",
    gallery: "Gallery",
};

const SECTION_ORDER: SectionType[] = ["hero", "richText", "cta", "gallery"];

/** A sensible empty section for the chosen type (contract v1). */
function emptySection(type: SectionType): Section {
    switch (type) {
        case "hero":
            return {
                type,
                contractVersion: 1,
                content: { heading: "", subheading: "" },
            };
        case "richText":
            return {
                type,
                contractVersion: 1,
                content: { format: "html", value: "" },
            };
        case "cta":
            return {
                type,
                contractVersion: 1,
                content: { label: "", href: "", style: "primary" },
            };
        case "gallery":
            return {
                type,
                contractVersion: 1,
                content: { images: [], layout: "grid" },
            };
    }
}

/** Build a hero/section CTA, or undefined when the author left it blank. */
function buildCta(
    label: string,
    href: string,
    style: CtaStyle,
): CtaValue | undefined {
    if (!label.trim() && !href.trim()) return undefined;
    return { label, href, style };
}

/** Build a hero image, or undefined when there is no source. */
function buildImage(src: string, alt: string): ImageValue | undefined {
    if (!src.trim()) return undefined;
    return { src, alt: alt.trim() || undefined };
}

export function SiteEditor({
    siteId,
    pageId,
    initialSections,
    siteName,
}: {
    siteId: string;
    pageId: string;
    initialSections: Section[];
    siteName: string;
}) {
    const [sections, setSections] = useState<Section[]>(initialSections);
    const [lastSavedJson, setLastSavedJson] = useState(() =>
        JSON.stringify(initialSections),
    );
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [errorIndex, setErrorIndex] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const dirty = JSON.stringify(sections) !== lastSavedJson;

    function replaceAt(index: number, next: Section) {
        setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
    }

    function addSection(type: SectionType) {
        setSections((prev) => [...prev, emptySection(type)]);
    }

    function removeAt(index: number) {
        setSections((prev) => prev.filter((_, i) => i !== index));
        setErrorIndex(null);
        setErrorMessage(null);
    }

    function move(index: number, delta: number) {
        setSections((prev) => {
            const target = index + delta;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return next;
        });
    }

    async function onSave() {
        setSaving(true);
        setErrorIndex(null);
        setErrorMessage(null);
        const res = await saveDraftSections(siteId, pageId, sections);
        setSaving(false);
        if (res.ok) {
            setLastSavedJson(JSON.stringify(sections));
            toast.success("Draft saved.");
            return;
        }
        if (typeof res.index === "number") {
            setErrorIndex(res.index);
            setErrorMessage(res.error);
        }
        toast.error(res.error);
    }

    async function onPublish() {
        if (dirty) {
            toast.error("You have unsaved changes — save the draft first.");
            return;
        }
        setPublishing(true);
        const res = await publishSite(siteId);
        setPublishing(false);
        if (res.ok) {
            toast.success("Site published.");
            return;
        }
        toast.error(res.error);
    }

    return (
        <div className="mt-4">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold">{siteName}</h1>
                <div className="flex items-center gap-3">
                    {dirty && (
                        <span className="text-sm text-muted-foreground">
                            Unsaved changes
                        </span>
                    )}
                    <Button
                        variant="outline"
                        onClick={onSave}
                        disabled={saving || !dirty}
                    >
                        {saving ? "Saving…" : "Save draft"}
                    </Button>
                    <Button onClick={onPublish} disabled={publishing || dirty}>
                        {publishing ? "Publishing…" : "Publish"}
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                {/* Editor */}
                <div className="space-y-4">
                    {sections.length === 0 && (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No sections yet. Add one below to start building the
                            page.
                        </p>
                    )}

                    {sections.map((section, index) => (
                        <div
                            key={index}
                            className={
                                "rounded-lg border p-4" +
                                (errorIndex === index
                                    ? " border-destructive"
                                    : "")
                            }
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-medium">
                                    {SECTION_LABELS[section.type]}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Move section up"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        ↑
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Move section down"
                                        disabled={index === sections.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        ↓
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Remove section"
                                        onClick={() => removeAt(index)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>

                            <SectionFields
                                section={section}
                                onChange={(next) => replaceAt(index, next)}
                            />

                            {errorIndex === index && errorMessage && (
                                <p className="mt-3 text-sm text-destructive">
                                    {errorMessage}
                                </p>
                            )}
                        </div>
                    ))}

                    <div className="flex flex-wrap gap-2 pt-2">
                        {SECTION_ORDER.map((type) => (
                            <Button
                                key={type}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addSection(type)}
                            >
                                + {SECTION_LABELS[type]}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Live preview (no network) */}
                <div className="lg:sticky lg:top-8 lg:self-start">
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Preview
                    </p>
                    <DraftPreview sections={sections} />
                </div>
            </div>
        </div>
    );
}

/** Per-type field editor. Narrowing on `section.type` gives the exact shape. */
function SectionFields({
    section,
    onChange,
}: {
    section: Section;
    onChange: (next: Section) => void;
}) {
    switch (section.type) {
        case "hero": {
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
                            onChange={(e) =>
                                patch({ subheading: e.target.value })
                            }
                            placeholder="A short tagline"
                        />
                    </Field>
                    <Field label="CTA label">
                        <Input
                            value={c.cta?.label ?? ""}
                            onChange={(e) =>
                                patch({
                                    cta: buildCta(
                                        e.target.value,
                                        c.cta?.href ?? "",
                                        c.cta?.style ?? "primary",
                                    ),
                                })
                            }
                            placeholder="Get started"
                        />
                    </Field>
                    <Field label="CTA link">
                        <Input
                            value={c.cta?.href ?? ""}
                            onChange={(e) =>
                                patch({
                                    cta: buildCta(
                                        c.cta?.label ?? "",
                                        e.target.value,
                                        c.cta?.style ?? "primary",
                                    ),
                                })
                            }
                            placeholder="/signup"
                        />
                    </Field>
                    <Field label="Image source">
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
                            placeholder="https://…/hero.jpg"
                        />
                    </Field>
                </div>
            );
        }
        case "richText": {
            const c = section.content;
            const patch = (next: Partial<RichTextContent>) =>
                onChange({ ...section, content: { ...c, ...next } });
            return (
                <div className="grid gap-3">
                    <Field label="Format">
                        <Select
                            value={c.format}
                            onValueChange={(v) =>
                                patch({
                                    format: v as RichTextContent["format"],
                                })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="html">HTML</SelectItem>
                                <SelectItem value="markdown">
                                    Markdown
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Content">
                        <Textarea
                            value={c.value}
                            onChange={(e) => patch({ value: e.target.value })}
                            rows={6}
                            placeholder={
                                c.format === "html"
                                    ? "<p>Hello world</p>"
                                    : "# Hello world"
                            }
                        />
                    </Field>
                </div>
            );
        }
        case "cta": {
            const c = section.content;
            const patch = (next: Partial<CtaValue>) =>
                onChange({ ...section, content: { ...c, ...next } });
            return (
                <div className="grid gap-3">
                    <Field label="Label">
                        <Input
                            value={c.label}
                            onChange={(e) => patch({ label: e.target.value })}
                            placeholder="Start now"
                        />
                    </Field>
                    <Field label="Link">
                        <Input
                            value={c.href}
                            onChange={(e) => patch({ href: e.target.value })}
                            placeholder="/signup"
                        />
                    </Field>
                    <Field label="Style">
                        <Select
                            value={c.style ?? "primary"}
                            onValueChange={(v) =>
                                patch({ style: v as CtaStyle })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="primary">Primary</SelectItem>
                                <SelectItem value="secondary">
                                    Secondary
                                </SelectItem>
                                <SelectItem value="link">Link</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
            );
        }
        case "gallery": {
            const c = section.content;
            const setImages = (images: ImageValue[]) =>
                onChange({ ...section, content: { ...c, images } });
            return (
                <div className="grid gap-3">
                    <Field label="Layout">
                        <Select
                            value={c.layout ?? "grid"}
                            onValueChange={(v) =>
                                onChange({
                                    ...section,
                                    content: {
                                        ...c,
                                        layout: v as GalleryLayout,
                                    },
                                })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grid">Grid</SelectItem>
                                <SelectItem value="carousel">
                                    Carousel
                                </SelectItem>
                                <SelectItem value="masonry">Masonry</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <div className="grid gap-2">
                        <Label>Images</Label>
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
                                            c.images.filter(
                                                (_, idx) => idx !== i,
                                            ),
                                        )
                                    }
                                >
                                    ✕
                                </Button>
                            </div>
                        ))}
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
        default:
            return null;
    }
}

/** Small labelled field wrapper to keep the per-type editors terse. */
function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <Label>{label}</Label>
            {children}
        </div>
    );
}
