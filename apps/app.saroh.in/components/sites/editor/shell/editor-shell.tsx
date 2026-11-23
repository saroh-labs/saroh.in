"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { RAIL_DEFAULT } from "@/lib/sites/editor-prefs";
import type { Flag } from "@/lib/sites/service";

import { AddPageFor, AddPanel } from "../add/add-panel";
import type { EditorTopBarProps } from "../editor-bar";
import type { EditorPanelsProps } from "../editor-panels";
import { EditorPanels } from "../editor-panels";
import { PageRegion } from "../page-switch";
import { COMMAND_MENU_READY, CommandMenu } from "../panels/command-menu";
import { FeedbackPanel } from "../panels/feedback-panel";
import { HistoryPanel } from "../panels/history-panel";
import { PREVIEW_FRAMES_READY, PreviewFrames } from "../panels/preview-frames";
import { CanvasBar } from "./canvas-bar";
import { DeskTopBar } from "./desk-top-bar";
import type { EditorModel } from "./editor-model";
import type { TrailTab } from "./editor-trail";
import { EditorTrail, siteTrailTabs } from "./editor-trail";
import { InspectorFrame } from "./inspector-frame";
import { PagesTree } from "./pages-tree";
import { ReviewerStrip } from "./reviewer-strip";
import { RIGHT_MIN, RightColumn, useRightWidth } from "./right-column";

/** The boards' widths (`fix/WXKRest`) until someone drags a divider. */
const LEFT_PANEL = 280;
/**
 * The narrowest each left panel is drawn (`fix/WXBBrand`, `fix/WXBAdd`,
 * `fix/WXEHistory`). A width the old editor saved (230) is not honoured
 * below it: the panels' rows were drawn for these widths.
 */
export function leftPanelMin(trail: string): number {
    if (trail === "brand" || trail === "add") return 380;
    if (trail === "history") return 360;
    return LEFT_PANEL;
}

export interface EditorShellProps {
    model: EditorModel;
    /** The props today's top bar takes; the desk bar runs on the same. */
    bar: EditorTopBarProps;
    /** The props today's `EditorPanels` takes, less its three slots. */
    panels: Omit<EditorPanelsProps, "rail" | "canvas" | "inspector" | "trail">;
    /** The page itself (`EditorCanvas`). */
    canvas: ReactNode;
    /** The inspector's body (`InspectorHost` until U47). */
    inspector: ReactNode;
    /** Rail › Brand's panel (today's Brand tab, U24b's panel). */
    brand: ReactNode;
    /** The site's flags on this page, by section, for the tree's dots. */
    flagsBySection: Map<number, Flag[]>;
    /** The rail's tabs; the site editor's five (a reader's three) by default. */
    trailTabs?: TrailTab[];
}

/**
 * The desk editor with the Website area on (U46, `fix/WXKRest`,
 * `fix/WXMReviewer`; 1440 `fix/WXEEditor`): the trimmed bar, a reader's
 * request strip, then the rail of tabs | the left panel | the canvas under
 * its bar | the inspector frame. Wide (above 1200) that is 64 | 280 | page
 * | 360; narrow, the inspector is a sheet as today (`EditorPanels`). The
 * dividers still resize both panels.
 *
 * Every panel is a file a later unit fills (KTD-E2) from `model`; this file
 * only lays them out.
 */
export function EditorShell({
    model,
    bar,
    panels,
    canvas,
    inspector,
    brand,
    flagsBySection,
    trailTabs,
}: EditorShellProps) {
    const [findOpen, setFindOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    // The tree's Add a page opens Add's own sheet (U46e, `fix/WXBAddPage`).
    const [addingPage, setAddingPage] = useState(false);
    const { viewport } = model;
    const right = useRightWidth();

    // ⌘K opens Find once it is built (U46c).
    useEffect(() => {
        if (!COMMAND_MENU_READY) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setFindOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const left =
        model.trail === "add" ? (
            <AddPanel model={model} />
        ) : model.trail === "brand" ? (
            brand
        ) : model.trail === "history" ? (
            <HistoryPanel model={model} />
        ) : model.trail === "feedback" ? (
            <FeedbackPanel model={model} />
        ) : (
            <PagesTree
                model={model}
                flagsBySection={flagsBySection}
                onAddPage={() => setAddingPage(true)}
                onAddSection={() => model.openRail("add")}
            />
        );

    const page = model.page;
    const railMin = leftPanelMin(model.trail);
    const railShown = Math.max(
        viewport.railWidth === RAIL_DEFAULT ? LEFT_PANEL : viewport.railWidth,
        railMin,
    );
    return (
        <>
            <DeskTopBar
                bar={bar}
                model={model}
                onFind={() => setFindOpen(true)}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
            />
            {model.readOnly ? <ReviewerStrip model={model} /> : null}
            <EditorPanels
                {...panels}
                viewport={{
                    ...viewport,
                    // The boards' widths stand in for the old defaults.
                    railWidth: railShown,
                    // Dragging and the keys start from the width drawn.
                    setRailWidth: (px) =>
                        viewport.setRailWidth(Math.max(px, railMin)),
                    nudgeRail: (d) =>
                        viewport.setRailWidth(Math.max(railShown + d, railMin)),
                    // The right column's own width (Edit · Ask AI).
                    panelWidth: right.width,
                    setPanelWidth: right.setWidth,
                    nudgePanel: right.nudge,
                }}
                panelBounds={{
                    min: RIGHT_MIN,
                    max: right.max,
                    reset: right.reset,
                }}
                trail={
                    <EditorTrail
                        tabs={
                            trailTabs ??
                            siteTrailTabs(
                                model.readOnly,
                                model.review.openNotes,
                            )
                        }
                        value={model.trail}
                        onSelect={model.openRail}
                    />
                }
                rail={
                    <div
                        data-left-panel={model.trail}
                        className="flex min-h-0 min-w-0 flex-col bg-card"
                    >
                        {left}
                    </div>
                }
                canvas={
                    <main
                        aria-label="Page canvas"
                        className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]"
                    >
                        {viewport.previewing ? (
                            <span />
                        ) : (
                            <CanvasBar
                                address={model.address}
                                path={page?.path ?? "/"}
                                device={viewport.device}
                                zoom={viewport.zoom}
                                onDevice={viewport.setDevice}
                                onZoom={viewport.setZoom}
                                previewing={model.selection.trial !== null}
                            />
                        )}
                        {viewport.previewing && PREVIEW_FRAMES_READY ? (
                            <PreviewFrames
                                model={model}
                                onBack={() => viewport.setPreviewing(false)}
                            />
                        ) : (
                            <PageRegion shape="canvas">{canvas}</PageRegion>
                        )}
                    </main>
                }
                inspector={
                    <RightColumn askAi={model.askAi}>
                        <InspectorFrame>
                            <PageRegion shape="inspector">
                                {inspector}
                            </PageRegion>
                        </InspectorFrame>
                    </RightColumn>
                }
            />
            <CommandMenu
                model={model}
                open={findOpen}
                onOpenChange={setFindOpen}
            />
            {addingPage ? (
                <AddPageFor
                    model={model}
                    start="blank"
                    onClose={() => setAddingPage(false)}
                />
            ) : null}
        </>
    );
}
