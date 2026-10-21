import {
    IMAGE_WIDTHS,
    parseResizedPath,
    snapWidth,
} from "@saroh/site-blocks/image-sizes";
import { describe, expect, it, vi } from "vitest";

import type {
    ImageCacheStore,
    ImagesBindingLike,
    SiteImagesDeps,
    SiteImagesEnv,
} from "./resize";
import {
    formatFor,
    handleSiteImage,
    IMAGE_STATUS_HEADER,
    readHostOwner,
    withSiteImages,
} from "./resize";

/** The image route (#1043): never an open proxy, never a lost photo. */

const MEDIA = "https://media.saroh.test";
const ORG = "orgnorthwind1";
const KEY = `org/${ORG}/site-image/1b2c-hero.jpg`;
const HOST = "northwind.saroh.app";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function memoryCache(): ImageCacheStore & { entries: Map<string, Response> } {
    const entries = new Map<string, Response>();
    return {
        entries,
        match: (key) => Promise.resolve(entries.get(key)?.clone()),
        put: async (key, response) => {
            entries.set(
                key,
                new Response(await response.arrayBuffer(), response),
            );
        },
    };
}

/** A resizer that writes what it was asked into the bytes it returns. */
function fakeImages(fail: boolean | string = false): ImagesBindingLike & {
    calls: { width: number; format: string }[];
} {
    const calls: { width: number; format: string }[] = [];
    return {
        calls,
        input: (stream) => ({
            transform: ({ width }) => ({
                output: async ({ format }) => {
                    await new Response(stream).arrayBuffer();
                    calls.push({ width, format });
                    if (fail === true || fail === format) {
                        throw new Error("transform failed");
                    }
                    const body = new TextEncoder().encode(`${format}@${width}`);
                    return {
                        image: () => new Blob([body]).stream(),
                        contentType: () => format,
                    };
                },
            }),
        }),
    };
}

interface Setup {
    images?: ImagesBindingLike | undefined;
    owner?: { status: number; body?: unknown };
    source?: { status?: number; type?: string; body?: BodyInit };
    env?: Partial<SiteImagesEnv>;
}

function setup(options: Setup = {}) {
    const cache = memoryCache();
    const images = "images" in options ? options.images : fakeImages();
    const fetched: string[] = [];
    const fetch = vi.fn((input: string) => {
        fetched.push(input);
        if (input.includes("/public/sites/")) {
            const owner = options.owner ?? {
                status: 200,
                body: { organizationId: ORG, snapshot: {} },
            };
            return Promise.resolve(
                new Response(JSON.stringify(owner.body ?? {}), {
                    status: owner.status,
                }),
            );
        }
        const source = options.source ?? {};
        return Promise.resolve(
            new Response(source.body ?? JPEG, {
                status: source.status ?? 200,
                headers: { "content-type": source.type ?? "image/jpeg" },
            }),
        );
    });
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
    const env: SiteImagesEnv = {
        IMAGES: images,
        NEXT_PUBLIC_SITE_MEDIA_URL: MEDIA,
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
        API_URL: "https://api.saroh.test",
        ...options.env,
    };
    const log = vi.fn();
    const deps: SiteImagesDeps = {
        openCache: () => Promise.resolve(cache),
        fetch,
        log,
    };
    const ask = async (
        path: string,
        init: { host?: string; accept?: string; method?: string } = {},
    ) => {
        const res = await handleSiteImage(
            new Request(`https://${init.host ?? HOST}${path}`, {
                method: init.method ?? "GET",
                headers: {
                    accept: init.accept ?? "image/avif,image/webp,*/*",
                },
            }),
            env,
            ctx,
            deps,
        );
        await Promise.all(waits);
        return res;
    };
    return { ask, cache, images, fetched, fetch, log };
}

describe("the width ladder", () => {
    it("serves a width in the ladder at that width", async () => {
        for (const width of IMAGE_WIDTHS) {
            expect(snapWidth(width)).toBe(width);
        }
        const { ask, images } = setup();
        const res = await ask(`/_img/780/${KEY}`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("image/avif@780");
        expect((images as ReturnType<typeof fakeImages>).calls).toEqual([
            { width: 780, format: "image/avif" },
        ]);
    });

    it("snaps a width between steps up to the next one: 1000 is 1200", async () => {
        expect(snapWidth(1000)).toBe(1200);
        const { ask } = setup();
        expect(await (await ask(`/_img/1000/${KEY}`)).text()).toBe(
            "image/avif@1200",
        );
    });

    it("serves a width over the largest at the largest", async () => {
        expect(snapWidth(5000)).toBe(1920);
        const { ask } = setup();
        expect(await (await ask(`/_img/5000/${KEY}`)).text()).toBe(
            "image/avif@1920",
        );
    });

    it("refuses a width that isn't a number", async () => {
        const { ask } = setup();
        for (const width of ["0", "-1", "abc", "780.5", "1e3", "999999"]) {
            expect((await ask(`/_img/${width}/${KEY}`)).status).toBe(404);
        }
    });
});

describe("what the route will fetch", () => {
    it("refuses anything that isn't one of the business's photos, with nothing fetched", async () => {
        const { ask, fetch } = setup();
        const refused = [
            // A data export sits in the same bucket.
            `/_img/780/org/${ORG}/data-export/2b3c-export.zip`,
            `/_img/780/org/${ORG}/data-export/2b3c-export.jpg`,
            // A video, a book's file, a key with no purpose.
            `/_img/780/org/${ORG}/product-video/2b3c-clip.mp4`,
            `/_img/780/org/${ORG}/book/2b3c-page.jpg`,
            `/_img/780/org/${ORG}/2b3c-hero.jpg`,
            // Out of the bucket's tenant tree, or climbing out of it.
            `/_img/780/../org/${ORG}/site-image/a.jpg`,
            `/_img/780/org/${ORG}/site-image/../../other/a.jpg`,
            `/_img/780/org/${ORG}/site-image/..%2f..%2fa.jpg`,
            `/_img/780/org/${ORG}/site-image/a..jpg`,
            // Another host altogether.
            "/_img/780/https://evil.example/a.jpg",
            "/_img/780//evil.example/a.jpg",
            // An SVG can carry script.
            `/_img/780/org/${ORG}/business-logo/2b3c-logo.svg`,
            // A search is never part of a photo's address.
            `/_img/780/${KEY}?u=https://evil.example/a.jpg`,
        ];
        for (const path of refused) {
            const res = await ask(path);
            expect({ path, status: res.status }).toEqual({ path, status: 404 });
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it("refuses another organization's photo on this site's host", async () => {
        const { ask, fetched } = setup();
        const res = await ask("/_img/780/org/someoneelse/site-image/a.jpg");
        expect(res.status).toBe(404);
        // It asked whose site this is, and fetched no photo.
        expect(fetched.every((u) => u.includes("/public/sites/"))).toBe(true);
    });

    it("fetches only through the public media address, over https", async () => {
        const { ask, fetched } = setup();
        await ask(`/_img/480/${KEY}`);
        expect(fetched).toEqual([
            "https://api.saroh.test/public/sites/by-subdomain/northwind",
            `${MEDIA}/${KEY}`,
        ]);
        const none = setup({
            env: { NEXT_PUBLIC_SITE_MEDIA_URL: "http://media.saroh.test" },
        });
        expect((await none.ask(`/_img/480/${KEY}`)).status).toBe(404);
        expect(none.fetch).not.toHaveBeenCalled();
    });

    it("refuses a source that isn't an image, and a source that is missing", async () => {
        const html = setup({ source: { type: "text/html", body: "<script>" } });
        expect((await html.ask(`/_img/480/${KEY}`)).status).toBe(404);
        const svg = setup({
            source: { type: "image/svg+xml", body: "<svg/>" },
        });
        expect((await svg.ask(`/_img/480/${KEY}`)).status).toBe(404);
        const gone = setup({ source: { status: 404, body: "no" } });
        expect((await gone.ask(`/_img/480/${KEY}`)).status).toBe(404);
    });

    it("reads a custom domain's owner by its hostname", async () => {
        const { fetch } = setup();
        await readHostOwner(
            "www.northwindsupply.example",
            {
                NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
                API_URL: "https://api.saroh.test",
            },
            { fetch },
        );
        expect(fetch).toHaveBeenCalledWith(
            "https://api.saroh.test/public/sites/by-hostname/www.northwindsupply.example",
            expect.anything(),
        );
    });
});

describe("the format", () => {
    it("is AVIF when the browser takes it, else WebP, else the photo's own", async () => {
        expect(formatFor("image/avif,image/webp,*/*")).toBe("image/avif");
        expect(formatFor("image/webp,*/*")).toBe("image/webp");
        expect(formatFor("*/*")).toBeNull();
        expect(formatFor(null)).toBeNull();

        const { ask } = setup();
        const webp = await ask(`/_img/480/${KEY}`, {
            accept: "image/webp,*/*",
        });
        expect(webp.headers.get("content-type")).toBe("image/webp");
        expect(await webp.text()).toBe("image/webp@480");
        const own = await ask(`/_img/480/${KEY}`, { accept: "*/*" });
        expect(own.headers.get("content-type")).toBe("image/jpeg");
    });

    it("says it varies by Accept, keeps a year, and can't run as a page", async () => {
        const { ask } = setup();
        const res = await ask(`/_img/480/${KEY}`);
        expect(res.headers.get("vary")).toBe("Accept");
        expect(res.headers.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
        );
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("content-security-policy")).toContain("sandbox");
    });
});

describe("the cache", () => {
    it("serves a second request for the same key, width and format from the cache", async () => {
        const { ask, images, fetched } = setup();
        const first = await ask(`/_img/780/${KEY}`);
        expect(first.headers.get(IMAGE_STATUS_HEADER)).toBe("miss");
        const before = fetched.length;
        const second = await ask(`/_img/780/${KEY}`);
        expect(second.headers.get(IMAGE_STATUS_HEADER)).toBe("hit");
        expect(await second.text()).toBe("image/avif@780");
        expect(second.headers.get("vary")).toBe("Accept");
        // Neither the owner nor the photo was fetched again, nor resized.
        expect(fetched.length).toBe(before);
        expect((images as ReturnType<typeof fakeImages>).calls).toHaveLength(1);
    });

    it("keeps each format apart", async () => {
        const { ask, images } = setup();
        await ask(`/_img/780/${KEY}`, { accept: "image/avif" });
        const webp = await ask(`/_img/780/${KEY}`, { accept: "image/webp" });
        expect(await webp.text()).toBe("image/webp@780");
        expect((images as ReturnType<typeof fakeImages>).calls).toHaveLength(2);
    });
});

describe("when something fails, a photo is never lost", () => {
    it("serves the original with a short cache when the resize throws", async () => {
        const { ask, cache, log } = setup({ images: fakeImages(true) });
        const res = await ask(`/_img/780/${KEY}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/jpeg");
        expect(res.headers.get("cache-control")).toBe("public, max-age=300");
        expect(res.headers.get(IMAGE_STATUS_HEADER)).toBe("original");
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
        // Nothing failed is kept as the resized version.
        expect(
            Array.from(cache.entries.keys()).filter((k) => k.includes("?f=")),
        ).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            "site_image_resize_failed",
            expect.objectContaining({ width: 780 }),
        );
    });

    it("falls back to WebP when AVIF refuses the photo", async () => {
        const images = fakeImages("image/avif");
        const { ask } = setup({ images });
        const res = await ask(`/_img/1920/${KEY}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/webp");
        expect(await res.text()).toBe("image/webp@1920");
        expect(images.calls.map((c) => c.format)).toEqual([
            "image/avif",
            "image/webp",
        ]);
    });

    it("serves an image it doesn't resize (a GIF) as it is", async () => {
        const { ask } = setup({
            source: { type: "image/gif", body: "GIF89a" },
        });
        const res = await ask(`/_img/780/${KEY}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/gif");
        expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    });

    it("sends the browser to the original without the binding", async () => {
        const { ask } = setup({ images: undefined });
        const res = await ask(`/_img/780/${KEY}`);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`${MEDIA}/${KEY}`);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("sends the browser to the original when whose site this is can't be read", async () => {
        const { ask } = setup({ owner: { status: 503 } });
        const res = await ask(`/_img/780/${KEY}`);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`${MEDIA}/${KEY}`);
    });
});

describe("hosts that aren't a live site", () => {
    it("send the owner's preview and a test release to the original, resizing nothing", async () => {
        for (const host of ["saroh.app", "test--northwind.saroh.app"]) {
            const { ask, fetch, images } = setup();
            const res = await ask(`/_img/780/${KEY}`, { host });
            expect(res.status).toBe(302);
            expect(res.headers.get("location")).toBe(`${MEDIA}/${KEY}`);
            expect(fetch).not.toHaveBeenCalled();
            expect(
                (images as ReturnType<typeof fakeImages>).calls,
            ).toHaveLength(0);
        }
    });

    it("never redirect to anything but an image key in the public media", async () => {
        const { ask } = setup();
        const res = await ask(`/_img/780/org/${ORG}/data-export/a.zip`, {
            host: "saroh.app",
        });
        expect(res.status).toBe(404);
    });
});

describe("the Worker's entry", () => {
    it("answers only /_img/…, and hands everything else on", async () => {
        const next = vi.fn(() => Promise.resolve(new Response("page")));
        const { fetch } = setup();
        const handler = withSiteImages(next, {
            openCache: () => Promise.resolve(memoryCache()),
            fetch,
            log: vi.fn(),
        });
        const ctx = { waitUntil: () => undefined };
        const env: SiteImagesEnv = { NEXT_PUBLIC_SITE_MEDIA_URL: MEDIA };
        await handler(new Request(`https://${HOST}/about`), env, ctx);
        await handler(new Request(`https://${HOST}/_images`), env, ctx);
        expect(next).toHaveBeenCalledTimes(2);
        const res = await handler(
            new Request(`https://${HOST}/_img/780/nope`),
            env,
            ctx,
        );
        expect(res.status).toBe(404);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it("refuses anything but GET and HEAD", async () => {
        const { ask } = setup();
        expect((await ask(`/_img/780/${KEY}`, { method: "POST" })).status).toBe(
            405,
        );
    });
});

describe("parseResizedPath", () => {
    it("reads the width and the key", () => {
        expect(parseResizedPath(`/_img/780/${KEY}`)).toEqual({
            width: 780,
            image: { key: KEY, organizationId: ORG, purpose: "site-image" },
        });
        expect(parseResizedPath("/_img/780")).toBeNull();
        expect(parseResizedPath(`/img/780/${KEY}`)).toBeNull();
    });
});
