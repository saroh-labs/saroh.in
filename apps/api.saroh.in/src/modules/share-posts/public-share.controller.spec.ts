// The share pictures' answers (#1375): a PNG anyone may fetch and keep
// five minutes; a miss is the filter's 404, which nothing keeps.
import "reflect-metadata";

import { NotFoundException, StreamableFile } from "@nestjs/common";
import type { Response } from "express";

import {
    PublicShareController,
    SHARE_IMAGE_CACHE,
} from "./public-share.controller";
import type { PublicShareService } from "./public-share.service";

function setup() {
    const share = {
        item: jest.fn(() => Promise.resolve(Buffer.from("png"))),
        own: jest.fn(() => Promise.resolve(Buffer.from("png"))),
    };
    const headers: Record<string, string> = {};
    const res = {
        setHeader: (name: string, value: string) => (headers[name] = value),
    } as unknown as Response;
    return {
        controller: new PublicShareController(
            share as unknown as PublicShareService,
        ),
        share,
        headers,
        res,
    };
}

describe("PublicShareController", () => {
    it("answers a PNG anyone may fetch, kept five minutes", async () => {
        const { controller, headers, res, share } = setup();
        const file = await controller.item(
            "site_1",
            "product",
            "bun",
            { style: "price" },
            "203.0.113.9",
            res,
        );
        expect(file).toBeInstanceOf(StreamableFile);
        expect(file.getHeaders()).toMatchObject({
            type: "image/png",
            length: 3,
        });
        expect(headers).toEqual({
            "Cache-Control": SHARE_IMAGE_CACHE,
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "X-Content-Type-Options": "nosniff",
        });
        expect(SHARE_IMAGE_CACHE).toBe("public, max-age=300");
        // The visitor is counted by a keyed hash, never the address itself.
        const visitor = (share.item.mock.calls[0] as unknown[])[4] as string;
        expect(visitor).toMatch(/^share:[0-9a-f]{64}$/);
    });

    it("answers an own post the same way", async () => {
        const { controller, headers, res } = setup();
        await controller.own("sp_1", {}, "203.0.113.9", res);
        expect(headers["Cache-Control"]).toBe("public, max-age=300");
    });

    it("lets a miss through as a 404, with nothing set to keep it", async () => {
        const { controller, headers, res, share } = setup();
        share.item.mockRejectedValueOnce(new NotFoundException());
        await expect(
            controller.item(
                "site_1",
                "product",
                "draft",
                {},
                "203.0.113.9",
                res,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(headers).toEqual({});
    });
});
