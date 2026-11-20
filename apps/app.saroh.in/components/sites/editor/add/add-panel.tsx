"use client";

import { BLOCK_META } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { ListSearch } from "@saroh/ui/list-search";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ConciergeBell, Copy, FilePlus, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
    AddBlockPanel,
    Entry,
    FamilyEntry,
    Group,
} from "@/components/sites/blocks/add-block-panel";
import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import { addBlockGroups } from "@/components/sites/blocks/block-kinds";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import { listServicesForPicker } from "@/lib/services/actions";
import {
    MODULE_PAGE_OFFERS,
    addPageOffers,
    pageKind,
} from "@/lib/sites/page-menu";
import type {
    ModulePageKind,
    SectionType,
    SitePage,
} from "@/lib/sites/service";

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
import { readRecent, rememberRecent, suggestedSections } from "./suggestions";

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
    const [services, setServices] = useState<ServicesRead | null>(null);
    // Storage throws on the server and in a private window: no Recent.
    const [recent] = useState<SectionType[]>(readRecent);

    useEffect(() => {
        let live = true;
        listServicesForPicker()
            .then((r) => {
                if (!live) return;
                setServices(
                    r.ok
                        ? {
                              ok: true,
                              services: r.services.filter(
                                  (s) => s.status !== "ARCHIVED",
                              ),
                          }
                        : { ok: false },
                );
            })
            .catch(() => live && setServices({ ok: false }));
        return () => {
            live = false;
        };
    }, []);

    if (model.readOnly) return null;

    const addable = addableSections(model.shopOpen, model.packsOpen);
    const canAddPage = model.canUpdateSite;
    const offers = addPageOffers(model.addablePageKinds);
    const below = active ? sectionTitle(active.section) : null;
    const q = query.trim().toLowerCase();

    const pick = (type: SectionType, looks: number) => {
        rememberRecent(type);
        if (looks > 1) add.setLookFor(type);
        else add.addSection(type);
    };

    const addServices = (ids: string[], showAs: ShowAs) => {
        rememberRecent("servicesList");
        add.addSection("servicesList", showAs, (at) =>
            draft.restoreSections((prev) =>
                prev.map((s, i) =>
                    i === at
                        ? ({
                              ...s,
                              content: { ...s.content, serviceIds: ids },
                          } as typeof s)
                        : s,
                ),
            ),
        );
        setPicking(false);
    };

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
    const { types: suggested, matched } = suggestedSections(
        page ? pageKind(page) : "FREE",
        draft.sections,
        addable,
    );
    const recentShown = recent.filter((t) => addable.includes(t));
    const looks = (t: SectionType) => BLOCK_META[t].variants.length;

    const pageRows = canAddPage ? (
        <Group label={phone ? "A page" : "Add a page"}>
            <PageRow
                icon={FilePlus}
                label="Blank page"
                onClick={() => setPageSheet("blank")}
            />
            {page ? (
                <PageRow
                    icon={Copy}
                    label="Copy this page"
                    note={page.title}
                    onClick={() => setPageSheet("copy")}
                />
            ) : null}
            {offers.length > 0 ? (
                <li>
                    <p className="label px-2 pb-1 pt-1.5">Ready pages</p>
                    <ul className="flex flex-wrap gap-1.5 px-2">
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
                <Group label="Suggested for this page">
                    {matched && page ? (
                        <li className="px-2 text-xs text-muted-foreground">
                            {
                                // `matched` is only ever a module page.
                                MODULE_PAGE_OFFERS[
                                    pageKind(page) as ModulePageKind
                                ].label
                            }{" "}
                            pages often have these. Yours doesn&apos;t yet.
                        </li>
                    ) : null}
                    {suggested.map((t) => (
                        <Entry
                            key={t}
                            icon={SECTION_ICONS[t]}
                            label={SECTION_LABELS[t]}
                            hint={SECTION_HINTS[t]}
                            looks={looks(t)}
                            onClick={() => pick(t, looks(t))}
                        />
                    ))}
                </Group>
            ) : null}

            {recentShown.length > 0 && !phone ? (
                <Group label="Recent">
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

            {business.length > 0 ? (
                <Group label="From your business">
                    <li className="px-2 text-xs text-muted-foreground">
                        Filled in, kept up to date
                    </li>
                    {business.map((f) =>
                        f.head === "servicesList" ? (
                            serviceCount === 0 ? null : (
                                <Entry
                                    key={f.head}
                                    icon={ConciergeBell}
                                    label="A service"
                                    hint={
                                        serviceCount === null
                                            ? SECTION_HINTS.servicesList
                                            : `${serviceCount} ${serviceCount === 1 ? "service" : "services"}`
                                    }
                                    onClick={
                                        services?.ok
                                            ? () => setPicking(true)
                                            : () => pick("servicesList", 1)
                                    }
                                />
                            )
                        ) : (
                            <FamilyEntry
                                key={f.head}
                                family={f}
                                onPick={pick}
                            />
                        ),
                    )}
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
                    placeholder={
                        phone
                            ? "Search pages, sections, your business"
                            : "Search pages, sections and your business"
                    }
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
        router.push(`/sites/${model.siteId}?page=${next.id}`);
        router.refresh();
    }
    return (
        <AddPageSheet
            open
            siteId={model.siteId}
            address={model.address}
            offers={addPageOffers(model.addablePageKinds)}
            page={model.page}
            start={start}
            onClose={onClose}
            onAdded={opened}
        />
    );
}

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
                className="w-full justify-start gap-2.5 px-2"
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
        <Group label="Add a page">
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
