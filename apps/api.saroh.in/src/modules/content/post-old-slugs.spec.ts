import { liveSlugOf, nextOldSlugs } from "./post-old-slugs";

describe("nextOldSlugs (U17a)", () => {
    it("keeps the live link when a publish moves the post", () => {
        expect(nextOldSlugs([], "bridal-makeup-trial", "bridal-trial")).toEqual(
            ["bridal-makeup-trial"],
        );
    });

    it("keeps nothing for a post that was never live", () => {
        expect(nextOldSlugs([], null, "bridal-trial")).toEqual([]);
    });

    it("never lists the current link, and lists each old one once", () => {
        expect(nextOldSlugs(["a", "b", "a"], "b", "a")).toEqual(["b"]);
    });

    it("republishing at the same link changes nothing", () => {
        expect(nextOldSlugs(["old"], "same", "same")).toEqual(["old"]);
    });
});

describe("liveSlugOf", () => {
    it("reads the slug a post snapshot is live at", () => {
        expect(liveSlugOf({ post: { slug: "bridal-trial" } })).toBe(
            "bridal-trial",
        );
    });

    it("is null for anything else", () => {
        for (const bad of [
            null,
            undefined,
            {},
            { post: null },
            { post: { slug: "" } },
            "x",
        ]) {
            expect(liveSlugOf(bad)).toBeNull();
        }
    });
});
