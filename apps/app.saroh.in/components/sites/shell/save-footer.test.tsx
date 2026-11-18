import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SAVE_LINES, SaveFooter } from "./save-footer";

describe("SaveFooter (RULES §2: one going-live rule, said on every save)", () => {
    it("says a save waits for Publish unless told otherwise", () => {
        const html = renderToStaticMarkup(
            <SaveFooter>
                <span>Save</span>
            </SaveFooter>,
        );
        expect(html).toContain("Saved · goes live when you publish");
        expect(html).toContain("<span>Save</span>");
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
