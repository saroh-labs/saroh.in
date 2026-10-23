// @vitest-environment jsdom
/**
 * The sheet a fresh editor opens with (DEC-182): only a phone's rail sheet,
 * open when the editor was started afresh, is open again; nothing else
 * opens on its own.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EditorSelection } from "@/components/sites/editor/use-editor-selection";
import type { EditorLayout, EditorSheet } from "./use-editor-layout";
import { useEditorSheets } from "./use-editor-layout";

function Probe(props: { layout: EditorLayout; initial: EditorSheet }) {
    const { sheet } = useEditorSheets(
        {} as EditorSelection,
        props.layout,
        false,
        props.initial,
    );
    return <p data-sheet={sheet ?? "none"} />;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe("useEditorSheets: the sheet a fresh editor opens with", () => {
    it.each([
        ["phone", "rail", "rail"],
        ["phone", "inspector", null],
        ["phone", null, null],
        ["narrow", "rail", null],
        ["wide", "rail", null],
    ] as const)("%s, %s open before: %s", (layout, initial, expected) => {
        act(() => root.render(<Probe layout={layout} initial={initial} />));
        expect(host.querySelector("p")?.dataset.sheet).toBe(expected ?? "none");
    });
});
