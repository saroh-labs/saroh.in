"use client";

import type { ReactNode, RefObject } from "react";
import { useState } from "react";

import { PanelDivider } from "@/components/sites/editor-chrome";
import {
    railTabFor,
    selectRailTab,
} from "@/components/sites/editor/editor-rail";
import { EditorSheet } from "@/components/sites/editor/editor-sheet";
import { RailBottomBar } from "@/components/sites/editor/rail-bottom-bar";
import type {
    EditorLayout,
    EditorSheets,
} from "@/components/sites/editor/use-editor-layout";
import type { EditorSelection } from "@/components/sites/editor/use-editor-selection";
import type { EditorViewport } from "@/components/sites/editor/use-editor-viewport";
import {
    editorColumns,
    narrowColumns,
} from "@/components/sites/editor/use-editor-viewport";
import {
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
} from "@/lib/sites/editor-prefs";

/**
 * Where the rail, the page and the inspector go (G4). On a desk they are three
 * columns with a drag handle between each (#340). Narrow, the inspector leaves
 * its column and opens over the page as a sheet when something is chosen. On
 * a phone the page fills the width, and the rail opens as a sheet from a bar
 * at the foot of the screen.
 *
 * Preview (G5) puts the rail, the handles and the inspector away, kept
 * mounted where they are mounted, and the page takes the whole width.
 */
export function EditorPanels({
    layout,
    viewport,
    sheets,
    selection,
    adding,
    setAdding,
    dialogOpen,
    hasSubject,
    openNotes,
    rail,
    canvas,
    inspector,
}: {
    layout: EditorLayout;
    viewport: EditorViewport;
    sheets: EditorSheets;
    selection: EditorSelection;
    adding: boolean;
    setAdding: (adding: boolean) => void;
    /** A dialog over the editor (choosing a look) stands in for the rail. */
    dialogOpen: boolean;
    /** A block, the header or the footer is selected. */
    hasSubject: boolean;
    openNotes: number;
    rail: ReactNode;
    canvas: ReactNode;
    inspector: ReactNode;
}) {
    // The sheets are drawn inside the body, below the top bar (the design).
    const [body, setBody] = useState<HTMLDivElement | null>(null);
    const { previewing, railWidth, panelWidth } = viewport;
    const { sheet, setSheet } = sheets;
    const wide = layout === "wide";
    const phone = layout === "phone";
    const tools = previewing ? { hidden: true } : { className: "contents" };
    const railTab = railTabFor(selection.rail, adding);

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
                    title="Inspector"
                    closeLabel="Close the block panel"
                    returnFocus={() =>
                        subjectOnCanvas(viewport.canvasRef, selection)
                    }
                >
                    {inspector}
                </EditorSheet>
            )}

            {phone && !previewing ? (
                <>
                    <EditorSheet
                        open={sheet === "rail" && !dialogOpen}
                        onClose={() => setSheet(null)}
                        container={body}
                        side="bottom"
                        title="Blocks, adding and brand"
                        closeLabel="Close the block list"
                        className="h-[75%]"
                    >
                        {rail}
                    </EditorSheet>
                    <RailBottomBar
                        tab={railTab}
                        open={sheet === "rail"}
                        feedbackOpen={
                            sheet === "inspector" &&
                            selection.inspector === "feedback"
                        }
                        openNotes={openNotes}
                        onTab={(next) => {
                            // The open tab again puts the sheet away.
                            if (sheet === "rail" && next === railTab) {
                                setSheet(null);
                                return;
                            }
                            selectRailTab(next, selection.setRail, setAdding);
                            setSheet("rail");
                        }}
                        onFeedback={() => selection.setInspector("feedback")}
                    />
                </>
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
        return canvas.querySelector<HTMLElement>(
            `button[aria-label^="${name}, on every page"]`,
        );
    }
    if (selectedIndex === null) return null;
    return canvas.querySelector<HTMLElement>(
        `[data-block-index="${selectedIndex}"] > button[aria-pressed]`,
    );
}
