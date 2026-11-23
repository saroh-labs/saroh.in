/**
 * The older-photos backfill (DEC-246) against a real Postgres, with the
 * in-memory storage: a dry run counts and writes nothing; the run fills
 * size, blur and copies beside the original (`variantKey`), keeps GIFs and
 * logos as they are, skips SVG and video, lists a photo with no bytes as
 * failed, keeps `sizeBytes` and counts the copies in `variantBytes`; a second run does nothing new.
 */
import { variantKey } from "@saroh/block-contract";
import { Prisma, prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";
import sharp from "sharp";

import { mediaStorages } from "../modules/media/object-storage.provider";
import { backfillMediaVariants } from "./media-variants";

const storage = createMemoryStorage();
let orgId: string;
const ids: Record<string, string> = {};

const picture = (format: "jpeg" | "png" | "gif", width: number) =>
    sharp({
        create: {
            width,
            height: Math.round(width / 2),
            channels: 3,
            background: { r: 30, g: 90, b: 160 },
        },
    })
        .toFormat(format)
        .toBuffer();

async function seed(
    name: string,
    contentType: string,
    bytes: Buffer | null,
    purpose = "product-image",
) {
    const ext = contentType.split("/")[1]!.replace("+xml", "");
    const key = `org/${orgId}/${purpose}/${name}.${ext}`;
    if (bytes) {
        // The memory store takes bytes only for a key it minted an upload for.
        await storage.createSignedUploadUrl({
            organizationId: orgId,
            contentType,
            contentLength: bytes.length,
            filename: `${name}.${ext}`,
            purpose,
            key,
        });
        storage.putBytes(key, bytes);
    }
    const row = await prisma.media.create({
        data: {
            organizationId: orgId,
            key,
            contentType,
            sizeBytes: 1234,
            filename: `${name}.${ext}`,
            purpose,
            status: "READY",
        },
    });
    ids[name] = row.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `variants-${process.pid}` },
    });
    orgId = org.id;
    await seed("photo", "image/jpeg", await picture("jpeg", 1600));
    await seed("small", "image/png", await picture("png", 300));
    await seed(
        "logo",
        "image/png",
        await picture("png", 1600),
        "business-logo",
    );
    await seed("anim", "image/gif", await picture("gif", 1600));
    await seed("icon", "image/svg+xml", Buffer.from("<svg/>"));
    await seed("clip", "video/mp4", Buffer.from("not read"));
    await seed("lost", "image/jpeg", null);
});

const row = (name: string) =>
    prisma.media.findUniqueOrThrow({ where: { id: ids[name] } });

describe("media variants backfill (real database)", () => {
    it("dry run counts the raster photos and writes nothing", async () => {
        const report = await backfillMediaVariants(
            prisma,
            mediaStorages(storage, null),
            {
                dryRun: true,
            },
        );
        expect(report).toMatchObject({ candidates: 5, done: 0, copies: 0 });
        expect((await row("photo")).variants).toBeNull();
        const copy = variantKey((await row("photo")).key, 480)!;
        expect(await storage.headObject(copy)).toBeNull();
    });

    it("fills size, blur and copies; keeps GIFs and logos as they are", async () => {
        const log: string[] = [];
        const report = await backfillMediaVariants(
            prisma,
            mediaStorages(storage, null),
            {
                dryRun: false,
                log: (l) => log.push(l),
            },
        );
        expect(report).toMatchObject({ candidates: 5, done: 4, copies: 2 });
        expect(report.failed).toEqual([ids.lost]);
        expect(log.join("\n")).toContain(`failed ${ids.lost}`);

        const photo = await row("photo");
        const keys = [480, 1200].map((w) => variantKey(photo.key, w)!);
        expect(keys[0]).toBe(`${photo.key}@480.webp`);
        expect(photo).toMatchObject({ width: 1600, height: 800 });
        expect(photo.placeholder).toBeTruthy();
        const variants = photo.variants as {
            width: number;
            key: string;
            bytes: number;
        }[];
        expect(variants.map((v) => [v.width, v.key])).toEqual([
            [480, keys[0]],
            [1200, keys[1]],
        ]);
        for (const v of variants) {
            const head = await storage.headObject(v.key);
            expect(head).toMatchObject({
                contentType: "image/webp",
                contentLength: v.bytes,
            });
        }
        // The original stays where published pages point at it.
        expect(await storage.headObject(photo.key)).not.toBeNull();

        for (const name of ["small", "logo", "anim"]) {
            const r = await row(name);
            expect(r.variants).toEqual([]);
            expect(r.width).toBeGreaterThan(0);
            expect(r.placeholder).toBeTruthy();
        }
        for (const name of ["icon", "clip", "lost"]) {
            expect((await row(name)).variants).toBeNull();
        }
        // The original's size stays; the copies are counted beside it.
        expect(photo.variantBytes).toBe(
            variants.reduce((n, v) => n + v.bytes, 0),
        );
        expect((await row("logo")).variantBytes).toBe(0);
        const sizes = await prisma.media.findMany({
            where: { organizationId: orgId },
            select: { sizeBytes: true },
        });
        expect(sizes.every((s) => s.sizeBytes === 1234)).toBe(true);
    });

    it("a second run finds only the failed photo and writes nothing new", async () => {
        const before = await row("photo");
        const dry = await backfillMediaVariants(
            prisma,
            mediaStorages(storage, null),
            {
                dryRun: true,
            },
        );
        expect(dry.candidates).toBe(1);
        const again = await backfillMediaVariants(
            prisma,
            mediaStorages(storage, null),
            {
                dryRun: false,
            },
        );
        expect(again).toMatchObject({ done: 0, copies: 0 });
        expect((await row("photo")).updatedAt).toEqual(before.updatedAt);
    });

    it("--limit stops after that many rows", async () => {
        await prisma.media.update({
            where: { id: ids.photo },
            data: { variants: Prisma.DbNull },
        });
        const report = await backfillMediaVariants(
            prisma,
            mediaStorages(storage, null),
            {
                dryRun: false,
                limit: 1,
            },
        );
        expect(report.done + report.failed.length).toBe(1);
    });
});
