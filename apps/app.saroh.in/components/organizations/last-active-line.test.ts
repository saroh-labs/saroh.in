import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LastActiveLine } from "./last-active-line";

describe("LastActiveLine", () => {
    it("draws nothing on the server, so its zone can never disagree with the browser's", () => {
        // A minute ago would read "Active now" wherever it was counted —
        // the server still leaves it to the browser.
        const at = new Date(Date.now() - 60_000).toISOString();
        expect(renderToString(createElement(LastActiveLine, { at }))).toBe("");
        expect(
            renderToString(createElement(LastActiveLine, { at: null })),
        ).toBe("");
    });
});
