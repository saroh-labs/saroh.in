import { describe, expect, it } from "vitest";

import {
    askNewest,
    newestOf,
    revalidate,
    SitePageTags,
    tellRevalidated,
} from "./tag-store";
import { fakeNamespace, fakeStorage } from "./testing";

describe("the page cache's tag store (#863)", () => {
    it("says when a tag was last revalidated, 0 when never", async () => {
        const storage = fakeStorage();
        expect(await newestOf(storage, ["site:a"])).toBe(0);
        await revalidate(storage, ["site:a"], 100);
        await revalidate(storage, ["site:a:products"], 300);
        expect(await newestOf(storage, ["site:a"])).toBe(100);
        expect(
            await newestOf(storage, ["site:a", "site:a:products", "x"]),
        ).toBe(300);
    });

    it("takes more tags than one storage call holds", async () => {
        const storage = fakeStorage();
        const tags = Array.from(
            { length: 300 },
            (_, i) => `site:a:product:p${i}`,
        );
        await revalidate(storage, tags, 7);
        expect(await newestOf(storage, tags)).toBe(7);
    });

    it("keeps each site's tags in that site's object", async () => {
        const namespace = fakeNamespace();
        await tellRevalidated(namespace, "a", ["site:a"]);
        expect(await askNewest(namespace, "a", ["site:a"])).toBeGreaterThan(0);
        expect(await askNewest(namespace, "b", ["site:a"])).toBe(0);
        expect(Array.from(namespace.objects.keys())).toEqual(["a", "b"]);
    });

    it("refuses a body that isn't a list of tags", async () => {
        const object = new SitePageTags({ storage: fakeStorage() });
        const res = await object.fetch(
            new Request("https://page-tags/newest", {
                method: "POST",
                body: JSON.stringify({ tags: [1] }),
            }),
        );
        expect(res.status).toBe(400);
    });
});
