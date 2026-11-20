"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cloneElement, useState } from "react";

import { AddPanel } from "../add/add-panel";
import { useKeyboardUp } from "../edit-pill";
import type { EditorPanelsProps } from "../editor-panels";
import { selectRailTab } from "../editor-rail";
import { EditorSheet } from "../editor-sheet";
import type { EditorTopBarProps } from "../editor-top-bar";
import { useEditorBar } from "../editor-top-bar";
import type { InspectorHost } from "../inspector-host";
import type { EditorModel } from "../shell/editor-model";
import { ReviewerStrip } from "../shell/reviewer-strip";
import { FirstHint } from "./first-hint";
import { PageMenuSheet, PhonePageBar } from "./page-menu-sheet";
import type { PhoneBarKey } from "./phone-bar";
import { PhoneBar, ReaderBar } from "./phone-bar";
import { SectionSheet } from "./section-sheet";
import { SectionsSheet } from "./sections-sheet";

export interface PhoneShellProps {
    model: EditorModel;
    /** Today's top bar; its props drive the phone's own bar. */
    topBar: ReactElement<EditorTopBarProps>;
    /** Today's panels; the phone draws their canvas, rail and sheets itself. */
    children: ReactElement<EditorPanelsProps>;
}

/**
 * The one phone editor with the Website area on (U49, `fix/WXN*`,
 * `fix/WXEEditorPhone`): the top bar ← Website · page · Ask AI · Preview,
 * the page to tap, and one bar, Sections · Add · Brand · Publish. A tapped
 * section opens its sheet; Sections lists and moves them; Add is U46e's
 * panel; Brand is U24b's phone Brand (the rail's Brand tab); Publish opens
 * the Publish sheet with the chip's count on it. A reader's bar is their
 * verdict.
 *
 * It runs on the same hooks and props as today's phone (KTD-E1): no pill,
 * no Blocks sheet, no second bar. Off, `site-editor.tsx` draws today's.
 */
export function PhoneShell({ model, topBar, children }: PhoneShellProps) {
    const props = topBar.props;
    const {
        setBody,
        body,
        canvas: page,
        inspector,
        rail,
        brandActions,
        releases,
        dialogOpen,
    } = children.props;
    const bar = useEditorBar(props);
    const { sheets, selection, add, readOnly, viewport, active } = model;
    const { sheet, setSheet } = sheets;
    const keyboard = useKeyboardUp();
    // The whole phone editor: full-screen sheets are laid over both bars.
    const [frame, setFrame] = useState<HTMLDivElement | null>(null);
    const { previewing } = viewport;
    // What the old inspector was handed: this section's flags, and which
    // sections the server could not read.
    const host = (
        inspector as ReactElement<ComponentProps<typeof InspectorHost>>
    ).props;
    // The page, without the old phone's toolbar on a tapped block: its
    // moves are in the section's sheet now.
    const canvas = cloneElement(
        page as ReactElement<{ blockTools?: unknown }>,
        { blockTools: undefined },
    );

    const openRailSheet = (tab: "add" | "brand") => {
        selectRailTab(tab, selection.setRail, add.setAdding);
        setSheet(tab);
    };
    const closeSheet = () => {
        setSheet(null);
        add.setAdding(false);
    };
    const onBar = (key: PhoneBarKey) => {
        if (key === "publish") return model.openPublish();
        if (key === "sections") return setSheet("blocks");
        openRailSheet(key);
    };
    const barOpen: PhoneBarKey | null = model.publish.checking
        ? "publish"
        : sheet === "blocks"
          ? "sections"
          : sheet === "add" || sheet === "brand"
            ? sheet
            : null;
    const verdict = readOnly ? props.reviewerVerdict : undefined;

    // Preview has no editing tools; with the keyboard up a sheet sits there.
    let foot: ReactNode = null;
    if (previewing || keyboard) {
        // Nothing at the foot.
    } else if (readOnly) {
        foot = (
            <>
                <p
                    data-read-only-line=""
                    className="shrink-0 border-t px-4 py-2 text-[0.8125rem] text-muted-foreground"
                >
                    Read only. You can leave notes.
                </p>
                {verdict ? (
                    <ReaderBar onReview={() => setSheet("review")} />
                ) : null}
            </>
        );
    } else {
        foot = (
            <>
                <FirstHint hidden={sheet !== null} />
                <PhoneBar
                    open={barOpen}
                    waiting={model.status.waiting}
                    needsApproval={model.publish.needsApproval}
                    publishing={model.publish.publishing}
                    onSelect={onBar}
                />
            </>
        );
    }

    return (
        <div ref={setFrame} className="relative flex min-h-0 flex-1 flex-col">
            <PhonePageBar
                model={model}
                bar={bar}
                onPicker={() => setSheet("pages")}
            />
            {readOnly ? <ReviewerStrip review={model.review.review} /> : null}
            <div
                ref={setBody}
                data-layout="phone"
                data-phone-editor=""
                className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]"
            >
                {canvas}
            </div>
            {foot}

            <SectionSheet
                model={model}
                open={
                    !previewing &&
                    sheet === "inspector" &&
                    (active !== null ||
                        selection.selectedChrome !== null ||
                        selection.inspector === "feedback")
                }
                container={body}
                frame={frame}
                activeFlags={host.activeFlags}
                unreadableSections={host.unreadableSections}
                onMove={() => setSheet("blocks")}
                onBrand={() => openRailSheet("brand")}
                onClose={() => setSheet(null)}
            />
            <SectionsSheet
                model={model}
                open={!previewing && sheet === "blocks"}
                container={frame}
                onClose={closeSheet}
                onAdd={() => openRailSheet("add")}
                onPick={model.scrollToSection}
            />
            <EditorSheet
                open={!previewing && sheet === "add" && !dialogOpen}
                onClose={closeSheet}
                container={body}
                side="bottom"
                title="Add"
                closeLabel="Close Add"
            >
                <AddPanel model={model} phone />
            </EditorSheet>
            <EditorSheet
                open={!previewing && sheet === "brand" && !dialogOpen}
                onClose={closeSheet}
                container={body}
                side="bottom"
                title="Brand"
                actions={brandActions}
                closeLabel="Close Brand"
            >
                {rail}
            </EditorSheet>
            <PageMenuSheet
                open={sheet === "pages"}
                onClose={() => setSheet(null)}
                container={body}
                props={props}
                bar={bar}
                readerLinks={
                    readOnly
                        ? {
                              onSections: () => setSheet("blocks"),
                              onBrand: () => openRailSheet("brand"),
                          }
                        : undefined
                }
                onFeedback={() => {
                    selection.setSelectedIndex(null);
                    selection.setInspector("feedback");
                }}
            />
            {verdict ? (
                <EditorSheet
                    open={sheet === "review"}
                    onClose={() => setSheet(null)}
                    container={body}
                    side="bottom"
                    title="Your review"
                    closeLabel="Close your review"
                    className="h-[80%]"
                >
                    {verdict}
                </EditorSheet>
            ) : null}
            {releases ? (
                <EditorSheet
                    open={releases.open}
                    onClose={releases.onClose}
                    container={body}
                    side="bottom"
                    title="Test releases"
                    closeLabel="Close test releases"
                >
                    {releases.content}
                </EditorSheet>
            ) : null}
            {bar.pageSheet}
        </div>
    );
}
