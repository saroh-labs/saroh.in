import { request } from "node:http";
import type { AddressInfo } from "node:net";

import express, { json } from "express";

import { META_WEBHOOK_PATH, metaWebhookBody } from "./meta-webhook-body";

// 03-L7: a Meta batch past 100 kB was refused (413) before the signature check.
describe("metaWebhookBody", () => {
    async function post(path: string, size: number): Promise<number> {
        const app = express();
        app.use(META_WEBHOOK_PATH, metaWebhookBody());
        // The API's own parser, default limit, after it.
        app.use(json());
        app.post("*splat", (req, res) => {
            const raw = (req as { rawBody?: Buffer }).rawBody;
            res.status(raw && raw.length >= size ? 200 : 500).end();
        });
        const server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        const { port } = server.address() as AddressInfo;
        const body = JSON.stringify({ entry: "x".repeat(size) });
        try {
            return await new Promise<number>((resolve, reject) => {
                request(
                    {
                        host: "127.0.0.1",
                        port,
                        path,
                        method: "POST",
                        headers: { "content-type": "application/json" },
                    },
                    (res) => {
                        res.resume();
                        resolve(res.statusCode ?? 0);
                    },
                )
                    .on("error", reject)
                    .end(body);
            });
        } finally {
            server.close();
        }
    }

    it("takes a 1 MB batch on the Meta webhook, raw bytes kept", async () => {
        expect(await post(META_WEBHOOK_PATH, 1_000_000)).toBe(200);
    });

    it("leaves every other route at the default limit", async () => {
        expect(await post("/public/other", 200_000)).toBe(413);
    });
});
