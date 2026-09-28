import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanelDivider } from "./editor-chrome";

/**
 * The divider is a cell of the editor's grid: the narrow layout counts a 1px
 * column for it. Hidden below a breakpoint, the page slid into that column
 * and drew blank on a phone turned on its side (G4).
 */
describe("PanelDivider", () => {
    it("keeps its grid cell at every width", () => {
        const html = renderToStaticMarkup(
            <PanelDivider
                label="Resize the block list"
                width={232}
                min={180}
                max={360}
                reset={232}
                onResize={() => undefined}
                onNudge={() => undefined}
            />,
        );
        const cls =
            /role="separator"[^>]*class="([^"]*)"/.exec(html)?.[1] ??
            /class="([^"]*)"[^>]*role="separator"/.exec(html)?.[1];
        expect(cls).toBeTruthy();
        expect(cls?.split(/\s+/)).not.toContain("hidden");
    });
});
