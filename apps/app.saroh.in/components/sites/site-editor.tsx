"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
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
import { StylePanel } from "@/components/sites/style-panel";
import { ensureFormForSection } from "@/lib/forms/actions";
import { listServicesForPicker } from "@/lib/services/actions";
import {
    publishSite,
    saveDraftSections,
    updateSiteStyle,
} from "@/lib/sites/actions";
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
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

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

/** Preview widths. The phone value is a real handset, not a breakpoint. */
const DEVICES = [
    { key: "desktop", label: "Desktop" },
    { key: "tablet", label: "Tablet" },
    { key: "phone", label: "Phone" },
] as const;
type Device = (typeof DEVICES)[number]["key"];
const DEVICE_WIDTH: Record<Device, string> = {
    desktop: "100%",
    tablet: "48rem",
    phone: "23.4375rem",
};

/**
 * A section's own words in the rail, falling back to its type.
 *
 * "Hero" five times is a list of types, not a page. The merchant recognises
 * their own heading, which is what makes the rail navigable.
 */
function sectionTitle(section: Section): string {
    const c = section.content as Record<string, unknown>;
    const candidate =
        (typeof c.heading === "string" && c.heading) ||
        (typeof c.title === "string" && c.title) ||
        (typeof c.label === "string" && c.label) ||
        "";
    return candidate.trim() || SECTION_LABELS[section.type];
}

/*
 * Field labels, as the design draws them: small, uppercase, letter-spaced and
 * muted, so a column of them reads as a quiet index rather than competing with
 * the values a merchant is actually editing.
 */
const FIELD_LABEL =
    "text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground";

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
    address,
    initialStyle,
    styleOptions,
}: {
    siteId: string;
    pageId: string;
    initialSections: Section[];
    siteName: string;
    initialStyle: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** Where this site lives, shown in the bar. Null before a subdomain exists. */
    address?: string | null;
}) {
    const [sections, setSections] = useState<Section[]>(initialSections);
    const [lastSavedJson, setLastSavedJson] = useState(() =>
        JSON.stringify(initialSections),
    );
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [errorIndex, setErrorIndex] = useState<number | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(
        initialSections.length > 0 ? 0 : null,
    );
    const [device, setDevice] = useState<Device>("desktop");
    const [rail, setRail] = useState<"sections" | "style">("sections");
    const [style, setStyle] = useState<SiteStyle>(initialStyle);
    const [styleSaving, setStyleSaving] = useState(false);
    const [savedStyleJson, setSavedStyleJson] = useState(() =>
        JSON.stringify(initialStyle),
    );
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState(false);
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

    /*
     * How many sections publishing would actually change.
     *
     * "Publish" with no number asks the merchant to trust that something
     * happened. This compares the current sections against the last SAVED
     * state, section by section, so the count describes work rather than
     * keystrokes. A length change counts the difference too — adding a section
     * is a change even though nothing was edited.
     */
    const changedCount = (() => {
        let saved: Section[];
        try {
            saved = JSON.parse(lastSavedJson) as Section[];
        } catch {
            return sections.length;
        }
        let n = Math.abs(sections.length - saved.length);
        const shared = Math.min(sections.length, saved.length);
        for (let i = 0; i < shared; i += 1) {
            if (JSON.stringify(sections[i]) !== JSON.stringify(saved[i]))
                n += 1;
        }
        return n;
    })();

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

    async function onSave(auto = false) {
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
            setLastSavedAt(new Date());
            setSaveError(false);
            // An autosave that announces itself every few seconds is noise; the
            // bar already states when it last saved.
            if (!auto) toast.success("Draft saved.");
            return;
        }
        setSaveError(true);
        if (typeof res.index === "number") {
            setErrorIndex(res.index);
            setErrorMessage(res.error);
        }
        toast.error(res.error);
    }

    /*
     * Autosave, debounced.
     *
     * The design replaces an explicit Save with "Draft changes · autosaved 2m
     * ago", which is only an improvement if failure is visible: an autosave that
     * fails silently is worse than a Save button that visibly does. The bar
     * therefore reads "Not saved" on failure and keeps the work in local state,
     * so the next edit retries.
     *
     * Publishing is blocked while dirty or saving, so a merchant can never
     * publish a state the server has not accepted.
     */
    useEffect(() => {
        if (!dirty || saving || publishing) return;
        const id = setTimeout(() => {
            void onSave(true);
        }, 1500);
        return () => clearTimeout(id);
        // `onSave` is redefined each render; depending on it would restart the
        // timer on every keystroke and never fire.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, saving, publishing, sections]);

    /*
     * Style autosave.
     *
     * Separate from the sections autosave because they are different documents
     * on different endpoints: a colour change should not have to wait behind a
     * section save, and a failed section save must not silently discard a
     * palette. Debounced longer, because dragging a slider produces a value on
     * every pixel and none of the intermediate ones is worth a request.
     */
    useEffect(() => {
        if (JSON.stringify(style) === savedStyleJson) return;
        const id = setTimeout(() => {
            const payload = style;
            setStyleSaving(true);
            void updateSiteStyle(siteId, payload).then((res) => {
                setStyleSaving(false);
                if (res.ok) {
                    setSavedStyleJson(JSON.stringify(payload));
                } else {
                    toast.error(res.error);
                }
            });
        }, 700);
        return () => clearTimeout(id);
    }, [style, savedStyleJson, siteId]);

    function resetStyle() {
        // Back to the business's own defaults — which is what the site looked
        // like before anyone touched the panel, not a Saroh default.
        const defaults: SiteStyle = {
            colours: Object.fromEntries(
                styleOptions.rows.map((r) => [r.key, r.swatches[0]?.key ?? ""]),
            ),
            scalars: Object.fromEntries(
                styleOptions.scalars.map((sc) => [sc.key, sc.default]),
            ),
        };
        setStyle(defaults);
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

    /*
     * The selected section AND its index together, so nothing downstream has to
     * assert that the index is still valid. Removing a section can leave the
     * index past the end, and carrying the pair makes that a single check here
     * rather than a non-null assertion at every use.
     */
    const active =
        selectedIndex !== null && selectedIndex < sections.length
            ? { index: selectedIndex, section: sections[selectedIndex] }
            : null;

    return (
        /*
         * Editor chrome, per the website spec §7 and its "dark on dark"
         * resolution.
         *
         * `dark` is forced rather than inherited: the spec says the editor
         * chrome is always dark regardless of theme, because entering the
         * editor is meant to feel like changing mode — and because the rendered
         * site must be the only bright object on screen. A light editor around
         * a light site loses that entirely.
         *
         * Ground and card are the SAME value (#0b0b0b), which is what "flush
         * panels — no floating cards" means: one flat plane divided by
         * hairlines (#1c1c1c), not a card stack floating on black like the
         * workspace shell.
         */
        <div
            className="dark flex h-screen flex-col bg-background text-foreground"
            style={
                {
                    // 4.31%, not 4% — 4% rounds to #0a0a0a and the spec names
                    // #0b0b0b exactly.
                    "--background": "0 0% 4.3%",
                    "--card": "0 0% 4.3%",
                    "--border": "0 0% 11%",
                } as React.CSSProperties
            }
        >
            {/*
             * Top bar. The design puts the site's identity, its state and the
             * one irreversible action on one line — a merchant should be able to
             * tell what will happen when they press Publish without scrolling.
             */}
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
                {/*
                 * "Workspace", not "Sites" — the design's wording, and the
                 * truer one: leaving the editor returns you to the whole
                 * workspace, not to a list of sites.
                 */}
                <Link
                    href="/sites"
                    className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    ← Workspace
                </Link>
                <span className="text-sm font-medium">{siteName}</span>
                {address ? (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                        {address}
                    </span>
                ) : null}

                {/*
                 * Autosave state as a PILL, as the design has it.
                 *
                 * Tinted by what it means rather than uniformly grey: a failed
                 * save and a saved draft should not look alike at a glance, and
                 * this line is the only place a merchant learns their work is
                 * safe. Grey when everything is fine, so the colour is only
                 * ever spent on something worth reading.
                 */}
                <span
                    className={cn(
                        "shrink-0 rounded-md px-2 py-1 text-xs",
                        saveError
                            ? "border border-destructive/30 bg-destructive/10 text-destructive"
                            : dirty || saving
                              ? "border border-brand/30 bg-brand-subtle text-brand-subtle-foreground"
                              : "bg-muted text-muted-foreground",
                    )}
                >
                    {saving
                        ? "Saving…"
                        : saveError
                          ? "Not saved"
                          : dirty
                            ? "Draft changes"
                            : lastSavedAt
                              ? `Draft changes · autosaved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                              : "Draft"}
                </span>

                <div className="ml-auto flex items-center gap-2">
                    {/*
                     * Device preview. §18 makes the phone co-primary for the
                     * merchant's CUSTOMERS as much as the merchant: without this
                     * a headline that wraps badly is discovered by a visitor.
                     * Width only — the preview is already local, and switching
                     * must not become a re-fetch.
                     */}
                    <div
                        role="group"
                        aria-label="Preview width"
                        className="flex overflow-hidden rounded-md border"
                    >
                        {DEVICES.map((d) => (
                            <button
                                key={d.key}
                                type="button"
                                onClick={() => setDevice(d.key)}
                                aria-pressed={device === d.key}
                                className={cn(
                                    "px-2.5 py-1 text-xs",
                                    device === d.key
                                        ? "bg-secondary text-secondary-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>

                    {/*
                     * Style opens from the BAR, not a rail tab. The design moved
                     * it there because it belongs to the whole site while the
                     * rail lists one page's sections — a tab would file a
                     * site-wide setting under a page.
                     */}
                    <Button
                        variant={rail === "style" ? "secondary" : "outline"}
                        size="sm"
                        onClick={() =>
                            setRail(rail === "style" ? "sections" : "style")
                        }
                        aria-pressed={rail === "style"}
                    >
                        Style
                    </Button>

                    <Button
                        className="wk-press"
                        variant="brand"
                        onClick={onPublish}
                        disabled={publishing || dirty || saving}
                    >
                        {publishing ? "Publishing…" : "Publish"}
                        {/*
                         * The count as a BADGE rather than in the label, as the
                         * design has it: "Publish" stays the same width whatever
                         * the number, so the button a merchant is about to press
                         * does not move under the cursor as they edit.
                         */}
                        {!publishing && changedCount > 0 ? (
                            <span className="ml-1.5 rounded bg-brand-foreground/25 px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none">
                                {changedCount}
                            </span>
                        ) : null}
                    </Button>
                </div>
            </header>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[12.5rem_15rem_minmax(0,1fr)]">
                {/* Rail — the page as a list of sections, not a wall of fields. */}
                <aside className="flex min-h-0 flex-col border-r">
                    {rail === "style" ? (
                        <StylePanel
                            style={style}
                            options={styleOptions}
                            onChange={setStyle}
                            onReset={resetStyle}
                            onBack={() => setRail("sections")}
                            saving={styleSaving}
                        />
                    ) : (
                        <>
                            {/*
                             * The design's rail carries Sections / Pages /
                             * Review. Only Sections exists, so only Sections is
                             * drawn — the same rule the workspace nav follows,
                             * and a tab leading nowhere is worse than an absent
                             * one. The TREATMENT is the design's, so the others
                             * drop in beside it when #193 lands.
                             */}
                            <div
                                role="tablist"
                                aria-label="Editor panels"
                                className="flex items-center gap-1 border-b px-2 py-1.5"
                            >
                                <span
                                    role="tab"
                                    aria-selected="true"
                                    className="rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
                                >
                                    Sections
                                </span>
                            </div>
                            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                                {sections.map((section, index) => (
                                    <li key={index}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedIndex(index)
                                            }
                                            className={cn(
                                                "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
                                                selectedIndex === index
                                                    ? "bg-secondary"
                                                    : "hover:bg-muted",
                                                errorIndex === index &&
                                                    "text-destructive",
                                            )}
                                        >
                                            <span className="truncate">
                                                {sectionTitle(section)}
                                            </span>
                                            <span className="shrink-0 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                                                {SECTION_LABELS[section.type]}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                {sections.length === 0 ? (
                                    <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                                        No sections yet.
                                    </li>
                                ) : null}
                            </ul>
                            <div className="p-2">
                                {/*
                                 * The design draws this as a dashed outline
                                 * spanning the rail — reading as a slot waiting
                                 * to be filled rather than another row in the
                                 * list, which is what it is. Still a disclosure:
                                 * the type picker only matters once you have
                                 * decided to add something.
                                 */}
                                <details className="group">
                                    <summary className="cursor-pointer list-none rounded-md border border-dashed px-2 py-2 text-center text-sm text-muted-foreground transition-colors hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        + Add section
                                    </summary>
                                    <div className="flex flex-wrap gap-1 px-2 pt-2">
                                        {SECTION_ORDER.map((type) => (
                                            <Button
                                                key={type}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    addSection(type);
                                                    setSelectedIndex(
                                                        sections.length,
                                                    );
                                                }}
                                            >
                                                {SECTION_LABELS[type]}
                                            </Button>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </>
                    )}
                </aside>

                {/* Field panel — one section at a time. */}
                <div className="min-h-0 overflow-y-auto border-r p-4">
                    {active ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold">
                                    {SECTION_LABELS[active.section.type]}
                                </h2>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Move section up"
                                        disabled={active.index === 0}
                                        onClick={() => {
                                            move(active.index, -1);
                                            setSelectedIndex(active.index - 1);
                                        }}
                                    >
                                        ↑
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Move section down"
                                        disabled={
                                            active.index === sections.length - 1
                                        }
                                        onClick={() => {
                                            move(active.index, 1);
                                            setSelectedIndex(active.index + 1);
                                        }}
                                    >
                                        ↓
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            removeAt(active.index);
                                            setSelectedIndex(null);
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>

                            <SectionFields
                                section={active.section}
                                services={services}
                                onChange={(next) =>
                                    replaceAt(active.index, next)
                                }
                            />

                            <SectionPadding
                                section={active.section}
                                siteDefault={style.scalars.sectionPadding}
                                bounds={styleOptions.scalars.find(
                                    (sc) => sc.key === "sectionPadding",
                                )}
                                onChange={(next) =>
                                    replaceAt(active.index, next)
                                }
                            />

                            {errorIndex === active.index && errorMessage ? (
                                <p className="text-sm text-destructive">
                                    {errorMessage}
                                </p>
                            ) : null}

                            {/*
                             * The design closes the field panel by saying where
                             * editing does NOT happen. Worth keeping: a merchant
                             * who expects to change a price here would otherwise
                             * hunt for a field that is deliberately absent,
                             * because those values belong to the modules that
                             * own them.
                             */}
                            <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                                Written copy edits here and in the preview at
                                the same time. Prices, dates and stock come from
                                the workspace and change there.
                            </p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Pick a section on the left to edit it. Changes
                            appear in the preview as you type.
                        </p>
                    )}
                </div>

                {/*
                 * Preview — width changes, data does not.
                 *
                 * The canvas ground is the SAME #0b0b0b as the chrome (spec §7),
                 * not a lighter tray. A raised panel here would make the canvas
                 * a second bright object competing with the one that matters:
                 * the rendered site.
                 */}
                <div className="min-h-0 overflow-y-auto bg-background p-6">
                    <div
                        className="mx-auto transition-[max-width]"
                        style={{ maxWidth: DEVICE_WIDTH[device] }}
                    >
                        <DraftPreview
                            sections={sections}
                            style={style}
                            styleOptions={styleOptions}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Per-type field editor. Narrowing on `section.type` gives the exact shape. */
/**
 * A section's own padding, overriding the site setting (#189).
 *
 * Lives at the bottom of every section's field panel, as the design has it,
 * because it belongs to this section rather than to the site — the site-wide
 * value is in the Style panel, and putting both in one place would make it
 * unclear which one a merchant was changing.
 *
 * The default state is "Following the site setting", showing the value it is
 * following. That matters: a slider sitting at 52 with no other information
 * looks like a decision someone made about THIS section, when in fact nothing
 * has been decided and moving the site slider will still move it.
 */
function SectionPadding({
    section,
    siteDefault,
    bounds,
    onChange,
}: {
    section: Section;
    siteDefault: number;
    bounds:
        { min: number; max: number; step: number; default: number } | undefined;
    onChange: (next: Section) => void;
}) {
    // Bounds come from the same served options as the site slider, so an
    // override can never reach a spacing the site setting could not.
    const min = bounds?.min ?? 24;
    const max = bounds?.max ?? 96;
    const step = bounds?.step ?? 1;

    const override = section.content.padding;
    const following = override === undefined;
    const shown = override ?? siteDefault;

    function set(padding: number | undefined) {
        // Deleting the key rather than storing null: the contract treats ABSENT
        // as "follow the site", and a null would have to be special-cased in
        // every reader.
        const content = { ...section.content } as Record<string, unknown>;
        if (padding === undefined) delete content.padding;
        else content.padding = padding;
        onChange({ ...section, content } as Section);
    }

    return (
        <div className="space-y-1 border-t pt-4">
            <Label htmlFor="section-padding" className={FIELD_LABEL}>
                Padding
            </Label>
            {/*
             * The state on its own line under the label, as the design has it:
             * "Following the site setting" is a sentence, and squeezing it
             * beside the label pushed the number that actually matters out to
             * the far edge.
             */}
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    {following ? "Following the site setting" : "This section"}
                </span>
                <span className="text-xs tabular-nums">{shown}px</span>
            </div>
            <input
                id="section-padding"
                type="range"
                min={min}
                max={max}
                step={step}
                value={shown}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full accent-foreground"
            />
            {!following && (
                <button
                    type="button"
                    onClick={() => set(undefined)}
                    className="rounded text-left text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Follow the site setting
                </button>
            )}
        </div>
    );
}

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
                        <Label className={FIELD_LABEL}>Fields</Label>
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
            <Label className={FIELD_LABEL}>{label}</Label>
            {children}
        </div>
    );
}
