import { readdirSync } from "node:fs";
import { join } from "node:path";

import { listTemplates } from "@saroh/templates";

import {
    hasPicture,
    pictureData,
    pictureUrl,
    previewUrl,
} from "./template-previews";

const APP = "https://app.saroh.localhost";

const answer = (body: Buffer | string, type = "image/webp", status = 200) =>
    jest.fn(
        async () =>
            new Response(body, { status, headers: { "content-type": type } }),
    ) as unknown as typeof fetch;

describe("template previews for AI apps (DEC-216)", () => {
    it("opens the new-site picker on the template, on this business", () => {
        const url = new URL(previewUrl(APP, "org_1", "salon"));
        expect(url.origin + url.pathname).toBe(`${APP}/open/org_1`);
        expect(url.searchParams.get("to")).toBe("/sites/new?template=salon");
    });

    it("has a card picture for exactly the templates the app has one for", () => {
        const files = readdirSync(
            join(__dirname, "../../../../../app.saroh.in/public/templates"),
        )
            .filter((f) => f.endsWith(".webp"))
            .map((f) => f.replace(/\.webp$/, ""))
            .sort();
        const pictured = listTemplates()
            .map((t) => t.id)
            .filter(hasPicture)
            .sort();
        expect(pictured).toEqual(files);
        expect(pictureUrl(APP, "salon")).toBe(`${APP}/templates/salon.webp`);
    });

    it("reads a picture once, then from memory", async () => {
        const fetcher = answer(Buffer.from("webp-bytes"));
        const url = `${APP}/templates/cached.webp`;
        expect(await pictureData(url, fetcher)).toBe(
            Buffer.from("webp-bytes").toString("base64"),
        );
        expect(await pictureData(url, fetcher)).toBe(
            Buffer.from("webp-bytes").toString("base64"),
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("gives up quietly on a failure, a wrong type or a file too large, and tries again next time", async () => {
        const url = `${APP}/templates/missing.webp`;
        expect(
            await pictureData(url, answer("", "image/webp", 404)),
        ).toBeNull();
        expect(
            await pictureData(url, answer("<html>", "text/html")),
        ).toBeNull();
        expect(
            await pictureData(url, answer(Buffer.alloc(200_001))),
        ).toBeNull();
        const down = jest.fn(async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        expect(await pictureData(url, down)).toBeNull();
        expect(
            await pictureData(url, answer(Buffer.from("ok"))),
        ).not.toBeNull();
    });
});
