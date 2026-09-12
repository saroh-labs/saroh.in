import { checkRenderability } from "./publication-renderability";

const hero = { type: "hero", content: { heading: "Northwind Supply" } };

describe("checkRenderability (#283)", () => {
    it("is renderable when every section still fits its block", () => {
        expect(
            checkRenderability({ pages: [{ path: "/", sections: [hero] }] }),
        ).toEqual({ renderable: true, unrenderable: [] });
    });

    it("names a section whose block type this build no longer has", () => {
        expect(
            checkRenderability({
                pages: [
                    {
                        path: "/",
                        sections: [hero, { type: "carousel3000", content: {} }],
                    },
                ],
            }),
        ).toEqual({
            renderable: false,
            unrenderable: [{ path: "/", index: 1, type: "carousel3000" }],
        });
    });

    it("names a section whose content no longer fits its block", () => {
        expect(
            checkRenderability({
                pages: [
                    {
                        path: "/about",
                        sections: [{ type: "hero", content: {} }],
                    },
                ],
            }),
        ).toEqual({
            renderable: false,
            unrenderable: [{ path: "/about", index: 0, type: "hero" }],
        });
    });

    it("treats a page with no sections as renderable", () => {
        expect(
            checkRenderability({ pages: [{ path: "/", sections: [] }] }),
        ).toEqual({ renderable: true, unrenderable: [] });
    });

    it.each([null, "snapshot", {}, { pages: "nope" }])(
        "treats an unreadable snapshot (%j) as not renderable",
        (snapshot) => {
            expect(checkRenderability(snapshot)).toEqual({
                renderable: false,
                unrenderable: [],
            });
        },
    );
});
