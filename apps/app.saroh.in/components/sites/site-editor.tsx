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
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DraftPreview } from "@/components/sites/section-preview";
import { ensureFormForSection } from "@/lib/forms/actions";
import { listServicesForPicker } from "@/lib/services/actions";
import { publishSite, saveDraftSections } from "@/lib/sites/actions";
import type {
    BookingContent,
    CtaStyle,
    CtaValue,
    EnquiryContent,
    EnquiryField,
    EnquiryFieldType,
    GalleryLayout,
    HeroContent,
    ImageValue,
    RichTextContent,
    Section,
    SectionType,
} from "@/lib/sites/service";

/** A service as offered in the booking-section picker. */
interface ServiceOption {
    id: string;
    name: string;
    status: "ACTIVE" | "ARCHIVED";
}

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
    enquiry: "Enquiry form",
    booking: "Booking",
};

const SECTION_ORDER: SectionType[] = [
    "hero",
    "richText",
    "cta",
    "gallery",
    "enquiry",
    "booking",
];

/** The field types an enquiry field may take, with author-facing labels. */
const ENQUIRY_FIELD_TYPES: { value: EnquiryFieldType; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "email", label: "Email" },
    { value: "tel", label: "Phone" },
    { value: "textarea", label: "Long text" },
];

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
        case "enquiry":
            return {
                type,
                contractVersion: 1,
                content: {
                    title: "Get in touch",
                    submitLabel: "Send",
                    successMessage: "Thanks — we'll be in touch soon.",
                    // Seed with an email field: the contract + the backing Form
                    // both require one, so the section is valid out of the box.
                    fields: [
                        {
                            name: "email",
                            label: "Email",
                            type: "email",
                            required: true,
                        },
                    ],
                },
            };
        case "booking":
            return {
                type,
                contractVersion: 1,
                content: {
                    title: "Book a time",
                    submitLabel: "Confirm booking",
                    successMessage:
                        "You're booked — we've sent a confirmation to your email.",
                },
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
    // The org's services for the booking-section picker. Loaded once on mount;
    // Services are authored in the service editor, never inline here.
    const [services, setServices] = useState<ServiceOption[]>([]);

    useEffect(() => {
        let active = true;
        listServicesForPicker()
            .then((list) => {
                if (active) setServices(list);
            })
            .catch(() => {
                /* leave the picker empty on failure */
            });
        return () => {
            active = false;
        };
    }, []);

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

    /**
     * Sync each enquiry section's backing Form to its authored fields before
     * saving, writing the returned `formId` back into the section content. The
     * PUBLIC submit endpoint validates against that Form, so the two MUST stay
     * in sync. On any failure (including a missing active org) the offending
     * section index + message are surfaced and the save is aborted.
     */
    async function syncEnquiryForms(
        current: Section[],
    ): Promise<
        | { ok: true; sections: Section[] }
        | { ok: false; index: number; error: string }
    > {
        const next = [...current];
        for (let i = 0; i < next.length; i++) {
            const section = next[i];
            if (section.type !== "enquiry") continue;
            const content = section.content;
            const res = await ensureFormForSection({
                formId: content.formId,
                name:
                    [content.title?.trim()].find((s) => s) ??
                    `${siteName} enquiry`,
                fields: content.fields,
            });
            if (!res.ok) {
                return { ok: false, index: i, error: res.error };
            }
            next[i] = {
                ...section,
                content: { ...content, formId: res.data.formId },
            };
        }
        return { ok: true, sections: next };
    }

    async function onSave() {
        setSaving(true);
        setErrorIndex(null);
        setErrorMessage(null);

        // Keep every enquiry section's Form in sync first — this stamps the
        // returned formId into the content we then persist + publish.
        const synced = await syncEnquiryForms(sections);
        if (!synced.ok) {
            setSaving(false);
            setErrorIndex(synced.index);
            setErrorMessage(synced.error);
            toast.error(synced.error);
            return;
        }
        if (JSON.stringify(synced.sections) !== JSON.stringify(sections)) {
            setSections(synced.sections);
        }

        const res = await saveDraftSections(siteId, pageId, synced.sections);
        setSaving(false);
        if (res.ok) {
            setLastSavedJson(JSON.stringify(synced.sections));
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
                        className="wk-press"
                        onClick={onSave}
                        disabled={saving || !dirty}
                    >
                        {saving ? "Saving…" : "Save draft"}
                    </Button>
                    <Button
                        className="wk-press"
                        onClick={onPublish}
                        disabled={publishing || dirty}
                    >
                        {publishing ? "Publishing…" : "Publish"}
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                {/* Editor */}
                <div className="space-y-4">
                    {sections.length === 0 && (
                        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No sections yet. Add one below to start building the
                            page.
                        </p>
                    )}

                    {sections.map((section, index) => (
                        <div
                            key={index}
                            className={
                                "rounded-xl border p-4" +
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
                                services={services}
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
    services,
    onChange,
}: {
    section: Section;
    services: ServiceOption[];
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
        case "enquiry": {
            const c = section.content;
            const patch = (next: Partial<EnquiryContent>) =>
                onChange({ ...section, content: { ...c, ...next } });
            const setFields = (fields: EnquiryField[]) =>
                onChange({ ...section, content: { ...c, fields } });
            const patchField = (i: number, next: Partial<EnquiryField>) =>
                setFields(
                    c.fields.map((f, idx) =>
                        idx === i ? { ...f, ...next } : f,
                    ),
                );
            return (
                <div className="grid gap-3">
                    <Field label="Title">
                        <Input
                            value={c.title ?? ""}
                            onChange={(e) => patch({ title: e.target.value })}
                            placeholder="Get in touch"
                        />
                    </Field>
                    <Field label="Description">
                        <Textarea
                            value={c.description ?? ""}
                            onChange={(e) =>
                                patch({ description: e.target.value })
                            }
                            rows={2}
                            placeholder="Tell us what you need and we'll reply."
                        />
                    </Field>
                    <Field label="Submit button label">
                        <Input
                            value={c.submitLabel ?? ""}
                            onChange={(e) =>
                                patch({ submitLabel: e.target.value })
                            }
                            placeholder="Send"
                        />
                    </Field>
                    <Field label="Success message">
                        <Input
                            value={c.successMessage ?? ""}
                            onChange={(e) =>
                                patch({ successMessage: e.target.value })
                            }
                            placeholder="Thanks — we'll be in touch soon."
                        />
                    </Field>
                    <div className="grid gap-2">
                        <Label>Fields</Label>
                        <p className="text-xs text-muted-foreground">
                            Include at least one email field — it identifies the
                            person who enquired.
                        </p>
                        {c.fields.map((field, i) => (
                            <div
                                key={i}
                                className="grid gap-2 rounded-md border p-2"
                            >
                                <div className="flex items-start gap-2">
                                    <Input
                                        value={field.name}
                                        onChange={(e) =>
                                            patchField(i, {
                                                name: e.target.value,
                                            })
                                        }
                                        placeholder="Field name (email)"
                                        aria-label="Field name"
                                    />
                                    <Input
                                        value={field.label}
                                        onChange={(e) =>
                                            patchField(i, {
                                                label: e.target.value,
                                            })
                                        }
                                        placeholder="Label (Email)"
                                        aria-label="Field label"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Remove field"
                                        onClick={() =>
                                            setFields(
                                                c.fields.filter(
                                                    (_, idx) => idx !== i,
                                                ),
                                            )
                                        }
                                    >
                                        ✕
                                    </Button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-40">
                                        <Select
                                            value={field.type}
                                            onValueChange={(v) =>
                                                patchField(i, {
                                                    type: v as EnquiryFieldType,
                                                })
                                            }
                                        >
                                            <SelectTrigger aria-label="Field type">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ENQUIRY_FIELD_TYPES.map(
                                                    (t) => (
                                                        <SelectItem
                                                            key={t.value}
                                                            value={t.value}
                                                        >
                                                            {t.label}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={field.required ?? false}
                                            onChange={(e) =>
                                                patchField(i, {
                                                    required: e.target.checked,
                                                })
                                            }
                                        />
                                        Required
                                    </label>
                                </div>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-self-start"
                            onClick={() =>
                                setFields([
                                    ...c.fields,
                                    {
                                        name: "",
                                        label: "",
                                        type: "text",
                                    },
                                ])
                            }
                        >
                            + Field
                        </Button>
                    </div>
                </div>
            );
        }
        case "booking": {
            const c = section.content;
            const patch = (next: Partial<BookingContent>) =>
                onChange({ ...section, content: { ...c, ...next } });
            // Prefer active services, but keep a currently-selected archived one
            // visible so the author sees what's set.
            const options = services.filter(
                (s) => s.status === "ACTIVE" || s.id === c.serviceId,
            );
            const selectedMissing =
                c.serviceId !== undefined &&
                !services.some((s) => s.id === c.serviceId);
            return (
                <div className="grid gap-3">
                    <Field label="Service">
                        {services.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No services yet.{" "}
                                <Link
                                    href="/services/new"
                                    className="underline hover:text-foreground"
                                >
                                    Create a service
                                </Link>{" "}
                                first, then pick it here.
                            </p>
                        ) : (
                            <Select
                                value={c.serviceId ?? ""}
                                onValueChange={(v) => patch({ serviceId: v })}
                            >
                                <SelectTrigger aria-label="Service">
                                    <SelectValue placeholder="Choose a service" />
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                            {s.status === "ARCHIVED"
                                                ? " (archived)"
                                                : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {selectedMissing && (
                            <p className="text-xs text-muted-foreground">
                                The selected service is no longer available —
                                choose another.
                            </p>
                        )}
                    </Field>
                    <Field label="Title">
                        <Input
                            value={c.title ?? ""}
                            onChange={(e) => patch({ title: e.target.value })}
                            placeholder="Book a time"
                        />
                    </Field>
                    <Field label="Description">
                        <Textarea
                            value={c.description ?? ""}
                            onChange={(e) =>
                                patch({ description: e.target.value })
                            }
                            rows={2}
                            placeholder="Pick a slot that suits you and we'll confirm by email."
                        />
                    </Field>
                    <Field label="Submit button label">
                        <Input
                            value={c.submitLabel ?? ""}
                            onChange={(e) =>
                                patch({ submitLabel: e.target.value })
                            }
                            placeholder="Confirm booking"
                        />
                    </Field>
                    <Field label="Success message">
                        <Input
                            value={c.successMessage ?? ""}
                            onChange={(e) =>
                                patch({ successMessage: e.target.value })
                            }
                            placeholder="You're booked — check your email."
                        />
                    </Field>
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
