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
import { useRouter } from "next/navigation";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/components/sites/media-picker";
import dynamic from "next/dynamic";

/*
 * Loaded on demand. Tiptap is the largest dependency this app takes on, and
 * only the editor route needs it — the sites list and settings must not pay
 * for it. `ssr: false` because the editor exists only in the browser.
 */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-40 animate-pulse rounded-md border bg-muted" />
        ),
    },
);

import { PagesPanel } from "@/components/sites/pages-panel";
import { PrePublishCheck } from "@/components/sites/pre-publish-check";
import { ReviewPanel } from "@/components/sites/review-panel";
import { DraftPreview } from "@/components/sites/section-preview";
import { StylePanel } from "@/components/sites/style-panel";
import { ensureFormForSection } from "@/lib/forms/actions";
import { listServicesForPicker } from "@/lib/services/actions";
import {
    getReviewState,
    getSiteFlags,
    listComments,
    publishSite,
    saveDraftSections,
    updateSiteStyle,
} from "@/lib/sites/actions";
import {
    getChrome,
    getChromeOnServer,
    getPlace,
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    placeOnServer,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
    setChrome,
    setPlace,
    subscribe,
} from "@/lib/sites/editor-prefs";
import { exactDate } from "@/lib/sites/format-date";
import type {
    BookingContent,
    CtaAction,
    CtaKind,
    CtaStyle,
    CtaValue,
    EnquiryContent,
    EnquiryField,
    EnquiryFieldType,
    Flag,
    GalleryLayout,
    HeroContent,
    ImageValue,
    ReviewState,
    RichTextContent,
    Section,
    SectionType,
    SiteCommentView,
    SiteFlags,
    SitePage,
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

/**
 * The rail's tabs. One definition, used by both panels it switches between —
 * two copies of a tablist is two chances for the selected state to disagree
 * with what is actually showing.
 *
 * All three tabs lead somewhere. Review was absent while it was unbuilt — a tab
 * leading nowhere is worse than one that is not there — and it earned its place
 * when the notes and the approval landed behind it.
 */
function RailTabs({
    rail,
    onSelect,
    openNotes,
}: {
    rail: "sections" | "pages" | "review" | "style";
    onSelect: (tab: "sections" | "pages" | "review") => void;
    /** Shown on the Review tab when notes are open. */
    openNotes: number;
}) {
    return (
        <div
            role="tablist"
            aria-label="Editor panels"
            className="flex items-center gap-1 border-b px-2 py-1.5"
        >
            {(["sections", "pages", "review"] as const).map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={rail === tab}
                    onClick={() => onSelect(tab)}
                    className={cn(
                        "rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
                        rail === tab
                            ? "bg-secondary text-secondary-foreground"
                            : // Pressing shows the surface the tab is about to
                              // settle on. This is feedback on the PRESS, not an
                              // animation of the switch — the switch itself stays
                              // instant, because it happens dozens of times a
                              // session and anything staged would make the rail
                              // feel slower than it is.
                              "text-muted-foreground hover:text-foreground active:bg-secondary/60 active:text-secondary-foreground",
                    )}
                >
                    {tab}
                    {/*
                     * The count rides the tab rather than a separate badge:
                     * the number only means anything next to the word it
                     * counts, and the rail has no room for both.
                     */}
                    {tab === "review" && openNotes > 0 ? (
                        <span className="ml-1 tabular-nums text-[#c99f6f]">
                            {openNotes}
                        </span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}

/**
 * A draggable hairline between two panels.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a touch
 * screen all work, and pointer CAPTURE so a fast drag that outruns the 1px
 * line keeps resizing instead of stopping dead. Double-click resets, which the
 * spec asks for and which is the only cheap way back from a width that turned
 * out to be wrong.
 *
 * It is also a real control for the keyboard: a separator that can only be
 * dragged is a separator half the people using it cannot move at all.
 */
function PanelDivider({
    label,
    width,
    min,
    max,
    reset,
    onResize,
    onNudge,
}: {
    label: string;
    width: number;
    min: number;
    max: number;
    reset: number;
    /** Absolute target width, for the drag. */
    onResize: (px: number) => void;
    /**
     * A RELATIVE step, for the keyboard. Deliberately not `onResize(width + n)`:
     * `width` is this render's prop, so a burst of key events arriving before
     * React re-renders would each compute from the same stale number and only
     * the last would count. A delta is applied against whatever the store
     * currently holds, so every press lands.
     */
    onNudge: (delta: number) => void;
}) {
    const start = useRef<{ x: number; width: number } | null>(null);

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            onPointerDown={(e) => {
                start.current = { x: e.clientX, width };
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
                const from = start.current;
                if (from === null) return;
                onResize(from.width + (e.clientX - from.x));
            }}
            onPointerUp={(e) => {
                start.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onDoubleClick={() => onResize(reset)}
            onKeyDown={(e) => {
                // 16px a press is roughly a visible step without being so
                // coarse that the useful widths fall between two presses.
                if (e.key === "ArrowLeft") onNudge(-16);
                else if (e.key === "ArrowRight") onNudge(16);
                else if (e.key === "Home") onResize(reset);
                else return;
                e.preventDefault();
            }}
            /*
             * 1px of line, 9px of target. `after` widens what the pointer can
             * hit without widening what the eye sees — a hairline you have to
             * hit exactly is a hairline nobody moves twice.
             */
            className="relative hidden cursor-col-resize bg-border after:absolute after:inset-y-0 after:-left-1 after:w-[9px] after:content-[''] hover:bg-ring focus-visible:bg-ring focus-visible:outline-none lg:block"
        />
    );
}

/** Preview widths. The phone value is a real handset, not a breakpoint. */
const DEVICES = [
    { key: "desktop", label: "Desktop" },
    { key: "tablet", label: "Tablet" },
    { key: "phone", label: "Phone" },
] as const;
type Device = (typeof DEVICES)[number]["key"];
/** Zoom steps. "fit" is computed; the rest are literal percentages (spec §2). */
type Zoom = 50 | 75 | 100 | "fit";
const ZOOMS: Zoom[] = [50, 75, 100, "fit"];

/**
 * The same widths in pixels, for the Fit calculation. Desktop is null because
 * it has no fixed width — it already takes whatever the canvas gives it, so
 * there is nothing to scale down to make it fit.
 */
const DEVICE_PX: Record<Device, number | null> = {
    desktop: null,
    tablet: 768,
    phone: 375,
};

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
    "text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground";

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
                contractVersion: 2,
                content: {
                    label: "",
                    action: { kind: "url", href: "" },
                    style: "primary",
                },
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

/**
 * Read a button's action, lifting a v1 `href` on the way (#207).
 *
 * A v1 button had only an address. Read as `{ kind: "url", href }` it is the
 * same button with its intent named, and saving it back writes v2 — which is
 * why the callers below bump `contractVersion` when they write an action. A
 * button is never rewritten just by being looked at: the lift is applied on
 * the first EDIT, so an untouched v1 section stays exactly as it was.
 */
function actionOf(cta: CtaValue | undefined): CtaAction {
    if (cta?.action) return cta.action;
    return { kind: "url", href: cta?.href ?? "" };
}

const CTA_KINDS: { value: CtaKind; label: string }[] = [
    { value: "page", label: "Open a page on this site" },
    { value: "url", label: "Open a web address" },
    { value: "call", label: "Call a phone number" },
    { value: "whatsapp", label: "Message on WhatsApp" },
    { value: "email", label: "Send an email" },
];

/** A blank action of the given kind, for when the merchant switches kinds. */
function blankAction(kind: CtaKind, homePageId: string | undefined): CtaAction {
    switch (kind) {
        case "page":
            return { kind, pageId: homePageId ?? "" };
        case "url":
            return { kind, href: "" };
        case "call":
            return { kind, number: "" };
        case "whatsapp":
            return { kind, number: "" };
        case "email":
            return { kind, address: "" };
    }
}

/**
 * What a button does, and the one thing that kind needs (#207).
 *
 * Choosing the action changes what is asked for. A page is PICKED from the
 * site's pages rather than typed as a path — that is what turns "points at a
 * page that is not on this site" from a warning into something that cannot
 * be authored. A phone number is typed as people type them; the publisher
 * normalises it.
 */
function CtaActionFields({
    action,
    pages,
    onChange,
}: {
    action: CtaAction;
    pages: SitePage[];
    onChange: (next: CtaAction) => void;
}) {
    const home = pages.find((p) => p.isHome)?.id;
    return (
        <>
            <Field label="When pressed">
                <Select
                    value={action.kind}
                    onValueChange={(v) =>
                        onChange(blankAction(v as CtaKind, home))
                    }
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CTA_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                                {k.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {action.kind === "page" ? (
                <Field label="Page">
                    <Select
                        value={action.pageId}
                        onValueChange={(v) =>
                            onChange({ kind: "page", pageId: v })
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a page" />
                        </SelectTrigger>
                        <SelectContent>
                            {pages
                                .filter((p) => !p.hidden)
                                .map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.title}
                                        <span className="ml-2 font-mono text-[0.6875rem] text-muted-foreground">
                                            {p.path}
                                        </span>
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : null}
            {action.kind === "url" ? (
                <Field label="Address">
                    <Input
                        value={action.href}
                        onChange={(e) =>
                            onChange({ kind: "url", href: e.target.value })
                        }
                        placeholder="https://…"
                        inputMode="url"
                    />
                </Field>
            ) : null}
            {action.kind === "call" || action.kind === "whatsapp" ? (
                <Field label="Phone number">
                    <Input
                        value={action.number}
                        onChange={(e) =>
                            onChange({ ...action, number: e.target.value })
                        }
                        placeholder="+91 98450 12345"
                        inputMode="tel"
                    />
                </Field>
            ) : null}
            {action.kind === "whatsapp" ? (
                <Field label="Message to start with">
                    <Input
                        value={action.message ?? ""}
                        onChange={(e) =>
                            onChange({
                                ...action,
                                message: e.target.value || undefined,
                            })
                        }
                        placeholder="Hi, I'd like to ask about…"
                    />
                </Field>
            ) : null}
            {action.kind === "email" ? (
                <>
                    <Field label="Email address">
                        <Input
                            value={action.address}
                            onChange={(e) =>
                                onChange({ ...action, address: e.target.value })
                            }
                            placeholder="hello@example.in"
                            inputMode="email"
                        />
                    </Field>
                    <Field label="Subject">
                        <Input
                            value={action.subject ?? ""}
                            onChange={(e) =>
                                onChange({
                                    ...action,
                                    subject: e.target.value || undefined,
                                })
                            }
                            placeholder="Optional"
                        />
                    </Field>
                </>
            ) : null}
        </>
    );
}

/** Build a hero image, or undefined when there is no source. */
function buildImage(src: string, alt: string): ImageValue | undefined {
    if (!src.trim()) return undefined;
    return { src, alt: alt.trim() || undefined };
}

export function SiteEditor({
    siteId,
    pageId,
    pages,
    initialFlags,
    initialComments,
    initialReview,
    neverPublished,
    initialPendingChanges,
    initialSections,
    siteName,
    address,
    initialStyle,
    styleOptions,
}: {
    siteId: string;
    pageId: string;
    /** Every page on this site, for the Pages tab. */
    pages: SitePage[];
    /** The site's advisory flags, as the server computed them. */
    initialFlags: SiteFlags;
    /** Reviewer notes and the latest verdict (#193). */
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
    /** Never-published sites say "Publish site", not "Publish changes". */
    neverPublished: boolean;
    /**
     * How many sections publishing would change, as the server counted it on
     * load (#190). Null before the first publish. Refreshed by every autosave.
     */
    initialPendingChanges: number | null;
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
    const router = useRouter();
    const [publishing, setPublishing] = useState(false);
    /*
     * Flags come from the server and settle after each save rather than
     * updating per keystroke. The spec calls them "quiet until publish", and a
     * dot that flickers as you type is the opposite of quiet — it also keeps
     * one implementation of nine rules instead of two that can disagree.
     */
    const [siteFlags, setSiteFlags] = useState<SiteFlags>(initialFlags);
    /*
     * How many sections publishing would change (#190).
     *
     * The SERVER's number, not one this component works out. It is a diff
     * between the draft and the live publication, and the browser holds only
     * the page it is editing — so a count computed here would speak for one
     * page while the button it sits beside publishes the whole site. Refreshed
     * from each save's response, which is why it is state rather than a prop.
     *
     * Null until the site has published once; the button says "Publish site"
     * in that case and there is no count to give.
     */
    const [pendingChanges, setPendingChanges] = useState<number | null>(
        initialPendingChanges,
    );
    const [checking, setChecking] = useState(false);
    const [comments, setComments] =
        useState<SiteCommentView[]>(initialComments);
    const [review, setReview] = useState<ReviewState>(initialReview);
    const openNotes = review.openNotes;

    /** Re-read notes and the verdict together — they move together. */
    async function refreshReview() {
        const [next, state] = await Promise.all([
            listComments(siteId),
            getReviewState(siteId),
        ]);
        setComments(next);
        setReview(state);
    }

    /** Re-read flags from the server. They settle after a save, not per key. */
    async function refreshFlags() {
        setSiteFlags(await getSiteFlags(siteId));
    }

    const [errorIndex, setErrorIndex] = useState<number | null>(null);
    /*
     * Panel widths, device and place come from the preferences store rather
     * than component state: they belong to the browser, outlive this mount,
     * and the server has no business guessing them. `useSyncExternalStore`
     * renders the server snapshot (the defaults) during hydration and swaps to
     * the stored values before paint, so the markup matches what was sent and
     * nothing visibly jumps from 200px to whatever the merchant chose.
     */
    const chrome = useSyncExternalStore(
        subscribe,
        getChrome,
        getChromeOnServer,
    );
    const { railWidth, panelWidth, device } = chrome;

    // The section count is what makes a remembered index meaningful, so it is
    // bound into both snapshots rather than read inside the store.
    const initialCount = initialSections.length;
    // Held stable because useSyncExternalStore compares snapshots by identity.
    const serverPlace = useMemo(
        () => placeOnServer(initialCount),
        [initialCount],
    );
    const place = useSyncExternalStore(
        subscribe,
        () => getPlace(siteId, initialCount),
        () => serverPlace,
    );
    const { selectedIndex, rail } = place;

    // Setters that keep every call site below unchanged. Writing through the
    // store is what makes the choice survive a reload; the re-render is the
    // store's notification, not a second source of truth.
    const setRailWidth = (px: number) => setChrome({ railWidth: px });
    const setPanelWidth = (px: number) => setChrome({ panelWidth: px });
    // Relative steps read the store, not this render, so they accumulate.
    const nudgeRail = (d: number) =>
        setChrome({ railWidth: getChrome().railWidth + d });
    const nudgePanel = (d: number) =>
        setChrome({ panelWidth: getChrome().panelWidth + d });
    const setDevice = (next: Device) => {
        setChrome({ device: next });
        // The dip lasts as long as the width transition it accompanies.
        setSwitching(true);
        setTimeout(() => setSwitching(false), 300);
    };
    const setSelectedIndex = (next: number | null) =>
        setPlace(siteId, initialCount, { selectedIndex: next });
    const setRail = (next: "sections" | "pages" | "review" | "style") =>
        setPlace(siteId, initialCount, { rail: next });

    /*
     * "Zoom is the readout dropdown only — 50 / 75 / 100 / Fit. No ⌘scroll, no
     * pinch, no keyboard shortcuts." The spec resolved a contradiction by
     * making the readout the control, so there is deliberately no gesture here.
     */
    const [zoom, setZoom] = useState<Zoom>(100);
    /** Briefly dimmed while a device switch animates — the cross-fade. */
    const [switching, setSwitching] = useState(false);
    /** Full-screen preview: everything else hides, Escape returns (spec §2). */
    const [fullScreen, setFullScreen] = useState(false);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const scrollWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

    /*
     * "Fit" is the only value that is not a fixed percentage: it scales the
     * frame down until it fits the canvas, and never scales it UP — a phone
     * frame blown up to fill a desktop canvas would stop being a preview of a
     * phone.
     */
    const [fitScale, setFitScale] = useState(1);
    const zoomScale = zoom === "fit" ? Math.min(1, fitScale) : zoom / 100;
    useEffect(() => {
        const el = canvasRef.current;
        if (el === null) return;
        const measure = () => {
            const frame = DEVICE_PX[device];
            // The canvas padding (p-6 = 24px each side) is not usable width.
            const usable = el.clientWidth - 48;
            setFitScale(frame === null ? 1 : usable / frame);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [device]);

    /*
     * Restore where the merchant was scrolled to. Mount-only: re-running it on
     * a later change would yank the canvas back mid-scroll, and the stored
     * value is already being kept up to date by the handler below.
     */
    useEffect(() => {
        const el = canvasRef.current;
        if (el === null) return;
        el.scrollTop = place.scrollTop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!fullScreen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFullScreen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [fullScreen]);
    /*
     * Drag state. `dragIndex` is the row being carried, `dropIndex` the row it
     * would land on — kept apart so the source can dim while the target draws
     * its own outline, and so an abandoned drag clears both.
     */
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
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
        moveTo(index, index + delta);
    }

    /**
     * Move a section to an absolute position. The arrows and the drag both
     * land here so there is one definition of what reordering means, and the
     * array order IS the saved order — the API persists `order = index`.
     */
    function moveTo(from: number, to: number) {
        setSections((prev) => {
            if (to < 0 || to >= prev.length || from === to) return prev;
            const next = [...prev];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        });
    }

    /**
     * Hide or show a section. Hiding is not deleting: the section keeps its
     * place and its copy, and publish leaves it out of the snapshot. That is
     * the whole point — a merchant can take a section off the live site
     * without losing the work that went into it.
     */
    function toggleHidden(index: number) {
        setSections((prev) =>
            prev.map((s, i) => (i === index ? { ...s, hidden: !s.hidden } : s)),
        );
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

        /*
         * A thrown save is a DIFFERENT failure from a rejected one, and it was
         * the only one not handled. The service returns { ok: false } for
         * anything the api answered — but if the api is unreachable the fetch
         * rejects, the await throws, and `setSaving(false)` below never ran:
         * the bar sat on "Saving…" for ever while the work stayed unsaved.
         *
         * The editor's own rule is that an autosave failing silently is worse
         * than a Save button that visibly fails. An outage has to look like a
         * failure, and the retry is the next edit.
         */
        const res = await saveDraftSections(
            siteId,
            pageId,
            synced.sections,
        ).catch(() => ({
            ok: false as const,
            error: "Could not reach Saroh — your work is still here. It will save again with your next edit.",
        }));
        setSaving(false);
        if (res.ok) {
            setLastSavedJson(JSON.stringify(synced.sections));
            setLastSavedAt(new Date());
            setSaveError(false);
            // The save recounted what publishing would change; take its answer
            // rather than guessing at one from what was just sent.
            setPendingChanges(res.data.pendingSectionChanges ?? null);
            // An autosave that announces itself every few seconds is noise; the
            // bar already states when it last saved.
            if (!auto) toast.success("Draft saved.");
            /*
             * The flags settle here — after the save, not on every keystroke.
             * Deliberately not awaited: the dots catching up a moment later is
             * fine, and blocking the save's completion on an advisory check
             * would make editing feel slower for no benefit.
             */
            void refreshFlags();
            return;
        }
        setSaveError(true);
        if ("index" in res && typeof res.index === "number") {
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

    /**
     * Publishing goes through the pre-publish check first — the spec makes it
     * "its own moment before going live", not a button that fires immediately.
     * The check itself never refuses: every flag is advisory, so the merchant
     * can read them and publish anyway from the same screen.
     */
    async function openCheck() {
        if (dirty) {
            toast.error("You have unsaved changes — save the draft first.");
            return;
        }
        setChecking(true);
        // Re-read rather than trusting what was loaded: the merchant may have
        // been editing for an hour, and a stale check is worse than none.
        await refreshFlags();
    }

    async function onPublish() {
        setPublishing(true);
        const res = await publishSite(siteId);
        setPublishing(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setChecking(false);
        /*
         * The live state names the business and its address, per the spec —
         * "Flour & Ferment is live at flour-and-ferment.saroh.app". A bare
         * "Published" leaves the merchant to go and check what happened.
         */
        toast.success(
            address === null || address === undefined
                ? `${siteName} is live.`
                : `${siteName} is live at ${address}.`,
        );
        await refreshFlags();
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

    /*
     * Flags for the page currently open, indexed by section. The server sends
     * flags for the whole site; the rail can only draw dots for the sections it
     * is showing.
     */
    const flagsBySection = new Map<number, Flag[]>();
    for (const flag of siteFlags.flags) {
        if (flag.pageId !== pageId || flag.sectionIndex === null) continue;
        const list = flagsBySection.get(flag.sectionIndex) ?? [];
        list.push(flag);
        flagsBySection.set(flag.sectionIndex, list);
    }
    const activeFlags =
        active === null ? [] : (flagsBySection.get(active.index) ?? []);

    /*
     * Section keys on this page carrying an unresolved note. The issue asks
     * for it directly: "the section list should show which sections carry
     * unresolved ones." Resolved notes do not mark anything — a settled note
     * is history, and a dot for it would never go out.
     */
    const notedKeys = new Set(
        comments
            .filter(
                (c) =>
                    c.pageId === pageId && c.resolvedAt === null && !c.orphaned,
            )
            .map((c) => c.sectionKey),
    );

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
            <header className="flex h-[52px] shrink-0 flex-wrap items-center gap-3 border-b px-3.5">
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
                {/* The design separates the way out from the site's identity. */}
                <span aria-hidden className="h-[18px] w-px bg-border" />
                <span className="text-[0.8125rem] font-medium">{siteName}</span>
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
                        "flex h-[22px] shrink-0 items-center rounded-[3px] px-2 text-[0.6875rem]",
                        saveError
                            ? "border border-destructive/30 bg-destructive/10 text-destructive"
                            : dirty || saving
                              ? "border border-[#3d3020] bg-[#241d14] text-[#c99f6f]"
                              : "border border-[#2a2a2a] bg-[#1a1a1a] text-muted-foreground",
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

                {/*
                 * What publishing would actually change, in the bar where the
                 * design puts it. It used to be the badge on Publish, but the
                 * spec gives that badge to the outstanding FLAG count — and the
                 * two answer different questions: how much work is waiting, and
                 * how much of it is worth a second look.
                 *
                 * "Changed" means since the last PUBLISH, not since the last
                 * save — the same number the settings screen and the sites list
                 * show. What is unsaved is the pill's job, two elements to the
                 * left, and the two together say the whole truth: your work is
                 * safe, and this much of it is not live yet.
                 */}
                {pendingChanges !== null && pendingChanges > 0 ? (
                    <span className="text-xs text-muted-foreground">
                        {pendingChanges === 1
                            ? "1 section changed"
                            : `${pendingChanges} sections changed`}
                    </span>
                ) : null}

                {/*
                 * The design's "Approved by Priya Raman" line. The note count
                 * rides it rather than forming a second badge: the spec's
                 * "approved with notes" is ONE badge carrying both, because
                 * approval and outstanding notes answer the same question —
                 * is this ready.
                 */}
                {review.latestApproval === null ? null : (
                    <span
                        className={cn(
                            "flex h-[22px] items-center gap-1.5 rounded-[3px] border px-2 text-xs",
                            review.latestApproval.outcome === "APPROVED"
                                ? "border-[#3d3020] bg-[#241d14] text-[#c99f6f]"
                                : "border-border text-muted-foreground",
                        )}
                        title={exactDate(review.latestApproval.at)}
                    >
                        {review.latestApproval.outcome === "APPROVED"
                            ? `Approved by ${review.latestApproval.by}`
                            : `${review.latestApproval.by} asked for changes`}
                        {openNotes > 0 ? (
                            <span className="tabular-nums opacity-80">
                                · {openNotes}{" "}
                                {openNotes === 1 ? "note" : "notes"}
                            </span>
                        ) : null}
                    </span>
                )}

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
                        className="flex h-7 overflow-hidden rounded border"
                    >
                        {DEVICES.map((d) => (
                            <button
                                key={d.key}
                                type="button"
                                onClick={() => setDevice(d.key)}
                                aria-pressed={device === d.key}
                                className={cn(
                                    "border-l px-2.5 text-[0.6875rem] transition-colors first:border-l-0",
                                    device === d.key
                                        ? "bg-[#242424] text-foreground"
                                        : "text-muted-foreground hover:text-foreground active:bg-[#242424] active:text-foreground",
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
                    {/*
                     * The zoom readout IS the control (spec §2 resolved the
                     * contradiction that way): no ⌘scroll, no pinch, no
                     * shortcut. A select rather than a menu because it is a
                     * value being chosen, and a native select is the one
                     * control every keyboard and screen reader already knows.
                     */}
                    <select
                        aria-label="Zoom"
                        value={String(zoom)}
                        onChange={(e) =>
                            setZoom(
                                e.target.value === "fit"
                                    ? "fit"
                                    : (Number(e.target.value) as Zoom),
                            )
                        }
                        className="h-7 w-[4.25rem] rounded border bg-transparent px-1.5 text-xs tabular-nums text-muted-foreground"
                    >
                        {ZOOMS.map((z) => (
                            <option key={String(z)} value={String(z)}>
                                {z === "fit" ? "Fit" : `${z}%`}
                            </option>
                        ))}
                    </select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        aria-label="Full-screen preview"
                        title="Full-screen preview — Escape returns"
                        onClick={() => setFullScreen(true)}
                    >
                        ⤢
                    </Button>

                    <Button
                        variant={rail === "style" ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 rounded px-3 text-xs"
                        onClick={() =>
                            setRail(rail === "style" ? "sections" : "style")
                        }
                        aria-pressed={rail === "style"}
                    >
                        Style
                    </Button>

                    {/*
                     * Publish carries the EDITOR's accent (#8a5a3c, spec §7),
                     * not Saroh's brand blue. §1 is explicit that the shell
                     * accent drops away on entering the editor: inside here the
                     * only chromatic things should be the merchant's site and
                     * the one action that puts it in front of the public.
                     */}
                    <Button
                        className="wk-press h-7 rounded bg-[#8a5a3c] px-3 text-xs font-medium text-white hover:bg-[#794e34]"
                        onClick={() => void openCheck()}
                        disabled={publishing || dirty || saving}
                    >
                        {publishing
                            ? "Publishing…"
                            : /*
                               * "Never-published sites say Publish site, not
                               * Publish changes" (spec §2). Before anything is
                               * live there are no changes to publish — there is
                               * a site to put up.
                               */
                              neverPublished
                              ? "Publish site"
                              : "Publish"}
                        {/*
                         * The count as a BADGE rather than in the label, as the
                         * design has it: "Publish" stays the same width whatever
                         * the number, so the button a merchant is about to press
                         * does not move under the cursor as they edit.
                         */}
                        {/*
                         * "Publish button carries the outstanding flag count"
                         * (spec §2) — the flags, not the changed-section count
                         * that used to sit here. A number next to Publish
                         * should say what is worth looking at before going
                         * live, and the changed count already has its own line
                         * in the bar.
                         */}
                        {!publishing && siteFlags.flags.length > 0 ? (
                            <span className="ml-1.5 rounded bg-black/30 px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none">
                                {siteFlags.flags.length}
                            </span>
                        ) : null}
                    </Button>
                </div>
            </header>

            <div
                className="grid min-h-0 flex-1 lg:grid-cols-[var(--editor-cols)]"
                style={
                    {
                        // The two 1px tracks are the drag handles. Giving them
                        // real grid tracks — rather than absolutely positioning
                        // them over a border — is what keeps the hit area and
                        // the line the merchant is aiming at the same object.
                        /*
                         * "Review tab auto-widens the rail to 300px; the other
                         * tabs stay at 200." The merchant's own width is not
                         * overwritten — it comes straight back when they leave
                         * the tab, because this widens the LAYOUT, not the
                         * stored preference.
                         */
                        "--editor-cols": `${rail === "review" ? Math.max(railWidth, 300) : railWidth}px 1px ${panelWidth}px 1px minmax(0,1fr)`,
                    } as React.CSSProperties
                }
            >
                {/* Rail — the page as a list of sections, not a wall of fields. */}
                <aside className="flex min-h-0 flex-col">
                    {rail === "pages" ? (
                        <>
                            <RailTabs
                                rail={rail}
                                onSelect={setRail}
                                openNotes={openNotes}
                            />
                            <PagesPanel
                                siteId={siteId}
                                pages={pages}
                                activePageId={pageId}
                                dirty={dirty}
                            />
                        </>
                    ) : rail === "review" ? (
                        <>
                            <RailTabs
                                rail={rail}
                                onSelect={setRail}
                                openNotes={openNotes}
                            />
                            <ReviewPanel
                                siteId={siteId}
                                pages={pages}
                                comments={comments}
                                onChanged={() => void refreshReview()}
                                onJump={(jumpPageId, sectionKey) => {
                                    /*
                                     * A note names a section by KEY, and only
                                     * the open page's sections are loaded — so
                                     * a note on another page is a navigation
                                     * first and a selection after it.
                                     */
                                    if (jumpPageId !== pageId) {
                                        router.push(
                                            `/sites/${siteId}?page=${jumpPageId}`,
                                        );
                                        return;
                                    }
                                    const index = sections.findIndex(
                                        (sec) => sec.key === sectionKey,
                                    );
                                    if (index === -1) return;
                                    setRail("sections");
                                    setSelectedIndex(index);
                                }}
                            />
                        </>
                    ) : rail === "style" ? (
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
                             * Review. Review is still unbuilt, so it is absent
                             * rather than dead — a tab leading nowhere is worse
                             * than one that is not there. Style is not a tab at
                             * all: it opens from the bar, because it applies to
                             * the whole site while this rail lists one page.
                             */}
                            <RailTabs
                                rail={rail}
                                onSelect={setRail}
                                openNotes={openNotes}
                            />
                            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                                {sections.map((section, index) => (
                                    <li
                                        key={index}
                                        /*
                                         * The row is the drop target, not the
                                         * handle: aiming at a 32px row is far
                                         * easier than aiming at the grip, and
                                         * the grip is what starts the drag.
                                         */
                                        onDragOver={(e) => {
                                            if (dragIndex === null) return;
                                            e.preventDefault();
                                            setDropIndex(index);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragIndex === null) return;
                                            moveTo(dragIndex, index);
                                            setSelectedIndex(index);
                                            setDragIndex(null);
                                            setDropIndex(null);
                                        }}
                                        className={cn(
                                            "rounded",
                                            dropIndex === index &&
                                                dragIndex !== index &&
                                                "ring-1 ring-inset ring-ring",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                // A row is not a button and must not
                                                // scale — at 32px tall a shrink reads
                                                // as a jitter. It answers a press with
                                                // the surface it would settle on, so
                                                // the feedback is the outcome arriving
                                                // early rather than a separate effect.
                                                "group flex h-8 w-full items-center gap-1.5 rounded pr-1 text-left text-xs transition-colors",
                                                selectedIndex === index
                                                    ? "bg-secondary"
                                                    : "hover:bg-muted active:bg-secondary",
                                                errorIndex === index &&
                                                    "text-destructive",
                                                dragIndex === index &&
                                                    "opacity-40",
                                            )}
                                        >
                                            {/*
                                             * The grip is the drag surface. It
                                             * carries no click of its own — a
                                             * handle that also navigates makes
                                             * every aborted drag a selection.
                                             */}
                                            <span
                                                draggable
                                                onDragStart={() => {
                                                    setDragIndex(index);
                                                    setDropIndex(index);
                                                }}
                                                onDragEnd={() => {
                                                    setDragIndex(null);
                                                    setDropIndex(null);
                                                }}
                                                aria-hidden="true"
                                                className="cursor-grab select-none px-1 text-muted-foreground/50 active:cursor-grabbing group-hover:text-muted-foreground"
                                            >
                                                ⋮
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedIndex(index)
                                                }
                                                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                            >
                                                <span
                                                    className={cn(
                                                        "truncate",
                                                        /*
                                                         * A hidden section is
                                                         * dimmed rather than
                                                         * removed: it is still
                                                         * part of the page the
                                                         * merchant is building,
                                                         * just not part of the
                                                         * one visitors get.
                                                         */
                                                        section.hidden &&
                                                            "text-muted-foreground/50 line-through",
                                                    )}
                                                >
                                                    {sectionTitle(section)}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1.5">
                                                    <span className="text-[0.625rem] uppercase tracking-[0.06em] text-muted-foreground/70">
                                                        {
                                                            SECTION_LABELS[
                                                                section.type
                                                            ]
                                                        }
                                                    </span>
                                                    {/*
                                                     * The spec's flag dot: 4px,
                                                     * amber #c99f6f (§7). It is
                                                     * the ONLY thing flags draw
                                                     * while editing — "quiet
                                                     * until publish" — so it
                                                     * carries a title rather
                                                     * than expanding into the
                                                     * row.
                                                     */}
                                                    {(flagsBySection.get(index)
                                                        ?.length ?? 0) > 0 ||
                                                    (section.key !==
                                                        undefined &&
                                                        notedKeys.has(
                                                            section.key,
                                                        )) ? (
                                                        <span
                                                            className="size-1 shrink-0 rounded-full bg-[#c99f6f]"
                                                            title={[
                                                                ...(flagsBySection
                                                                    .get(index)
                                                                    ?.map(
                                                                        (f) =>
                                                                            f.message,
                                                                    ) ?? []),
                                                                ...(section.key !==
                                                                    undefined &&
                                                                notedKeys.has(
                                                                    section.key,
                                                                )
                                                                    ? [
                                                                          "A reviewer has left a note on this section.",
                                                                      ]
                                                                    : []),
                                                            ].join("\n")}
                                                        />
                                                    ) : null}
                                                </span>
                                            </button>
                                        </div>
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

                <PanelDivider
                    label="Resize the section list"
                    width={railWidth}
                    min={RAIL_MIN}
                    max={RAIL_MAX}
                    reset={RAIL_DEFAULT}
                    onResize={setRailWidth}
                    onNudge={nudgeRail}
                />

                {/* Field panel — one section at a time. */}
                <div className="min-h-0 overflow-y-auto p-4">
                    {active ? (
                        <div className="space-y-4">
                            {/*
                             * Two rows, because 240px will not hold a section
                             * name and four controls on one line — the header
                             * clipped its own Remove button at the design's
                             * own panel width.
                             *
                             * The split is not just fitting: the design's
                             * header carries what the section IS and whether
                             * it is on the live site. Moving it, and deleting
                             * it, are actions taken ON it and belong under it.
                             */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="min-w-0 truncate text-sm font-semibold">
                                        {SECTION_LABELS[active.section.type]}
                                    </h2>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-pressed={
                                            active.section.hidden === true
                                        }
                                        title={
                                            active.section.hidden
                                                ? "Hidden — this section is left out when you publish"
                                                : "Visible — this section publishes with the page"
                                        }
                                        onClick={() =>
                                            toggleHidden(active.index)
                                        }
                                        className={cn(
                                            "h-7 shrink-0 gap-1.5 px-2 text-xs",
                                            active.section.hidden &&
                                                "text-muted-foreground",
                                        )}
                                    >
                                        <span aria-hidden="true">
                                            {active.section.hidden ? "○" : "●"}
                                        </span>
                                        {active.section.hidden
                                            ? "Hidden"
                                            : "Visible"}
                                    </Button>
                                </div>

                                <div className="flex items-center gap-1">
                                    {/*
                                     * The arrows survive the drag handle: a
                                     * list you can only reorder by dragging is
                                     * a list some people cannot reorder.
                                     */}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Move section up"
                                        className="h-7 w-7 p-0"
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
                                        className="h-7 w-7 p-0"
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
                                        className="ml-auto h-7 px-2 text-xs"
                                        onClick={() => {
                                            /*
                                             * Ask first, and name the section.
                                             *
                                             * Removing one used to be the only
                                             * destructive action in the editor
                                             * with no guard at all, while
                                             * deleting a PAGE — the rarer of
                                             * the two — has always confirmed.
                                             * The weaker guard sat on the more
                                             * frequent action, next to the move
                                             * arrows a merchant is reaching for
                                             * while reordering.
                                             *
                                             * Autosave then commits it, and
                                             * version history only covers what
                                             * has been PUBLISHED, so copy
                                             * written since the last publish is
                                             * gone for good. The question says
                                             * so rather than asking "are you
                                             * sure" about a cost it does not
                                             * name.
                                             *
                                             * It also names hiding. A merchant
                                             * reaching for Remove usually wants
                                             * the section off the site, not
                                             * destroyed, and the control that
                                             * does that is two inches away —
                                             * an error is cheaper to prevent
                                             * than to apologise for.
                                             */
                                            const title = sectionTitle(
                                                active.section,
                                            );
                                            const ok = window.confirm(
                                                `Remove "${title}"? Anything written here since your last publish cannot be brought back. To take it off the site and keep the work, hide it instead.`,
                                            );
                                            if (!ok) return;
                                            removeAt(active.index);
                                            setSelectedIndex(null);
                                            toast.success(`Removed ${title}.`);
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>

                            <SectionFields
                                section={active.section}
                                services={services}
                                pages={pages}
                                onChange={(next) =>
                                    replaceAt(active.index, next)
                                }
                            />

                            {/*
                             * Per-field markers, the other half of what flags
                             * are allowed to show while editing. Listed under
                             * the fields rather than inline beside each one:
                             * the field components are shared with the section
                             * types and threading a marker through all six for
                             * a advisory note would cost more than it is worth
                             * until the notes need to sit on the input itself.
                             */}
                            {activeFlags.length > 0 ? (
                                <ul className="grid gap-1.5 border-t pt-3">
                                    {activeFlags.map((flag, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="mt-1.5 size-1 shrink-0 rounded-full bg-[#c99f6f]"
                                            />
                                            <span>{flag.message}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}

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

                <PanelDivider
                    label="Resize the field panel"
                    width={panelWidth}
                    min={PANEL_MIN}
                    max={PANEL_MAX}
                    reset={PANEL_DEFAULT}
                    onResize={setPanelWidth}
                    onNudge={nudgePanel}
                />

                {/*
                 * Preview — width changes, data does not.
                 *
                 * The canvas ground is the SAME #0b0b0b as the chrome (spec §7),
                 * not a lighter tray. A raised panel here would make the canvas
                 * a second bright object competing with the one that matters:
                 * the rendered site.
                 */}
                <div
                    ref={canvasRef}
                    onScroll={(e) => {
                        /*
                         * Remembered per site — the spec lists preview scroll
                         * position among the things that persist. Debounced:
                         * a scroll fires dozens of events a second, and every
                         * one of them writing to storage would serialise the
                         * whole place object each time for no benefit.
                         */
                        const top = e.currentTarget.scrollTop;
                        if (scrollWrite.current !== null) {
                            clearTimeout(scrollWrite.current);
                        }
                        scrollWrite.current = setTimeout(() => {
                            setPlace(siteId, initialCount, { scrollTop: top });
                        }, 250);
                    }}
                    className="min-h-0 overflow-y-auto bg-background p-6"
                >
                    {/*
                     * The first-run nudge (spec §5), in the spec's own words.
                     * "It does not nag" — so it is one quiet line above the
                     * preview, shown only until the site has been published
                     * once, and it never reappears afterwards.
                     */}
                    {neverPublished ? (
                        <p
                            className="mx-auto mb-4 text-center text-xs text-muted-foreground"
                            style={{ maxWidth: DEVICE_WIDTH[device] }}
                        >
                            Nothing&rsquo;s live yet — publish when you&rsquo;re
                            ready, nobody can see this in the meantime.
                        </p>
                    ) : null}
                    <div
                        /*
                         * "Switching frames cross-fades and resizes — the frame
                         * animates to the new width, content reflows during
                         * it." The width transition does the resize; the brief
                         * dip in opacity is the cross-fade, and it is what stops
                         * a reflow mid-animation reading as a glitch.
                         *
                         * This animates `max-width`, which is a LAYOUT property
                         * and so breaks the usual transform/opacity-only rule,
                         * deliberately. The whole point of a device preview is
                         * showing how the site reflows at that width; a
                         * transform would scale the content instead of
                         * reflowing it, which is the one thing this control
                         * exists to show. So the reflow is the work, not an
                         * accident of implementation.
                         *
                         * What that buys is a duty to keep it short: 200ms
                         * rather than the 300 it was, because every frame here
                         * costs a layout pass over the whole rendered site.
                         */
                        className={`mx-auto transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                            switching ? "opacity-70" : "opacity-100"
                        }`}
                        style={{
                            maxWidth: DEVICE_WIDTH[device],
                            transform: `scale(${zoomScale})`,
                            transformOrigin: "top center",
                        }}
                    >
                        <DraftPreview
                            sections={sections}
                            style={style}
                            styleOptions={styleOptions}
                            selectedIndex={selectedIndex}
                            onSelect={(index) => {
                                setRail("sections");
                                setSelectedIndex(index);
                            }}
                        />
                    </div>
                </div>
            </div>

            {/*
             * The pre-publish check. Rendered inside the editor rather than
             * on its own route so nothing is torn down and rebuilt behind
             * it — the merchant goes back to exactly the editing state they
             * left, including unsaved selection and scroll.
             */}
            {/*
             * Full-screen preview: "hides everything; Escape returns". The
             * frame keeps its device width, so this is the site at the size
             * being designed for with nothing else on screen — not a
             * maximised editor.
             */}
            {fullScreen ? (
                <div className="fixed inset-0 z-40 overflow-y-auto bg-background p-6">
                    <button
                        type="button"
                        onClick={() => setFullScreen(false)}
                        className="fixed right-4 top-4 z-10 rounded border bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                    >
                        Escape to return
                    </button>
                    <div
                        className="mx-auto transition-[max-width] duration-200 ease-out motion-reduce:transition-none"
                        style={{ maxWidth: DEVICE_WIDTH[device] }}
                    >
                        <DraftPreview
                            sections={sections}
                            style={style}
                            styleOptions={styleOptions}
                        />
                    </div>
                </div>
            ) : null}

            {checking ? (
                <PrePublishCheck
                    siteName={siteName}
                    pages={pages}
                    flags={siteFlags.flags}
                    awaitingNavigation={siteFlags.awaitingNavigation}
                    publishing={publishing}
                    neverPublished={neverPublished}
                    review={review}
                    onPublish={() => void onPublish()}
                    onClose={() => setChecking(false)}
                    onJump={(jumpPageId, sectionIndex) => {
                        setChecking(false);
                        /*
                         * A flag on another page needs that page loaded, which
                         * is a navigation. One on this page is just a
                         * selection — doing it without a round trip keeps the
                         * jump instant where it can be.
                         */
                        if (jumpPageId !== null && jumpPageId !== pageId) {
                            router.push(`/sites/${siteId}?page=${jumpPageId}`);
                            return;
                        }
                        if (sectionIndex !== null) {
                            setRail("sections");
                            setSelectedIndex(sectionIndex);
                        }
                    }}
                />
            ) : null}
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
    pages,
    onChange,
}: {
    section: Section;
    services: ServiceOption[];
    /** The site's pages, so a button can pick one rather than type a path. */
    pages: SitePage[];
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
                                                  style:
                                                      c.cta?.style ?? "primary",
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
                        {c.format === "html" ? (
                            <RichTextEditor
                                value={c.value}
                                onChange={(value) => patch({ value })}
                                placeholder="Write about your business…"
                            />
                        ) : (
                            <Textarea
                                value={c.value}
                                onChange={(e) =>
                                    patch({ value: e.target.value })
                                }
                                rows={6}
                                placeholder="# Hello world"
                            />
                        )}
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
                    <CtaActionFields
                        action={actionOf(c)}
                        pages={pages}
                        onChange={(action) =>
                            onChange({
                                ...section,
                                contractVersion: 2,
                                content: { ...c, href: undefined, action },
                            })
                        }
                    />
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
