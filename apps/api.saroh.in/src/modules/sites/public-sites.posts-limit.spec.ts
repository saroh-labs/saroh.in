/**
 * The public post reads (02 W6, 21 Nov 2026): the list, one post and where
 * an old link moved share one per-visitor limit, so a crawler on random
 * slugs is slowed down with a 429 like the other public reads.
 */
const postMovedTo = jest.fn();
jest.mock("../content/post-old-slugs", () => ({
    postMovedTo: (...a: unknown[]) => postMovedTo(...a),
}));

import { HttpException, HttpStatus } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { PublicFooterService } from "./public-footer.service";
import type { PublicHeadService } from "./public-head.service";
import { PublicSitesController } from "./public-sites.controller";
import type { PublicVisitService } from "./public-visit.service";
import type { SitePreviewLinksService } from "./site-preview-links.service";
import type { SitesService } from "./sites.service";

const sites = {
    getPublicPosts: jest.fn().mockResolvedValue({ posts: [] }),
    getPublicPost: jest.fn().mockResolvedValue({}),
};

function controller() {
    const c = new PublicSitesController(
        sites as unknown as SitesService,
        {} as SitePreviewLinksService,
        {} as PublicVisitService,
        {} as PublicFooterService,
        {} as PublicHeadService,
        {} as never,
    );
    // Two reads a window, so the third is the one refused.
    Object.assign(c, {
        postReadLimiter: new FixedWindowRateLimiter(2, 60_000),
    });
    return c;
}

describe("public post reads are limited per visitor (02 W6)", () => {
    it("refuses a visitor's third read of the window with a 429, across the three routes", async () => {
        const c = controller();
        await c.posts("site_1", "203.0.113.7", undefined);
        await c.post("site_1", "random-1", "203.0.113.7", undefined);
        let err: unknown;
        try {
            c.postMoved("site_1", "random-1", "203.0.113.7", undefined);
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
            HttpStatus.TOO_MANY_REQUESTS,
        );
        expect(postMovedTo).not.toHaveBeenCalled();
        // Another visitor has their own window.
        await c.post("site_1", "bridal", "198.51.100.2", undefined);
        expect(sites.getPublicPost).toHaveBeenCalledTimes(2);
    });
});
