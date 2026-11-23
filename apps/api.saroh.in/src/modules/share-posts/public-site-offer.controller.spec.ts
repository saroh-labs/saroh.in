// A post's Offer card reads with the site's public reads (round 3), not
// behind SHARE_POSTS: the route carries only the site's online guard.
import "reflect-metadata";

import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import type { PublicShareService } from "./public-share.service";
import { PublicSiteOfferController } from "./public-site-offer.controller";
import { SharePostsSwitchGuard } from "./share-posts-switch";

describe("PublicSiteOfferController", () => {
    it("lives under public/sites with only the site-online guard", () => {
        expect(
            Reflect.getMetadata(PATH_METADATA, PublicSiteOfferController),
        ).toBe("public/sites");
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            PublicSiteOfferController,
        ) as unknown[];
        expect(guards).toEqual([PublicSiteOnlineGuard]);
        expect(guards).not.toContain(SharePostsSwitchGuard);
    });

    it("answers the offer's words for that site, the visitor hashed", async () => {
        const words = {
            name: "Box",
            headline: "10% off",
            until: null,
            code: "X",
        };
        const share = { offerWords: jest.fn(() => Promise.resolve(words)) };
        const controller = new PublicSiteOfferController(
            share as unknown as PublicShareService,
        );
        await expect(
            controller.offer("site_1", "disc_1", "203.0.113.9"),
        ).resolves.toBe(words);
        const [siteId, id, visitor] = share.offerWords.mock
            .calls[0] as unknown as [string, string, string];
        expect([siteId, id]).toEqual(["site_1", "disc_1"]);
        expect(visitor).not.toContain("203.0.113.9");
    });
});
