import { beforeEach, describe, expect, it, vi } from "vitest";

import PostCategoriesPage from "@/app/(shell)/sites/[siteId]/posts/categories/page";

import { CATEGORIES_PARAM, postCategoriesHref } from "./categories-href";

const redirect = vi.fn((to: string) => {
    // As Next's does: it never returns.
    throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({
    redirect: (to: string) => redirect(to),
}));

/**
 * Post categories are a sheet on the Posts tab, not a page: the old address
 * has to keep landing somebody's bookmark in the right place.
 */
describe("the post categories address", () => {
    beforeEach(() => {
        redirect.mockClear();
    });

    it("is the Posts tab, asked to open the sheet", () => {
        expect(CATEGORIES_PARAM).toBe("categories");
        expect(postCategoriesHref("site_1")).toBe(
            "/sites/site_1/posts?categories=1",
        );
    });

    it("redirects the old /posts/categories page there", async () => {
        await expect(
            PostCategoriesPage({
                params: Promise.resolve({ siteId: "site_1" }),
            }),
        ).rejects.toThrow("REDIRECT /sites/site_1/posts?categories=1");
        expect(redirect).toHaveBeenCalledTimes(1);
    });
});
