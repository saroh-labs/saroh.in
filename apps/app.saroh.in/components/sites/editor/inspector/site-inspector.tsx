"use client";

import { IconButton } from "@saroh/ui/icon-button";
import { TabStrip } from "@saroh/ui/tabs";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { FixedBlockInspector } from "@/components/sites/blocks/fixed-block-inspector";
import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { count } from "@/lib/format/plural";
import type { Flag } from "@/lib/sites/service";

import { SECTION_LABELS, sectionTitle } from "../editor-constants";
import type { PhotoTarget } from "../sheets/photo-sheet";
import { PhotoSheet } from "../sheets/photo-sheet";
import { PhotoSheetOpener } from "../sheets/photo-sheet-opener";
import { PriceSheet } from "../sheets/price-sheet";
import type { EditorModel } from "../shell/editor-model";
import { ContentTab } from "./content-tab";
import { FeedbackTab } from "./feedback-tab";
import { PageAtRest } from "./page-at-rest";
import { sectionActions } from "./section-actions";
import { StyleTab } from "./style-tab";
import { VisibilityTab } from "./visibility-tab";

export type InspectorTab = "content" | "style" | "visibility" | "feedback";

/** The column's title row (`fix/WXKSelected`): a kicker over a title. */
function InspectorHeader({
    kicker,
    title,
    onClose,
}: {
    kicker: string;
    title: string;
    onClose?: () => void;
}) {
    return (
        <header className="flex shrink-0 items-start gap-2 px-4 pb-2.5 pt-3">
            <div className="min-w-0 flex-1">
                <h2
                    data-ph-mask=""
                    className="truncate text-[0.9375rem] font-semibold"
                >
                    {title}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                    {kicker}
                </p>
            </div>
            {onClose ? (
                <IconButton
                    label="Close, nothing selected"
                    icon={<X />}
                    variant="ghost"
                    onClick={onClose}
                />
            ) : null}
        </header>
    );
}

/**
 * The right column with the Website area on (U47): the page at rest
 * (`fix/WXKRest`), a section with its tabs Content · Style · Visibility ·
 * Feedback (`fix/WXKSelected`, `WXKStyle`), or the header or footer on every
 * page (`fix/WXMGlobal`). Every write goes back through the editor's hooks
 * (`model`), the one place that saves.
 */
export function SiteInspector({
    model,
    activeFlags,
    unreadableSections,
    onShowFlag,
}: {
    model: EditorModel;
    /** The selected section's flags. */
    activeFlags: Flag[];
    unreadableSections: string[];
    /** A check's fix that is a place on the page (`useEditorJumps`). */
    onShowFlag: (flag: Flag) => void;
}) {
    const { siteId, pageId, pages, page, active, selection, draft, review } =
        model;
    const services = useServicesForPicker();
    const actions = sectionActions(model);
    const [own, setOwn] =
        useState<Exclude<InspectorTab, "feedback">>("content");
    const [priceFor, setPriceFor] = useState<string | null>(null);
    const [photoFor, setPhotoFor] = useState<PhotoTarget | null>(null);
    const tab: InspectorTab =
        selection.inspector === "feedback" ? "feedback" : own;
    const openTab = (next: InspectorTab) => {
        if (next === "feedback") return selection.setInspector("feedback");
        setOwn(next);
        selection.setInspector("block");
    };
    const deselect = () => selection.setSelectedIndex(null);

    let header: ReactNode = null;
    let tabs: ReactNode = null;
    let body: ReactNode = null;

    if (selection.selectedChrome) {
        const part = selection.selectedChrome;
        header = (
            <InspectorHeader
                title={part === "header" ? "Header" : "Footer"}
                kicker={`On every page · ${count(pages.length, "page")}`}
                onClose={deselect}
            />
        );
        body = (
            <FixedBlockInspector
                part={part}
                siteId={siteId}
                text={model.chrome}
                bare
            />
        );
    } else if (active) {
        const { index, section } = active;
        const notes =
            section.key === undefined
                ? 0
                : (review.notesByKey.get(section.key) ?? 0);
        header = (
            <InspectorHeader
                title={sectionTitle(section)}
                kicker={`${SECTION_LABELS[section.type]} section · ${index + 1} of ${draft.sections.length}`}
                onClose={deselect}
            />
        );
        tabs = (
            <TabStrip<InspectorTab>
                label="Inspector"
                idPrefix="inspector"
                tabs={[
                    { value: "content", label: "Content" },
                    { value: "style", label: "Style" },
                    { value: "visibility", label: "Visibility" },
                    {
                        value: "feedback",
                        label: "Feedback",
                        ...(notes > 0 ? { count: notes } : {}),
                    },
                ]}
                value={tab}
                onValueChange={openTab}
                listClassName="px-2"
            />
        );
        const onChange = (next: typeof section) => draft.replaceAt(index, next);
        body =
            tab === "style" ? (
                <StyleTab
                    section={section}
                    style={model.siteStyle.style}
                    styleOptions={model.styleOptions}
                    onChange={onChange}
                    onOpenBrand={() => model.openRail("brand")}
                />
            ) : tab === "visibility" ? (
                <VisibilityTab
                    section={section}
                    onToggleHidden={() => model.edits.toggleHidden(index)}
                    onHideOnPhone={(hide) => actions.hideOnPhone(index, hide)}
                />
            ) : tab === "feedback" ? (
                <FeedbackTab
                    siteId={siteId}
                    pageId={pageId}
                    section={section}
                    comments={review.comments}
                    review={review.review}
                    loadFailed={review.loadFailed}
                    refreshReview={review.refreshReview}
                    onWholeSite={() => model.openRail("feedback")}
                />
            ) : (
                <PhotoSheetOpener
                    value={
                        model.readOnly
                            ? null
                            : (field) => setPhotoFor({ index, field })
                    }
                >
                    <ContentTab
                        siteId={siteId}
                        section={section}
                        pages={pages}
                        services={services}
                        flags={activeFlags}
                        unreadable={
                            section.key !== undefined &&
                            unreadableSections.includes(section.key)
                        }
                        error={
                            draft.errorIndex === index
                                ? draft.errorMessage
                                : null
                        }
                        heldBack={draft.heldBackAt(index)}
                        onChange={onChange}
                        onPrice={setPriceFor}
                        onAddNote={() => openTab("feedback")}
                    />
                </PhotoSheetOpener>
            );
    } else if (page) {
        header = (
            <InspectorHeader
                title={page.title}
                kicker="Page · Nothing selected"
            />
        );
        body = (
            <PageAtRest
                siteId={siteId}
                page={page}
                pages={pages}
                address={model.address}
                flags={model.publish.siteFlags.flags}
                onShowFlag={onShowFlag}
                onFlagsChanged={() => void model.publish.refreshFlags()}
                onOpenSettings={() => model.openPageSettings(page.id)}
            />
        );
    }

    return (
        <aside
            aria-label="Inspector"
            data-site-inspector={
                selection.selectedChrome ?? (active ? tab : "page")
            }
            className="flex min-h-0 flex-col"
        >
            {header}
            {tabs}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
            <PhotoSheet
                model={model}
                target={photoFor}
                onClose={() => setPhotoFor(null)}
            />
            <PriceSheet
                siteId={siteId}
                serviceId={priceFor}
                onClose={() => setPriceFor(null)}
            />
        </aside>
    );
}
