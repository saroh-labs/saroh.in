import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/sites/rich-text/writing-menus", () => ({
    ADD_ITEMS: [
        {
            key: "heading",
            label: "Heading",
            group: "Write",
            icon: () => null,
            run: vi.fn(),
        },
        {
            key: "offer",
            label: "Offer",
            group: "From your business",
            icon: () => null,
        },
    ],
}));

import { postFindMatches, postFindRows } from "./post-find";
import type { PostEditorModel } from "./post-model";

const model = (over: Partial<PostEditorModel["data"]> = {}) =>
    ({
        data: {
            readOnly: false,
            paused: false,
            postsPrefix: "blog",
            posts: [
                { id: "p1", title: "This one", slug: "this" },
                { id: "p2", title: "Monsoon hair care", slug: "monsoon" },
            ],
            ...over,
        },
        draft: { postId: "p1" },
    }) as unknown as PostEditorModel;

const go = {
    details: vi.fn(),
    search: vi.fn(),
    feedback: null,
    history: vi.fn(),
    add: vi.fn(),
    publish: vi.fn(),
};

describe("the post's Find (W6)", () => {
    it("finds this post's panels, what Add puts in, and the other posts", () => {
        const open = vi.fn();
        const rows = postFindRows(model(), {} as never, go, open);
        expect(rows.map((r) => r.label)).toEqual([
            "Details",
            "Search and sharing",
            "History",
            "Publish post",
            "Heading",
            "Offer",
            "Monsoon hair care",
        ]);
        rows.find((r) => r.label === "Offer")?.run();
        expect(go.add).toHaveBeenCalled();
        rows.at(-1)?.run();
        expect(open).toHaveBeenCalledWith("p2");
        expect(
            rows
                .filter((r) => postFindMatches(r, "google link"))
                .map((r) => r.key),
        ).toEqual(["search"]);
    });

    it("a reader finds nothing that writes", () => {
        const rows = postFindRows(
            model({ readOnly: true }),
            {} as never,
            go,
            vi.fn(),
        );
        expect(rows.some((r) => r.key === "publish" || r.group === "add")).toBe(
            false,
        );
    });
});
