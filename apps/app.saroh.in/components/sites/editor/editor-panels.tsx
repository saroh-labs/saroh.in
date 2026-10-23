"use client";

import type { ReactNode, RefObject } from "react";

import { queryCanvas } from "@/components/sites/canvas/device-frame";
import type { EditorViewport } from "@/components/sites/canvas/use-editor-viewport";
import {
    editorColumns,
    narrowColumns,
} from "@/components/sites/canvas/use-editor-viewport";
import { EditPill } from "@/components/sites/editor/edit-pill";
import type { RailTab } from "@/components/sites/editor/editor-rail";
import { selectRailTab } from "@/components/sites/editor/editor-rail";
import { EditorSheet } from "@/components/sites/editor/editor-sheet";
import type {
    EditorLayout,
    EditorSheets,
} from "@/components/sites/editor/use-editor-layout";
import type { EditorSelection } from "@/components/sites/editor/use-editor-selection";
import {
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
} from "@/lib/sites/editor-prefs";
import { PanelDivider } from "./editor-chrome";

/**
 * Where the rail, the page and the inspector go (G4). On a desk they are three
 * columns with a drag handle between each (#340). Narrow, the inspector leaves
 * its column and opens over the page as a sheet when something is chosen. On
 * a phone the page fills the screen under one floating pill, Blocks · + ·
 * Brand, each opening its sheet from the foot (DEC-185), and a block's
 * settings rise in a sheet with no scrim, its toolbar still in reach.
 *
 * Preview (G5) puts the rail, the handles and the inspector away, kept
 * mounted where they are mounted, and the page takes the whole width.
 */
export function EditorPanels({
    layout,
    viewport,
    sheets,
    selection,
    setAdding,
    dialogOpen,
    hasSubject,
    rail,
    canvas,
    inspector,
    inspectorTitle,
    pageTitle,
    overlayOpen = false,
    body,
    setBody,
    releases,
}: {
    layout: EditorLayout;
    viewport: EditorViewport;
    sheets: EditorSheets;
    selection: EditorSelection;
    setAdding: (adding: boolean) => void;
    /** A dialog over the editor (choosing a look) stands in for the rail. */
    dialogOpen: boolean;
    /** A block, the header or the footer is selected. */
    hasSubject: boolean;
    rail: ReactNode;
    /** A phone's settings sheet names what it is about: "Product grid". */
    inspectorTitle: string;
    /** The open page's title: "Blocks on Home". */
    pageTitle: string;
    /** Something else is over the page (Publish): the pill stays away. */
    overlayOpen?: boolean;
    /** The editor's body, below the top bar, where sheets are laid. */
    body: HTMLDivElement | null;
    setBody: (el: HTMLDivElement | null) => void;
    canvas: ReactNode;
    inspector: ReactNode;
    /**
     * The Test releases panel (DEC-071, T11), laid over the page like the
     * editor's other sheets: beside it on a desk or a narrow window, from
     * the foot on a phone. Absent while test releases are off.
     */
    releases?: { open: boolean; onClose: () => void; content: ReactNode };
}) {
    const { previewing, railWidth, panelWidth } = viewport;
    const { sheet, setSheet } = sheets;
    const wide = layout === "wide";
    const phone = layout === "phone";
    const tools = previewing ? { hidden: true } : { className: "contents" };
    /** Open the rail on one of its tabs, in its phone sheet. */
    const openRail = (tab: RailTab) => {
        selectRailTab(tab, selection.setRail, setAdding);
        setSheet(tab === "page" ? "blocks" : tab);
    };
    const closeRail = () => {
        setSheet(null);
        setAdding(false);
    };

    const columns = previewing
        ? "1fr"
        : wide
          ? // See `editorColumns` for how the widths are shared.
            editorColumns(railWidth, panelWidth)
          : phone
            ? "minmax(0,1fr)"
            : narrowColumns(railWidth);

    return (
        <>
            <div
                ref={setBody}
                data-layout={layout}
                className="relative grid min-h-0 flex-1 grid-cols-[var(--editor-cols)]"
                style={{ "--editor-cols": columns } as React.CSSProperties}
            >
                {phone ? null : (
                    <div {...tools}>
                        {rail}
                        <PanelDivider
                            label="Resize the block list"
                            width={railWidth}
                            min={RAIL_MIN}
                            max={RAIL_MAX}
                            reset={RAIL_DEFAULT}
                            onResize={viewport.setRailWidth}
                            onNudge={viewport.nudgeRail}
                        />
                    </div>
                )}

                {canvas}

                {phone && !previewing ? (
                    <EditPill
                        hidden={
                            sheet !== null ||
                            dialogOpen ||
                            overlayOpen ||
                            releases?.open === true
                        }
                        onBlocks={() => openRail("page")}
                        onAdd={() => openRail("add")}
                        onBrand={() => openRail("brand")}
                    />
                ) : null}

                {wide ? (
                    <div {...tools}>
                        <PanelDivider
                            label="Resize the inspector"
                            width={panelWidth}
                            min={PANEL_MIN}
                            max={PANEL_MAX}
                            reset={PANEL_DEFAULT}
                            onResize={viewport.setPanelWidth}
                            onNudge={viewport.nudgePanel}
                            panelSide="right"
                        />
                        {inspector}
                    </div>
                ) : null}
            </div>

            {wide || previewing ? null : (
                <EditorSheet
                    open={
                        sheet === "inspector" &&
                        (hasSubject || selection.inspector === "feedback")
                    }
                    onClose={() => setSheet(null)}
                    container={body}
                    side={phone ? "bottom" : "right"}
                    title={phone ? inspectorTitle : "Inspector"}
                    closeLabel="Close the block panel"
                    // A phone keeps the page, and the block's toolbar, in
                    // reach above the settings (DEC-185).
                    modal={!phone}
                    returnFocus={() =>
                        subjectOnCanvas(viewport.canvasRef, selection)
                    }
                >
                    {inspector}
                </EditorSheet>
            )}

            {phone && !previewing ? (
                <EditorSheet
                    open={
                        (sheet === "blocks" ||
                            sheet === "add" ||
                            sheet === "brand") &&
                        !dialogOpen
                    }
                    onClose={closeRail}
                    container={body}
                    side="bottom"
                    title={
                        sheet === "add"
                            ? "Add a block"
                            : sheet === "brand"
                              ? "Brand"
                              : `Blocks on ${pageTitle}`
                    }
                    closeLabel={
                        sheet === "add"
                            ? "Close Add a block"
                            : sheet === "brand"
                              ? "Close Brand"
                              : "Close the block list"
                    }
                >
                    {rail}
                </EditorSheet>
            ) : null}

            {releases ? (
                <EditorSheet
                    open={releases.open}
                    onClose={releases.onClose}
                    container={body}
                    side={phone ? "bottom" : "right"}
                    title="Test releases"
                    closeLabel="Close test releases"
                    // Wider than the inspector: a release carries its links
                    // and five actions.
                    className={phone ? undefined : "w-[400px] max-w-[92%]"}
                >
                    {releases.content}
                </EditorSheet>
            ) : null}
        </>
    );
}

/**
 * The selected block's label on the page, or the header's or footer's: where
 * focus goes back to when the inspector closes, so a keyboard user carries on
 * from the thing they were changing.
 */
function subjectOnCanvas(
    canvasRef: RefObject<HTMLDivElement | null>,
    { selectedIndex, selectedChrome }: EditorSelection,
): HTMLElement | null {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    if (selectedChrome !== null) {
        const name = selectedChrome === "header" ? "Header" : "Footer";
        return queryCanvas<HTMLElement>(
            canvas,
            `button[aria-label^="${name}, on every page"]`,
        );
    }
    if (selectedIndex === null) return null;
    return queryCanvas<HTMLElement>(
        canvas,
        `[data-block-index="${selectedIndex}"] > button[aria-pressed]`,
    );
}
