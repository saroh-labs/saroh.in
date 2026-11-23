import { describe, expect, it } from "vitest";

import type { Attachment } from "./images";
import { admit, boxLine, countWords, megabytes, settled } from "./images";

const file = (name: string, type = "image/jpeg", size = 1000) => ({
    name,
    type,
    size,
});
const one = (over: Partial<Attachment> = {}): Attachment => ({
    key: "a",
    name: "a.jpg",
    status: "ready",
    progress: 100,
    preview: null,
    ...over,
});

describe("which images fit in the box", () => {
    it("keeps the first ten in the order picked, and says how many weren't added", () => {
        const picked = Array.from({ length: 13 }, (_, i) => file(`p${i}.jpg`));
        const got = admit(10, picked);
        expect(got.take.map((f) => f.name)).toEqual(
            picked.slice(0, 10).map((f) => f.name),
        );
        expect(got.problem).toBe(
            "Up to 10 images in one message. 3 weren't added.",
        );
        expect(admit(9, picked.slice(0, 10)).problem).toContain(
            "1 wasn't added",
        );
    });

    it("counts only what is already in against the ten", () => {
        expect(admit(0, [file("a.jpg")])).toEqual({
            take: [],
            problem: "Up to 10 images in one message. 1 wasn't added.",
        });
    });

    it("turns away a file that isn't a JPG, PNG, WebP or GIF, naming it", () => {
        const got = admit(10, [
            file("price-list.pdf", "application/pdf"),
            file("a.png", "image/png"),
        ]);
        expect(got.take.map((f) => f.name)).toEqual(["a.png"]);
        expect(got.problem).toBe(
            "price-list.pdf isn't an image. Choose a JPG, PNG, WebP or GIF.",
        );
        // AVIF passes the media store, not the provider.
        expect(admit(10, [file("a.avif", "image/avif")]).take).toEqual([]);
    });

    it("turns away a GIF over 5 MB, which goes up as it is; a big photo is made smaller first", () => {
        const big = 14.2 * 1024 * 1024;
        const got = admit(10, [file("loop.gif", "image/gif", big)]);
        expect(got.take).toEqual([]);
        expect(got.problem).toBe(
            "loop.gif is 14.2 MB. Each image can be up to 5 MB.",
        );
        expect(
            admit(10, [file("shop-front.jpg", "image/jpeg", big)]).take,
        ).toHaveLength(1);
        expect(megabytes(14.2 * 1024 * 1024)).toBe("14.2 MB");
    });

    it("says the wrong type before the size before too many", () => {
        const got = admit(1, [
            file("a.jpg"),
            file("b.jpg"),
            file("c.pdf", "application/pdf"),
        ]);
        expect(got.problem).toContain("c.pdf isn't an image");
    });
});

describe("the count under the box", () => {
    it("says nothing for an empty box, then the count, the uploads, and the most", () => {
        expect(countWords([])).toBeNull();
        expect(countWords([one()])).toBe("1 of 10");
        expect(
            countWords([
                one(),
                one({ status: "uploading" }),
                one({ status: "uploading" }),
            ]),
        ).toBe("3 of 10 · 2 uploading");
        expect(countWords(Array.from({ length: 10 }, () => one()))).toBe(
            "10 of 10 · the most for one message",
        );
    });
});

describe("the one line inside the box: the worst wins", () => {
    it("a failed upload beats a problem beats a slow one", () => {
        const failed = one({
            key: "f",
            name: "tape-rolls.jpg",
            status: "failed",
        });
        const going = one({ status: "uploading" });
        expect(boxLine([failed, going], "x", true)).toEqual({
            kind: "failed",
            key: "f",
            words: "tape-rolls.jpg didn't upload.",
        });
        expect(
            boxLine(
                [going],
                "Up to 10 images in one message. 3 weren't added.",
                true,
            ),
        ).toMatchObject({ kind: "problem" });
        expect(boxLine([going], null, true)).toMatchObject({
            kind: "slow",
            words: "Slow connection. Still uploading. You can keep typing.",
        });
        expect(boxLine([one()], null, true)).toBeNull();
    });

    it("Ask waits until every image is in, failed or still going", () => {
        expect(settled([one(), one()])).toBe(true);
        expect(settled([one(), one({ status: "uploading" })])).toBe(false);
        expect(settled([one({ status: "failed" })])).toBe(false);
        expect(settled([])).toBe(true);
    });
});
