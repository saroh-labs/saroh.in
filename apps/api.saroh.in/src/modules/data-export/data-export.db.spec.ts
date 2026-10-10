/**
 * "Download your data" against a real Postgres (DEC-117): an owner asks,
 * the job builds one zip of the business's own rows and media, a signed
 * link is made and audited, and the file goes after its 7 days. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";
import { strFromU8, unzipSync } from "fflate";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import {
    DATA_EXPORT_BUILD_TYPE,
    DATA_EXPORT_EXPIRE_TYPE,
    DATA_EXPORT_KEPT_DAYS,
} from "./data-export-types";
import { DataExportHandler } from "./data-export.handler";
import { DataExportService } from "./data-export.service";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const storage = createMemoryStorage();
const service = new DataExportService(storage, new AuditService());
const handler = new DataExportHandler(storage);

async function business(lifecycleStatus = "ACTIVE") {
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), lifecycleStatus },
    });
    const ctx = (role: "OWNER" | "ADMIN"): OrganizationContext =>
        ({
            organizationId: org.id,
            userId: owner.id,
            role,
            roleKey: role,
            actions: new Set(),
        }) as unknown as OrganizationContext;
    return { org, owner, ctx };
}

async function photo(organizationId: string, name: string, text: string) {
    const bytes = new TextEncoder().encode(text);
    const upload = await storage.createSignedUploadUrl({
        organizationId,
        contentType: "image/png",
        contentLength: bytes.byteLength,
        filename: name,
    });
    storage.putBytes(upload.key, bytes);
    return prisma.media.create({
        data: {
            organizationId,
            key: upload.key,
            contentType: "image/png",
            sizeBytes: bytes.byteLength,
            filename: name,
            status: "READY",
        },
    });
}

const buildJob = (organizationId: string) =>
    prisma.job.findFirstOrThrow({
        where: { organizationId, type: DATA_EXPORT_BUILD_TYPE },
        orderBy: { createdAt: "desc" },
    });

async function unzipped(key: string): Promise<Record<string, string>> {
    const body = await storage.readObject(key);
    if (!body) throw new Error("no zip in storage");
    const parts: Uint8Array[] = [];
    for await (const chunk of body) parts.push(chunk);
    const files = unzipSync(Buffer.concat(parts));
    return Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]),
    );
}

describe("Download your data (DEC-117)", () => {
    it("builds one zip of the business's own records and media, and no other's", async () => {
        const { org, ctx } = await business();
        const other = await business();
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "=HYPERLINK(1)",
                lastName: 'Rao, "Ash"',
            },
        });
        await prisma.contact.create({
            data: {
                organizationId: other.org.id,
                email: "someone.else@example.com",
            },
        });
        const media = await photo(org.id, "Loaf One.png", "png-bytes");
        await photo(other.org.id, "theirs.png", "not-yours");

        const asked = await service.request(ctx("OWNER"));
        expect(asked.already).toBe(false);
        expect(asked.export.status).toBe("QUEUED");

        await handler.build(await buildJob(org.id));

        const row = await prisma.dataExport.findUniqueOrThrow({
            where: { id: asked.export.id },
        });
        expect(row.status).toBe("READY");
        expect(row.storageKey).toMatch(
            new RegExp(`^org/[a-z0-9-]+/data-export/${row.id}-`),
        );
        expect(
            (row.expiresAt?.getTime() ?? 0) - (row.readyAt?.getTime() ?? 0),
        ).toBe(DATA_EXPORT_KEPT_DAYS * 86_400_000);

        const files = await unzipped(row.storageKey ?? "");
        // Every table has its file, even when empty.
        for (const name of [
            "README.txt",
            "customers.csv",
            "orders.csv",
            "order-lines.csv",
            "invoices-and-credit-notes.csv",
            "bookings.csv",
            "products.csv",
            "product-variants.csv",
            "stock.csv",
            "memberships.csv",
            "class-pack-purchases.csv",
            "course-enrolments.csv",
            "leads.csv",
            "enquiries.csv",
            "media.csv",
        ]) {
            expect(Object.keys(files)).toContain(name);
        }
        const customers = files["customers.csv"];
        expect(customers).toContain("asha@example.com");
        expect(customers).not.toContain("someone.else@example.com");
        // A name a sheet would run is kept as text; quotes are doubled.
        expect(customers).toContain("'=HYPERLINK(1)");
        expect(customers).toContain('"Rao, ""Ash"""');
        // Nothing that isn't the business's to read.
        expect(files["orders.csv"].split("\r\n")[0]).not.toMatch(
            /payTokenHash|checkoutKey/,
        );

        expect(files[`media/${media.id}-loaf-one.png`]).toBe("png-bytes");
        expect(Object.values(files)).not.toContain("not-yours");
        expect(files["media.csv"]).toContain("Loaf One.png");

        expect(row.counts).toMatchObject({
            files: { "customers.csv": 1, "media.csv": 1 },
            media: { included: 1, leftOut: 0, bytes: 9 },
        });

        // Its own end is queued for the day it expires.
        const expire = await prisma.job.findFirstOrThrow({
            where: { organizationId: org.id, type: DATA_EXPORT_EXPIRE_TYPE },
        });
        expect(expire.runAt.getTime()).toBe(row.expiresAt?.getTime());

        // A signed link, audited; then the file goes and the link with it.
        const link = await service.link(ctx("OWNER"), row.id);
        expect(link.url).toContain("data-export");
        const trail = await prisma.auditEvent.findMany({
            where: { organizationId: org.id },
            select: { action: true },
        });
        expect(trail.map((t) => t.action).sort()).toEqual([
            "organization.data_export.downloaded",
            "organization.data_export.requested",
        ]);

        await handler.expire(expire);
        expect(await storage.readObject(row.storageKey ?? "")).toBeNull();
        expect(
            await prisma.dataExport.findUniqueOrThrow({
                where: { id: row.id },
            }),
        ).toMatchObject({ status: "EXPIRED", storageKey: null });
        await expect(service.link(ctx("OWNER"), row.id)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("makes one at a time: asking again answers with the one being made", async () => {
        const { org, ctx } = await business("PENDING_DELETION");
        const first = await service.request(ctx("OWNER"));
        const again = await service.request(ctx("OWNER"));
        expect(again).toMatchObject({
            already: true,
            export: { id: first.export.id },
        });
        expect(
            await prisma.job.count({
                where: { organizationId: org.id, type: DATA_EXPORT_BUILD_TYPE },
            }),
        ).toBe(1);
        // Two at once: still one.
        await handler.build(await buildJob(org.id));
        const pair = await Promise.all([
            service.request(ctx("OWNER")),
            service.request(ctx("OWNER")),
        ]);
        expect(new Set(pair.map((p) => p.export.id)).size).toBe(1);
        expect(
            await prisma.dataExport.count({
                where: { organizationId: org.id },
            }),
        ).toBe(2);
    });

    it("is the owner's only: an admin is refused the list, the ask and the link", async () => {
        const { ctx } = await business();
        const made = await service.request(ctx("OWNER"));
        await expect(service.list(ctx("ADMIN"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(service.request(ctx("ADMIN"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.link(ctx("ADMIN"), made.export.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // And another business's export is not found.
        const other = await business();
        await expect(
            service.link(other.ctx("OWNER"), made.export.id),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("says it failed, in words, once the tries run out; a deleted business gets none", async () => {
        const broken = createMemoryStorage();
        broken.putObject = () => Promise.reject(new Error("storage down"));
        const failing = new DataExportHandler(broken);
        const { org, ctx } = await business();
        const asked = await service.request(ctx("OWNER"));
        const job = await buildJob(org.id);
        await expect(failing.build(job)).rejects.toThrow("storage down");
        expect(
            await prisma.dataExport.findUniqueOrThrow({
                where: { id: asked.export.id },
            }),
        ).toMatchObject({ status: "RUNNING" });
        const last = { ...job, attempts: job.maxAttempts - 1 } as Job;
        await expect(failing.build(last)).rejects.toThrow("storage down");
        const failed = await service.list(ctx("OWNER"));
        expect(failed.inProgress).toBe(false);
        expect(failed.exports[0]).toMatchObject({
            status: "FAILED",
            failure: expect.stringContaining("couldn't put your data together"),
        });

        const gone = await business();
        const queued = await service.request(gone.ctx("OWNER"));
        await prisma.organization.update({
            where: { id: gone.org.id },
            data: { lifecycleStatus: "DELETED_RETAINED" },
        });
        await handler.build(await buildJob(gone.org.id));
        expect(
            await prisma.dataExport.findUniqueOrThrow({
                where: { id: queued.export.id },
            }),
        ).toMatchObject({ status: "FAILED", storageKey: null });
    });
});
