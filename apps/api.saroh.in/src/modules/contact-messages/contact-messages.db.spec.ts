/**
 * Messages from saroh.in/contact (DEC-137) against a real Postgres: a
 * message is stored as sent, the console lists them newest first and by
 * topic without the address digest, and one that arrived more than 12
 * months ago is deleted while a newer one stays.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { AdminContactMessagesService } from "../admin/admin-contact-messages.service";
import { ContactMessagesService } from "./contact-messages.service";
import { deleteOldContactMessages } from "./contact-retention";

const DAY_MS = 24 * 60 * 60 * 1000;
const service = new ContactMessagesService();
const admin = new AdminContactMessagesService();

describe("contact messages", () => {
    it("stores a message as it was sent", async () => {
        await service.send({
            topic: "question",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "salon",
            message: "Can I take bookings for two branches?",
            ipHash: "digest-1",
        });
        await service.send({
            topic: "bug",
            name: "Ravi Menon",
            email: "ravi.menon@example.com",
            message: "The calendar didn't open.",
        });

        const rows = await prisma.contactMessage.findMany({
            orderBy: { createdAt: "asc" },
            select: {
                topic: true,
                name: true,
                email: true,
                kind: true,
                message: true,
                ipHash: true,
            },
        });
        expect(rows).toEqual([
            {
                topic: "question",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                kind: "salon",
                message: "Can I take bookings for two branches?",
                ipHash: "digest-1",
            },
            {
                topic: "bug",
                name: "Ravi Menon",
                email: "ravi.menon@example.com",
                kind: null,
                message: "The calendar didn't open.",
                ipHash: null,
            },
        ]);
    });

    it("lists newest first, by topic on asking, without the digest", async () => {
        // Two rows written in the same millisecond would order by id alone;
        // set the times apart so "newest first" is what is checked.
        const older = await prisma.contactMessage.findFirstOrThrow({
            where: { topic: "question" },
            select: { id: true },
        });
        await prisma.contactMessage.update({
            where: { id: older.id },
            data: { createdAt: new Date(Date.now() - DAY_MS) },
        });

        const all = await admin.list({});
        expect(all.items.map((m) => m.topic)).toEqual(["bug", "question"]);
        expect(all.nextCursor).toBeUndefined();
        expect(all.items[0]).not.toHaveProperty("ipHash");
        expect(all.items[1]).toMatchObject({
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "salon",
        });

        const bugs = await admin.list({ topic: "bug" });
        expect(bugs.items.map((m) => m.name)).toEqual(["Ravi Menon"]);
    });

    it("deletes a message 12 months after it arrived, and no sooner", async () => {
        const now = new Date();
        const old = await prisma.contactMessage.findFirstOrThrow({
            where: { topic: "question" },
            select: { id: true },
        });
        await prisma.contactMessage.update({
            where: { id: old.id },
            data: { createdAt: new Date(now.getTime() - 366 * DAY_MS) },
        });
        const recent = await prisma.contactMessage.findFirstOrThrow({
            where: { topic: "bug" },
            select: { id: true },
        });
        await prisma.contactMessage.update({
            where: { id: recent.id },
            data: { createdAt: new Date(now.getTime() - 364 * DAY_MS) },
        });

        await expect(deleteOldContactMessages(now)).resolves.toBe(1);
        const left = await prisma.contactMessage.findMany({
            select: { id: true },
        });
        expect(left).toEqual([{ id: recent.id }]);
        // A second run finds nothing more to delete.
        await expect(deleteOldContactMessages(now)).resolves.toBe(0);
    });
});
