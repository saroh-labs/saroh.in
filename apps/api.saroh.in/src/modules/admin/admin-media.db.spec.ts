/**
 * Staff take a business's upload down (owner, 22 Nov 2026) against a real
 * Postgres: the object and each smaller copy are deleted from storage, the
 * row goes, a product showing it loses it, and the ledger says who and why.
 * Another business's path is a 404; a held business is refused.
 *
 * Route permission is pinned by `admin.controller.permissions.spec.ts`.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";

import { AdminAuditService } from "./admin-audit.service";
import { AdminMediaService } from "./admin-media.service";
import { AdminPermission } from "./admin-permissions";

const tag = `${process.pid}-${Date.now()}`;
const deleteObject = jest.fn().mockResolvedValue(undefined);
const service = new AdminMediaService(new AdminAuditService(), {
    deleteObject,
} as unknown as ObjectStorage);

let staffId: string;
let organizationId: string;
let otherId: string;

const command = (mediaId: string, organization = organizationId) =>
    ({
        staff: {
            userId: staffId,
            platformAdminId: "pa",
            roles: [],
            permissions: [AdminPermission.OrganizationLifecycleWrite],
            viaBootstrap: false,
        },
        organizationId: organization,
        mediaId,
        reason: "Reported image, against the Terms",
    }) as never;

const upload = (organization: string, n: string, variants?: unknown) =>
    prisma.media.create({
        data: {
            organizationId: organization,
            key: `org/${organization}/${n}-${tag}.jpg`,
            contentType: "image/jpeg",
            sizeBytes: 1000,
            filename: `${n}.jpg`,
            status: "READY",
            ...(variants ? { variants } : {}),
        },
    });

describe("staff remove an upload (DB)", () => {
    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `media-${tag}@example.com`, name: "Staff" },
            })
        ).id;
        organizationId = (
            await prisma.organization.create({
                data: { name: "Northwind", slug: `med-${tag}` },
            })
        ).id;
        otherId = (
            await prisma.organization.create({
                data: { name: "Other", slug: `med-o-${tag}` },
            })
        ).id;
    });

    beforeEach(() => deleteObject.mockClear());

    it("deletes the object, every smaller copy, then the row, on the ledger", async () => {
        const media = await upload(organizationId, "photo", [
            {
                width: 320,
                key: `org/${organizationId}/photo-320-${tag}.webp`,
                bytes: 10,
            },
            {
                width: 640,
                key: `org/${organizationId}/photo-640-${tag}.webp`,
                bytes: 20,
            },
        ]);

        await expect(service.remove(command(media.id))).resolves.toEqual({
            ok: true,
            id: media.id,
            deleted: true,
        });

        expect(deleteObject.mock.calls.map(([key]) => key)).toEqual([
            media.key,
            `org/${organizationId}/photo-320-${tag}.webp`,
            `org/${organizationId}/photo-640-${tag}.webp`,
        ]);
        await expect(
            prisma.media.findUnique({ where: { id: media.id } }),
        ).resolves.toBeNull();
        const ledger = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { organizationId, action: "media.removed" },
        });
        expect(ledger).toMatchObject({
            actorUserId: staffId,
            permission: AdminPermission.OrganizationLifecycleWrite,
            targetType: "media",
            targetId: media.id,
            reason: "Reported image, against the Terms",
            outcome: "SUCCESS",
        });
        await expect(
            prisma.auditEvent.count({
                where: { organizationId, action: "media.removed" },
            }),
        ).resolves.toBe(1);
    });

    it("an upload without smaller copies deletes its one object", async () => {
        const media = await upload(organizationId, "old");
        await service.remove(command(media.id));
        expect(deleteObject).toHaveBeenCalledTimes(1);
        expect(deleteObject).toHaveBeenCalledWith(media.key);
    });

    it("another business's upload under this business's path is a 404, nothing deleted", async () => {
        const theirs = await upload(otherId, "theirs");
        await expect(service.remove(command(theirs.id))).rejects.toMatchObject({
            status: 404,
        });
        expect(deleteObject).not.toHaveBeenCalled();
        await expect(
            prisma.media.count({ where: { id: theirs.id } }),
        ).resolves.toBe(1);
    });

    it("refuses a business on legal hold, nothing deleted", async () => {
        const held = await upload(otherId, "held");
        await prisma.organization.update({
            where: { id: otherId },
            data: { legalHoldAt: new Date(), legalHoldByUserId: staffId },
        });
        await expect(
            service.remove(command(held.id, otherId)),
        ).rejects.toMatchObject({ status: 409 });
        expect(deleteObject).not.toHaveBeenCalled();
    });
});
