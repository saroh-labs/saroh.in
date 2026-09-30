/**
 * `GET public/sites/test-release` (DEC-071, T3): the host comes from the
 * query, the token from its header (never the path), nothing is cached, and
 * a caller who asks too often is slowed down with a 429.
 */
const resolveTestRelease = jest.fn();
jest.mock("./test-release-lookup", () => ({
    ...jest.requireActual<object>("./test-release-lookup"),
    resolveTestRelease: (...a: unknown[]) => resolveTestRelease(...a),
}));

import { HttpException, HttpStatus } from "@nestjs/common";

import { PublicSitesController } from "./public-sites.controller";
import type { PublicVisitService } from "./public-visit.service";
import type { SitePreviewLinksService } from "./site-preview-links.service";
import type { SitesService } from "./sites.service";
import { TEST_TOKEN_HEADER } from "./test-release-lookup";

function controller() {
    return new PublicSitesController(
        {} as SitesService,
        {} as SitePreviewLinksService,
        {} as PublicVisitService,
    );
}

describe("GET public/sites/test-release", () => {
    beforeEach(() => resolveTestRelease.mockReset().mockResolvedValue({}));

    it("passes the host and the header token to the lookup", async () => {
        await controller().testRelease(
            "test--acme.saroh.app",
            "tok",
            "203.0.113.7",
            undefined,
        );
        expect(resolveTestRelease).toHaveBeenCalledWith(
            "test--acme.saroh.app",
            "tok",
        );
    });

    it("reads the token from x-saroh-test-token and is never cached", () => {
        expect(TEST_TOKEN_HEADER).toBe("x-saroh-test-token");
        const headers = Reflect.getMetadata(
            "__headers__",
            PublicSitesController.prototype.testRelease,
        ) as { name: string; value: string }[];
        expect(headers).toContainEqual({
            name: "Cache-Control",
            value: "no-store",
        });
    });

    it("answers 429 once one caller has asked too often", async () => {
        const c = controller();
        let allowed = 0;
        for (let i = 0; i < 300; i++) {
            await c
                .testRelease(
                    "test--acme.saroh.app",
                    "t",
                    "203.0.113.8",
                    undefined,
                )
                .then(() => allowed++);
        }
        expect(allowed).toBe(300);
        const err: unknown = await c
            .testRelease("test--acme.saroh.app", "t", "203.0.113.8", undefined)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
            HttpStatus.TOO_MANY_REQUESTS,
        );
        // Another caller is unaffected.
        await expect(
            c.testRelease(
                "test--acme.saroh.app",
                "t",
                "203.0.113.9",
                undefined,
            ),
        ).resolves.toEqual({});
    });
});
