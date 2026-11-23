// The photo's smaller copies, made in the browser (DEC-246): signed at keys
// the server makes, counted against the plan's storage, and checked whole
// on confirm. DB-free: the database is mocked, storage is the real
// in-memory adapter (told it sees uploads, as R2 does).
jest.mock("@saroh/database", () => ({
    prisma: {
        media: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import { placeholderFromRgba } from "@saroh/block-contract";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import { createMemoryStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { MediaService } from "./media.service";
import { mediaStorages } from "./object-storage.provider";
import type { CreateUploadInput } from "./upload-checks";
import {
    BAD_SIZES_MESSAGE,
    NOT_AN_IMAGE_MESSAGE,
    NOTHING_UPLOADED_MESSAGE,
    storedEndProblem,
    uploadSizesProblem,
} from "./upload-checks";
import { mediaFileKeys } from "./variants";

const create = prisma.media.create as jest.Mock;
const findUnique = prisma.media.findUnique as jest.Mock;
const update = prisma.media.update as jest.Mock;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "ADMIN",
} as OrganizationContext;

const PLACEHOLDER = placeholderFromRgba(
    4,
    3,
    new Uint8Array(4 * 3 * 4).fill(200),
);

/** A whole WebP of `size` bytes: RIFF, its length, WEBP. */
function webp(size: number): Uint8Array {
    const out = new Uint8Array(size);
    out.set([0x52, 0x49, 0x46, 0x46], 0);
    new DataView(out.buffer).setUint32(4, size - 8, true);
    out.set([0x57, 0x45, 0x42, 0x50], 8);
    return out;
}

function photo(over: Partial<CreateUploadInput> = {}): CreateUploadInput {
    return {
        contentType: "image/webp",
        contentLength: 300_000,
        filename: "shop.webp",
        purpose: "site-image",
        width: 2560,
        height: 1920,
        placeholder: PLACEHOLDER,
        variants: [
            { width: 480, contentLength: 20_000 },
            { width: 1200, contentLength: 90_000 },
            { width: 1920, contentLength: 180_000 },
        ],
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(planMeter, "withRoom").mockImplementation(
        async (_org, _key, run) => run(prisma as never) as never,
    );
});

describe("uploadSizesProblem", () => {
    it("takes a browser-made photo and an API upload with no sizes", () => {
        expect(uploadSizesProblem(photo())).toBeNull();
        expect(
            uploadSizesProblem({
                contentType: "image/jpeg",
                contentLength: 5_000_000,
                filename: "a.jpg",
            }),
        ).toBeNull();
        // A GIF: its size and blur, no copies.
        expect(
            uploadSizesProblem(
                photo({ contentType: "image/gif", variants: undefined }),
            ),
        ).toBeNull();
    });

    it.each([
        ["a missing copy", photo({ variants: photo().variants!.slice(0, 2) })],
        [
            "copies out of order",
            photo({ variants: [...photo().variants!].reverse() }),
        ],
        [
            "a copy as wide as the photo",
            photo({
                width: 1200,
                height: 900,
                variants: [
                    { width: 480, contentLength: 1 },
                    { width: 1200, contentLength: 2 },
                ],
            }),
        ],
        [
            "a copy no smaller than the photo",
            photo({
                variants: [
                    { width: 480, contentLength: 20_000 },
                    { width: 1200, contentLength: 300_000 },
                    { width: 1920, contentLength: 1 },
                ],
            }),
        ],
        ["copies of a PNG", photo({ contentType: "image/png" })],
        ["a full copy over the edge", photo({ width: 4000 })],
        [
            "a full copy over 4 MB",
            photo({ contentLength: 4 * 1024 * 1024 + 1 }),
        ],
        ["a width without a height", photo({ height: undefined })],
        ["a placeholder that isn't one", photo({ placeholder: "<svg>" })],
    ])("refuses %s", (_what, input) => {
        expect(uploadSizesProblem(input)).toBe(BAD_SIZES_MESSAGE);
    });
});

describe("mediaFileKeys", () => {
    it("reads the photo and each copy's key, and skips anything malformed", () => {
        expect(mediaFileKeys({ key: "a.webp", variants: null })).toEqual([
            "a.webp",
        ]);
        expect(
            mediaFileKeys({
                key: "a.webp",
                variants: [
                    { width: 480, key: "a@480.webp", bytes: 1 },
                    { width: 640 },
                    null,
                    { key: 5 },
                ],
            }),
        ).toEqual(["a.webp", "a@480.webp"]);
    });
});

describe("storedEndProblem", () => {
    const media = { contentType: "image/webp", purpose: "site-image" };
    const file = webp(64);

    it("passes a whole file and refuses one with bytes appended", () => {
        const end = file.subarray(52);
        expect(storedEndProblem(media, file, end, 64, true)).toBeNull();
        expect(storedEndProblem(media, file, end, 64 + 5, true)).toBe(
            NOT_AN_IMAGE_MESSAGE,
        );
    });

    it("refuses an unreadable end only where storage sees uploads", () => {
        expect(storedEndProblem(media, file, null, 64, true)).toBe(
            NOTHING_UPLOADED_MESSAGE,
        );
        expect(storedEndProblem(media, file, null, 64, false)).toBeNull();
    });
});

describe("MediaService with copies", () => {
    function setup() {
        const memory = createMemoryStorage({
            publicBaseUrl: "https://media.test",
            generateId: () => "uuid",
        });
        // R2 sees what the browser PUT; here putBytes stands in for it.
        const storage: ObjectStorage = { ...memory, seesUploads: true };
        return {
            memory,
            service: new MediaService(mediaStorages(storage, null)),
        };
    }

    it("signs each copy at a key it makes beside the photo, and meters every file", async () => {
        const { service } = setup();
        create.mockImplementation(({ data }) =>
            Promise.resolve({ id: "m1", ...data }),
        );
        const out = await service.createUpload(ctx, photo());
        const key = "org/org-1/site-image/uuid-shop.webp";
        expect(out.key).toBe(key);
        expect(out.variants.map((v) => v.key)).toEqual([
            "org/org-1/site-image/uuid-shop@480.webp",
            "org/org-1/site-image/uuid-shop@1200.webp",
            "org/org-1/site-image/uuid-shop@1920.webp",
        ]);
        expect(out.variants[0].headers["Content-Length"]).toBe("20000");
        const data = create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            width: 2560,
            height: 1920,
            placeholder: PLACEHOLDER,
            sizeBytes: 300_000,
            variantBytes: 290_000,
        });
        expect(planMeter.withRoom).toHaveBeenCalledWith(
            "org_1",
            "storage",
            expect.any(Function),
            { adding: 590_000 / 1_000_000_000 },
        );
    });

    async function upload(files: Record<number | "full", Uint8Array | null>) {
        const { memory, service } = setup();
        create.mockImplementation(({ data }) =>
            Promise.resolve({ id: "m1", ...data }),
        );
        const input = photo({
            contentLength: files.full?.length ?? 300,
            variants: [480, 1200, 1920].map((w) => ({
                width: w,
                // As said at upload-url: a copy smaller than the photo. The
                // in-memory adapter keeps whatever is put, unlike R2's
                // signed length, so a bigger one can still be stored.
                contentLength: Math.min(
                    files[w]?.length ?? 10,
                    (files.full?.length ?? 300) - 1,
                ),
            })),
        });
        const ticket = await service.createUpload(ctx, input);
        if (files.full) memory.putBytes(ticket.key, files.full);
        for (const v of ticket.variants) {
            const bytes = files[v.width];
            if (bytes) memory.putBytes(v.key, bytes);
        }
        const row = create.mock.calls[0][0].data;
        findUnique.mockResolvedValue({ id: "m1", status: "PENDING", ...row });
        update.mockImplementation(({ data }) =>
            Promise.resolve({ id: "m1", ...row, ...data }),
        );
        return { memory, service, ticket };
    }

    it("confirms a photo whose every file is whole", async () => {
        const { service } = await upload({
            full: webp(300),
            480: webp(40),
            1200: webp(100),
            1920: webp(200),
        });
        const done = await service.completeUpload(ctx, "m1");
        expect(done.status).toBe("READY");
    });

    it.each([
        [
            "a missing copy",
            { full: webp(300), 480: webp(40), 1200: null, 1920: webp(200) },
            NOTHING_UPLOADED_MESSAGE,
        ],
        [
            "a copy that isn't a WebP",
            {
                full: webp(300),
                480: new Uint8Array(40).fill(0x3c),
                1200: webp(100),
                1920: webp(200),
            },
            NOT_AN_IMAGE_MESSAGE,
        ],
        [
            "a copy with bytes appended",
            {
                full: webp(300),
                480: Uint8Array.from([...webp(40), 0x50, 0x4b, 3, 4]),
                1200: webp(100),
                1920: webp(200),
            },
            NOT_AN_IMAGE_MESSAGE,
        ],
        [
            "a copy bigger than the photo",
            {
                full: webp(300),
                480: webp(40),
                1200: webp(100),
                1920: webp(400),
            },
            BAD_SIZES_MESSAGE,
        ],
        [
            "a photo with bytes appended",
            {
                full: Uint8Array.from([...webp(300), 0x50, 0x4b]),
                480: webp(40),
                1200: webp(100),
                1920: webp(200),
            },
            NOT_AN_IMAGE_MESSAGE,
        ],
    ])(
        "refuses %s, fails the upload and deletes every file",
        async (_w, files, message) => {
            const { memory, service, ticket } = await upload(files);
            await expect(service.completeUpload(ctx, "m1")).rejects.toThrow(
                message,
            );
            expect(update).toHaveBeenCalledWith({
                where: { id: "m1" },
                data: { status: "FAILED" },
            });
            for (const key of [
                ticket.key,
                ...ticket.variants.map((v) => v.key),
            ]) {
                expect(memory.has(key)).toBe(false);
            }
        },
    );
});
