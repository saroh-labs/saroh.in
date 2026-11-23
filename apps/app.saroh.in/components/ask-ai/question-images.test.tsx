// @vitest-environment jsdom
/** A sent message's images (board AIImgThread): one big, a row of small, three and "+n", opened in a viewer. */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QuestionImages, shownTiles } from "./question-images";

const some = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        mediaId: `m${i}`,
        url: `https://media.test/${i}.png`,
        filename: `p${i}.png`,
    }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

describe("a message's images", () => {
    it("shows 1 to 4 as they are and 5 to 10 as three and a +n tile", () => {
        expect(shownTiles(1)).toEqual({ shown: 1, more: 0 });
        expect(shownTiles(4)).toEqual({ shown: 4, more: 0 });
        expect(shownTiles(5)).toEqual({ shown: 3, more: 2 });
        expect(shownTiles(10)).toEqual({ shown: 3, more: 7 });
    });

    it("draws the tiles and '+7' on the last of ten", () => {
        act(() => root.render(<QuestionImages images={some(10)} />));
        expect(host.querySelectorAll("li")).toHaveLength(3);
        expect(host.textContent).toContain("+7");
    });

    it("a thumbnail opens the viewer at that image, with its place among the message's", () => {
        act(() => root.render(<QuestionImages images={some(4)} />));
        act(() =>
            host
                .querySelectorAll<HTMLButtonElement>("li button")
                .item(1)
                .click(),
        );
        expect(document.body.textContent).toContain("p1.png");
        expect(document.body.textContent).toContain("2 of 4");
        expect(
            document.body.querySelector('button[aria-label="Next image"]'),
        ).toBeTruthy();
    });
});
