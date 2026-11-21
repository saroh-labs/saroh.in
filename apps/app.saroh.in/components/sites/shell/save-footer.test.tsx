import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SAVE_LINES, SaveFooter } from "./save-footer";

describe("SaveFooter (RULES §2: one going-live rule, said on every save)", () => {
    it("says a save waits for Publish, and never says Saved before Save is pressed (editor audit)", () => {
        const html = renderToStaticMarkup(
            <SaveFooter>
                <span>Save</span>
            </SaveFooter>,
        );
        expect(html).toContain("Goes live when you publish");
        expect(html).not.toContain("Saved");
        expect(html).toContain("<span>Save</span>");
    });

    it("says Saved once a save has happened", () => {
        expect(
            renderToStaticMarkup(
                <SaveFooter line="waits-for-publish">x</SaveFooter>,
            ),
        ).toContain("Saved · goes live when you publish");
    });

    it("says each exception in its own words", () => {
        expect(
            renderToStaticMarkup(
                <SaveFooter line="post-goes-live-alone">x</SaveFooter>,
            ),
        ).toContain(SAVE_LINES["post-goes-live-alone"]);
        expect(SAVE_LINES["from-your-code"]).toBe("Goes live from your code");
    });
});
