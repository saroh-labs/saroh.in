"use client";

import { BLOCK_META } from "@saroh/block-contract";
import { BlockFixturePreview } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { ListSearch } from "@saroh/ui/list-search";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, FilePlus, LayoutGrid, LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOpenPageId } from "../page-switch";

import type { BusinessTileProps } from "@/components/sites/blocks/add-block-panel";
import {
    AddBlockPanel,
    BusinessTile,
    Entry,
    Group,
    PreviewEntry,
} from "@/components/sites/blocks/add-block-panel";
import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import { addBlockGroups } from "@/components/sites/blocks/block-kinds";
import { BlockThumbnail } from "@/components/sites/blocks/block-thumbnail";
import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type { PickerReview } from "@/lib/product-reviews/picker-read";
import { readReviewsForPicker } from "@/lib/product-reviews/picker-read";
import type { AddBusinessCounts } from "@/lib/sites/add-business-read";
import { readAddBusiness } from "@/lib/sites/add-business-read";
import {
    MODULE_PAGE_OFFERS,
    addPageOffers,
    pageKind,
} from "@/lib/sites/page-menu";
import type { AddCountsPick, ReviewsPick } from "@/lib/sites/queries";
import type {
    ModulePageKind,
    SectionType,
    SitePage,
} from "@/lib/sites/service";
import { resolveStyleVariables } from "@/lib/sites/style";
import type { PickFailed } from "@/lib/sites/use-picker";
import { usePickerRead } from "@/lib/sites/use-picker";

import {
    SECTION_HINTS,
    SECTION_LABELS,
    addableFamilies,
    addableSections,
    sectionTitle,
} from "../editor-constants";
import type { EditorModel } from "../shell/editor-model";
import { leavePageMessage } from "../use-editor-selection";
import type { PageStart } from "./add-page-sheet";
import { AddPageSheet } from "./add-page-sheet";
import type { PickerService, ShowAs } from "./from-your-business";
import { ServicesPicker } from "./from-your-business";
import type { ReviewItem, ReviewTarget } from "./review-picker";
import { ReviewPicker } from "./review-picker";
import {
    formLine,
    readRecent,
    rememberRecent,
    suggestedSections,
} from "./suggestions";
import { useCanvasDrop } from "./use-canvas-drop";

/** Without React Query above (a test): the Server Actions Add always used. */
const legacyCounts = async (): Promise<AddCountsPick> => ({
    ok: true,
    counts: await readAddBusiness(),
});
const legacyReviews = async (): Promise<ReviewsPick> => ({
    ok: true,
    reviews: await readReviewsForPicker(),
});

export interface AddPanelProps {
    model: EditorModel;
    /** In a phone's bottom sheet (U49) rather than the desk's left panel. */
    phone?: boolean;
}

/** The services read for "A service": null while it loads. */
type ServicesRead = { ok: true; services: PickerService[] } | { ok: false };

/**
 * Rail › Add (U46e, `fix/WXBAdd`; phone `fix/WXBAddPhone`): one search over
 * pages, sections and the business; Add a page (its own sheet,
 * `fix/WXBAddPage`); then a section below the selected one: Suggested for
 * this page, Recent, Browse all with previews (today's library), and From
 * your business, where A service asks which services first.
 *
 * Every way today's Add tab added a section stays: each section is in
 * Browse all and in a search, a section with several looks still asks
 * which look, and a click adds below the selected section.
 */
export function AddPanel({ model, phone = false }: AddPanelProps) {
    const { add, draft, active, page } = model;
    const [query, setQuery] = useState("");
    const [pageSheet, setPageSheet] = useState<PageStart | null>(null);
    const [picking, setPicking] = useState(false);
    // The services pickers' one cached read (U33): Add opens from it.
    const servicesLoad = useServicesForPicker();
    const services: ServicesRead | null =
        servicesLoad.status === "loading"
            ? null
            : servicesLoad.status === "ready"
              ? {
                    ok: true,
                    services: servicesLoad.services.filter(
                        (s) => s.status !== "ARCHIVED",
                    ),
                }
              : { ok: false };
    // Storage throws on the server and in a private window: no Recent.
    const [recent] = useState<SectionType[]>(readRecent);
    // The business's counts and its reviews: the pickers' cached reads
    // (U18), each its domain's, so Add opens from them.
    const countsLoad = usePickerRead<AddCountsPick | PickFailed>(
        "add-counts",
        legacyCounts,
    );
    const counts: AddBusinessCounts | null =
        countsLoad.read !== "loading" && countsLoad.read.ok
            ? countsLoad.read.counts
            : null;
    // A review (round 3, EBReviewPicker): undefined while read, null unread.
    const reviewsLoad = usePickerRead<ReviewsPick | PickFailed>(
        "reviews",
        legacyReviews,
    );
    const reviews: PickerReview[] | null | undefined =
        reviewsLoad.read === "loading"
            ? undefined
            : reviewsLoad.read.ok
              ? reviewsLoad.read.reviews
              : null;
    const [reviewing, setReviewing] = useState(false);

    const pick = (type: SectionType, looks: number) => {
        rememberRecent(type);
        if (looks > 1) add.setLookFor(type);
        else add.addSection(type);
    };

    // Drag a card onto the canvas (A4): it goes in where it drops.
    const { dragProps, line } = useCanvasDrop({
        canvasRef: model.viewport.canvasRef,
        sections: draft.sections,
        setSelectedIndex: model.selection.setSelectedIndex,
        desk: model.layout !== "phone" && !model.readOnly,
        onDrop: (type) => pick(type, BLOCK_META[type].variants.length),
    });

    if (model.readOnly) return null;

    const addable = addableSections(model.shopOpen, model.packsOpen);
    const canAddPage = model.canUpdateSite;
    const offers = addPageOffers(model.addablePageKinds);
    const below = active ? sectionTitle(active.section) : null;
    const q = query.trim().toLowerCase();

    const addServices = (ids: string[], showAs: ShowAs, showBook: boolean) => {
        rememberRecent("servicesList");
        add.addSection("servicesList", showAs, (at) =>
            draft.restoreSections((prev) =>
                prev.map((s, i) =>
                    i === at
                        ? ({
                              ...s,
                              content: {
                                  ...s.content,
                                  serviceIds: ids,
                                  // Absent is shown (A5).
                                  ...(showBook ? {} : { showBook: false }),
                              },
                          } as typeof s)
                        : s,
                ),
            ),
        );
        setPicking(false);
    };

    const testimonials: ReviewTarget[] = draft.sections.flatMap((s, i) =>
        s.type === "testimonials"
            ? [
                  {
                      index: i,
                      heading: headingOr(
                          (s.content as { heading?: string }).heading,
                          SECTION_LABELS.testimonials,
                      ),
                      full:
                          ((s.content as { items?: unknown[] }).items?.length ??
                              0) >= TESTIMONIALS_MOST,
                  },
              ]
            : [],
    );

    const addReview = (item: ReviewItem, into: number | null) => {
        rememberRecent("testimonials");
        if (into === null) {
            add.addSection("testimonials", undefined, (at) =>
                draft.restoreSections((prev) =>
                    prev.map((s, i) =>
                        i === at
                            ? ({
                                  ...s,
                                  content: { ...s.content, items: [item] },
                              } as typeof s)
                            : s,
                    ),
                ),
            );
        } else {
            draft.restoreSections((prev) =>
                prev.map((s, i) =>
                    i === into
                        ? ({
                              ...s,
                              content: {
                                  ...s.content,
                                  items: [
                                      ...((
                                          s.content as { items?: ReviewItem[] }
                                      ).items ?? []),
                                      item,
                                  ],
                              },
                          } as typeof s)
                        : s,
                ),
            );
            model.selection.setSelectedIndex(into);
        }
        setReviewing(false);
    };

    if (reviewing && reviews !== undefined) {
        return (
            <ReviewPicker
                reviews={reviews}
                targets={testimonials}
                below={below}
                onBack={() => setReviewing(false)}
                onRetry={reviewsLoad.retry}
                onAdd={addReview}
            />
        );
    }

    if (picking && services?.ok) {
        return (
            <ServicesPicker
                services={services.services}
                below={below}
                onBack={() => setPicking(false)}
                onAdd={addServices}
            />
        );
    }

    const families = addableFamilies(model.shopOpen, model.packsOpen);
    const business = families.filter((f) =>
        addBlockGroups([f.layouts[0].type]).business.includes(
            f.layouts[0].type,
        ),
    );
    const serviceCount = services?.ok ? services.services.length : null;
    const firstService = services?.ok ? services.services[0] : undefined;
    /**
     * A suggested card in the business's own words (A1): its first
     * service with time and price, its products, its form. Null keeps
     * the block's own line.
     */
    const businessLine = (t: SectionType): string | null => {
        if ((t === "booking" || t === "servicesList") && firstService) {
            const price =
                firstService.priceCents == null
                    ? null
                    : formatMoney(
                          firstService.priceCents,
                          firstService.currency ?? null,
                      );
            return [
                firstService.name,
                firstService.durationMinutes
                    ? count(firstService.durationMinutes, "min", "min")
                    : null,
                price,
            ]
                .filter(Boolean)
                .join(" · ");
        }
        if (t === "productGrid" && counts?.products) {
            return count(counts.products, "product");
        }
        if (t === "enquiry" && counts?.forms) return formLine(counts.forms);
        return null;
    };
    const { types: suggested, matched } = suggestedSections(
        page ? pageKind(page) : "FREE",
        draft.sections,
        addable,
    );
    const recentShown = recent.filter((t) => addable.includes(t));
    // The site's colours, so the small pictures wear them (A1).
    const variables = resolveStyleVariables(
        model.siteStyle.style,
        model.styleOptions,
    );
    const looks = (t: SectionType) => BLOCK_META[t].variants.length;

    // From your business (A9): a tile per layout of each bound family, and
    // A form (an enquiry section) when the business has a form.
    const businessTiles: BusinessTileProps[] = [];
    for (const f of business) {
        if (f.head === "servicesList") {
            if (serviceCount === 0) continue;
            businessTiles.push({
                id: f.head,
                label: "A service",
                hint:
                    serviceCount === null
                        ? SECTION_HINTS.servicesList
                        : count(serviceCount, "service"),
                onClick: services?.ok
                    ? () => setPicking(true)
                    : () => pick("servicesList", 1),
            });
            continue;
        }
        for (const l of f.layouts) {
            businessTiles.push({
                id: l.type,
                label:
                    TILE_NAMES[l.type] ??
                    (f.layouts.length > 1 ? l.label : SECTION_LABELS[l.type]),
                hint: businessLine(l.type) ?? SECTION_HINTS[l.type],
                onClick: () => pick(l.type, looks(l.type)),
                onDragStart: dragProps(l.type),
            });
        }
    }
    if (counts?.forms && addable.includes("enquiry")) {
        businessTiles.push({
            id: "enquiry",
            label: "A form",
            hint: formLine(counts.forms),
            onClick: () => pick("enquiry", looks("enquiry")),
            onDragStart: dragProps("enquiry"),
        });
    }
    // A review (round 3, EBReviewPicker): the product reviews to show, or
    // "Write one" when there are none.
    if (addable.includes("testimonials") && reviews !== undefined) {
        const n = reviews?.length ?? 0;
        businessTiles.push({
            id: "testimonials",
            label: "A review",
            hint: n > 0 ? `${n} · write one` : "Write one",
            onClick: () => setReviewing(true),
        });
    }
    // The board's order: what is sold and booked first (A9, `WXBAdd`).
    const rank = (id: string) => {
        const at = TILE_ORDER.indexOf(id as SectionType);
        return at === -1 ? TILE_ORDER.length : at;
    };
    businessTiles.sort((a, b) => rank(a.id) - rank(b.id));

    const pageRows = canAddPage ? (
        // A bordered list, left aligned (A1, `WXBAdd`).
        <Group
            titled
            label={phone ? "A page" : "Add a page"}
            listClassName={PAGE_LIST}
        >
            <PageRow
                icon={FilePlus}
                label="Blank page"
                onClick={() => setPageSheet("blank")}
            />
            {phone ? null : (
                // A template's pages are added where the template is
                // chosen: Brand's Template row (A1, `WXBAdd`).
                <PageRow
                    icon={LayoutTemplate}
                    label="From a template"
                    note="its pages, in Brand"
                    onClick={() => model.openRail("brand")}
                />
            )}
            {page ? (
                <PageRow
                    icon={Copy}
                    label="Copy this page"
                    note={page.title}
                    onClick={() => setPageSheet("copy")}
                />
            ) : null}
            {offers.length > 0 ? (
                <li className="pb-2.5">
                    <p className="px-3 pb-1 pt-2 text-sm font-semibold">
                        Ready pages
                    </p>
                    <ul className="flex flex-wrap gap-1.5 px-3">
                        {offers.map((o) => (
                            <li key={o.kind}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    aria-label={`Add a ${o.label} page`}
                                    onClick={() => setPageSheet(o.kind)}
                                >
                                    {MODULE_PAGE_OFFERS[o.kind].label}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </li>
            ) : null}
        </Group>
    ) : null;

    const sectionRows = (
        <>
            <div className="flex items-baseline gap-2 px-2">
                <h3 className="text-sm font-semibold">
                    {phone ? "A section here" : "Add a section"}
                </h3>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {below ? `below ${below}` : "at the end of the page"}
                </span>
                {phone ? null : (
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        className="text-xs"
                        onClick={() => model.openRail("pages")}
                    >
                        Change
                    </Button>
                )}
            </div>

            {suggested.length > 0 ? (
                <Group
                    titled
                    label="Suggested for this page"
                    count={suggested.length}
                    listClassName={
                        phone ? undefined : "grid grid-cols-3 gap-2 px-2"
                    }
                >
                    {matched && page ? (
                        <li className="col-span-3 text-xs text-muted-foreground">
                            {
                                // `matched` is only ever a module page.
                                MODULE_PAGE_OFFERS[
                                    pageKind(page) as ModulePageKind
                                ].label
                            }{" "}
                            pages often have these. Yours doesn&apos;t yet.
                        </li>
                    ) : null}
                    {suggested.map((t) =>
                        phone ? (
                            <Entry
                                key={t}
                                icon={SECTION_ICONS[t]}
                                label={SECTION_LABELS[t]}
                                hint={businessLine(t) ?? SECTION_HINTS[t]}
                                looks={looks(t)}
                                onClick={() => pick(t, looks(t))}
                                onDragStart={dragProps(t)}
                            />
                        ) : (
                            // Three small pictures in a row on a desk (A1).
                            <PreviewEntry
                                key={t}
                                label={SECTION_LABELS[t]}
                                hint={businessLine(t) ?? SECTION_HINTS[t]}
                                onClick={() => pick(t, looks(t))}
                                onDragStart={dragProps(t)}
                                preview={
                                    <BlockThumbnail
                                        variables={variables}
                                        look={model.siteStyle.style.look}
                                        height={56}
                                    >
                                        <BlockFixturePreview
                                            type={t}
                                            variant={
                                                BLOCK_META[t].variants[0].id
                                            }
                                            look={model.siteStyle.style.look}
                                        />
                                    </BlockThumbnail>
                                }
                            />
                        ),
                    )}
                </Group>
            ) : null}

            {recentShown.length > 0 && !phone ? (
                <Group titled label="Recent" count={recentShown.length}>
                    <li>
                        <ul className="flex flex-wrap gap-1.5 px-2">
                            {recentShown.map((t) => (
                                <li key={t}>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        aria-label={`Add ${SECTION_LABELS[t]}`}
                                        onClick={() => pick(t, looks(t))}
                                    >
                                        {SECTION_LABELS[t]}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </li>
                </Group>
            ) : null}

            {phone ? null : <BrowseAll model={model} count={addable.length} />}

            {businessTiles.length > 0 ? (
                // Small tiles two to a row (A9, `WXBAdd`): one per layout,
                // so every way the old list added a section stays.
                <Group
                    titled
                    label="From your business"
                    count={businessTiles.length}
                    listClassName="grid grid-cols-2 gap-2 px-2"
                >
                    <li className="col-span-2 text-xs text-muted-foreground">
                        Filled in, kept up to date
                    </li>
                    {businessTiles.map((t) => (
                        <BusinessTile key={t.id} {...t} />
                    ))}
                </Group>
            ) : null}
        </>
    );

    return (
        <section
            aria-label="Add"
            data-add-panel={phone ? "phone" : "desk"}
            className="flex min-h-0 flex-1 flex-col"
        >
            <div className="grid gap-3 px-3 pb-2 pt-3">
                {phone ? null : <h2 className="text-sm font-semibold">Add</h2>}
                <ListSearch
                    // ListSearch's rule: "Search {things}", the rest said
                    // as its description. The board's "…and your business"
                    // is cut at the panel's width (A1 · 5, 22 Nov 2026).
                    placeholder="Search pages and sections"
                    describe="Pages, sections and things from your business"
                    onSearch={setQuery}
                    shortcut={false}
                />
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-4 pt-2">
                {q !== "" ? (
                    <>
                        {canAddPage ? (
                            <PageMatches
                                q={q}
                                offers={offers}
                                onPick={setPageSheet}
                            />
                        ) : null}
                        <AddBlockPanel
                            query={query}
                            shopOpen={model.shopOpen}
                            packsOpen={model.packsOpen}
                            onBrowse={() => add.setBrowsing(true)}
                            onPick={pick}
                        />
                    </>
                ) : phone ? (
                    <>
                        {sectionRows}
                        {pageRows}
                        <BrowseAll model={model} count={addable.length} />
                    </>
                ) : (
                    <>
                        {pageRows}
                        {sectionRows}
                    </>
                )}
            </div>
            {line}
            {pageSheet !== null ? (
                <AddPageFor
                    key={pageSheet}
                    model={model}
                    start={pageSheet}
                    onClose={() => setPageSheet(null)}
                />
            ) : null}
        </section>
    );
}

/**
 * Add a page (`fix/WXBAddPage`) for this editor: Add's own entries and the
 * Pages tree's "Add a page" (U46e) open the same sheet. A page that went
 * in opens, unless unsaved work would be lost by leaving this one.
 */
export function AddPageFor({
    model,
    start,
    onClose,
}: {
    model: EditorModel;
    start: PageStart;
    onClose: () => void;
}) {
    const router = useRouter();
    const openPageId = useOpenPageId(model.siteId);
    const { draft } = model;
    function opened(next: SitePage) {
        onClose();
        showSuccess(`Added ${next.title}.`);
        const blocked = leavePageMessage(
            model.unsaved,
            draft.onlyHeldBack ? unfinishedPhrase(draft.heldBack) : undefined,
        );
        if (blocked !== null) {
            showError(blocked);
            router.refresh();
            return;
        }
        openPageId(next.id);
        router.refresh();
    }
    return (
        <AddPageSheet
            open
            siteId={model.siteId}
            address={model.address}
            offers={addPageOffers(model.addablePageKinds)}
            page={model.page}
            takenPaths={model.pages.map((p) => p.path)}
            start={start}
            onClose={onClose}
            onAdded={opened}
        />
    );
}

/** A business tile's name, in the board's words (A9); the rest keep theirs. */
const TILE_NAMES: Partial<Record<SectionType, string>> = {
    productGrid: "A product",
    timetable: "A class",
    booking: "A booking",
    journal: "A list of posts",
};

/** Tiles first in From your business, in this order; the rest after. */
const TILE_ORDER: SectionType[] = [
    "servicesList",
    "productGrid",
    "timetable",
    "booking",
    "testimonials",
    "enquiry",
    "journal",
];

/** A section's heading, or its kind's name when it has none. */
function headingOr(heading: string | undefined, label: string): string {
    const h = heading?.trim();
    if (h) return h;
    return label;
}

/** The most quotes one Testimonials section takes (section contract). */
const TESTIMONIALS_MOST = 12;

/** Add a page's rows: one bordered list (A1). */
const PAGE_LIST = "mx-2 divide-y overflow-hidden rounded-lg border bg-card";

function BrowseAll({ model, count }: { model: EditorModel; count: number }) {
    return (
        <div className="px-2">
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => model.add.setBrowsing(true)}
            >
                <LayoutGrid aria-hidden className="size-4" />
                Browse all {count} sections, with previews
            </Button>
        </div>
    );
}

function PageRow({
    icon: Icon,
    label,
    note,
    onClick,
}: {
    icon: typeof FilePlus;
    label: string;
    note?: string;
    onClick: () => void;
}) {
    return (
        <li>
            <Button
                data-ph-mask=""
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClick}
                className="h-11 w-full justify-start gap-2.5 rounded-none px-3 text-left"
            >
                <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">
                    {label}
                    {note ? (
                        <span className="font-normal text-muted-foreground">
                            {" · "}
                            {note}
                        </span>
                    ) : null}
                </span>
            </Button>
        </li>
    );
}

/** A search's pages: Blank page and the ready pages whose name matches. */
function PageMatches({
    q,
    offers,
    onPick,
}: {
    q: string;
    offers: ReturnType<typeof addPageOffers>;
    onPick: (start: PageStart) => void;
}) {
    const rows = [
        { start: "blank" as PageStart, label: "Blank page" },
        ...offers.map((o) => ({
            start: o.kind,
            label: `${o.label} page`,
        })),
    ].filter((r) => r.label.toLowerCase().includes(q));
    if (rows.length === 0) return null;
    return (
        <Group titled label="Add a page" listClassName={PAGE_LIST}>
            {rows.map((r) => (
                <PageRow
                    key={r.start}
                    icon={FilePlus}
                    label={r.label}
                    onClick={() => onPick(r.start)}
                />
            ))}
        </Group>
    );
}
