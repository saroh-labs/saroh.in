import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { ContactNoteDto } from "./dto";

/**
 * Notes about a customer (U8): what the team has written down, and the
 * allergens a note names.
 *
 * Allergens are ids from the storefront's own list (#483), never typed text,
 * so Order Detail's allergy banner can match a product's "Contains" / "May
 * contain" exactly. Each id is checked against the organization's list
 * before anything is written; a note needs text, an allergen, or both.
 *
 * Reading needs `contact:read` — a Member at the counter must see an allergy.
 * Writing needs `contact:write` (Owner/Admin today).
 */
export interface ContactNoteView {
    id: string;
    body: string;
    allergens: { id: string; name: string }[];
    createdByUserId: string | null;
    /** Who wrote it, by name; null when they have no name or have left. */
    author: string | null;
    createdAt: string;
    updatedAt: string;
}

const NOTE_SELECT = {
    id: true,
    body: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
    allergens: {
        orderBy: { allergen: { position: "asc" } },
        select: { allergen: { select: { id: true, name: true } } },
    },
} as const;

interface NoteRow {
    id: string;
    body: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    allergens: { allergen: { id: string; name: string } }[];
}

function noteView(row: NoteRow): ContactNoteView {
    return {
        id: row.id,
        body: row.body,
        allergens: row.allergens.map((a) => a.allergen),
        createdByUserId: row.createdByUserId,
        author: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/** A contact's notes, newest first. The detail read uses it as a source. */
export async function loadContactNotes(
    db: typeof prisma,
    organizationId: string,
    contactId: string,
): Promise<ContactNoteView[]> {
    const rows = await db.contactNote.findMany({
        where: { organizationId, contactId },
        orderBy: { createdAt: "desc" },
        select: NOTE_SELECT,
    });
    return withAuthors(db, rows.map(noteView));
}

/** Put the writer's name on each note: the team reads "Nisha, 12 Sep". */
async function withAuthors(
    db: typeof prisma,
    notes: ContactNoteView[],
): Promise<ContactNoteView[]> {
    const ids = [
        ...new Set(
            notes.map((n) => n.createdByUserId).filter((id) => id !== null),
        ),
    ];
    if (ids.length === 0) return notes;
    const users = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
    });
    // A blank name is no name: the note then says who wrote it as "Team".
    const names = new Map(
        users.map((u) => [u.id, u.name?.trim() ? u.name.trim() : null]),
    );
    return notes.map((n) => ({
        ...n,
        author: n.createdByUserId
            ? (names.get(n.createdByUserId) ?? null)
            : null,
    }));
}

/**
 * The allergens a note may name: every storefront's list in the
 * organization, one per name (the first storefront's id wins), in list order.
 */
export async function allergenChoices(
    db: typeof prisma,
    organizationId: string,
): Promise<{ id: string; name: string }[]> {
    const rows = await db.storeAllergen.findMany({
        where: { organizationId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
    });
    const seen = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
        const key = r.name.trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, r);
    }
    return [...seen.values()];
}

/** Every allergen the notes name, once, in the order first named. */
export function notedAllergens(
    notes: ContactNoteView[],
): { id: string; name: string }[] {
    const seen = new Map<string, { id: string; name: string }>();
    for (const note of notes)
        for (const a of note.allergens) if (!seen.has(a.id)) seen.set(a.id, a);
    return [...seen.values()];
}

@Injectable()
export class ContactNotesService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    async create(
        ctx: OrganizationContext,
        contactId: string,
        dto: ContactNoteDto,
    ): Promise<ContactNoteView> {
        authorize(ctx, "contact:write");
        await this.requireContact(ctx, contactId);
        const body = dto.body ?? "";
        const allergenIds = [...new Set(dto.allergenIds ?? [])];
        this.requireSomething(body, allergenIds);
        await this.checkAllergens(ctx, allergenIds);

        const id = await this.db.$transaction(async (tx) => {
            const note = await tx.contactNote.create({
                data: {
                    organizationId: ctx.organizationId,
                    contactId,
                    body,
                    createdByUserId: ctx.userId,
                    updatedByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await tx.contactNoteAllergen.createMany({
                data: allergenIds.map((allergenId) => ({
                    noteId: note.id,
                    allergenId,
                    organizationId: ctx.organizationId,
                })),
            });
            await this.audit(tx, ctx, "contact.note.created", note.id, {
                contactId,
                allergens: allergenIds.length,
            });
            return note.id;
        });
        return this.read(ctx, contactId, id);
    }

    /** Fields given replace what the note had; fields left out are kept. */
    async update(
        ctx: OrganizationContext,
        contactId: string,
        noteId: string,
        dto: ContactNoteDto,
    ): Promise<ContactNoteView> {
        authorize(ctx, "contact:write");
        const current = await this.read(ctx, contactId, noteId);
        const body = dto.body ?? current.body;
        const allergenIds = dto.allergenIds
            ? [...new Set(dto.allergenIds)]
            : current.allergens.map((a) => a.id);
        this.requireSomething(body, allergenIds);
        if (dto.allergenIds) await this.checkAllergens(ctx, allergenIds);

        await this.db.$transaction(async (tx) => {
            await tx.contactNote.update({
                where: { id: noteId },
                data: { body, updatedByUserId: ctx.userId },
            });
            if (dto.allergenIds) {
                await tx.contactNoteAllergen.deleteMany({ where: { noteId } });
                await tx.contactNoteAllergen.createMany({
                    data: allergenIds.map((allergenId) => ({
                        noteId,
                        allergenId,
                        organizationId: ctx.organizationId,
                    })),
                });
            }
            await this.audit(tx, ctx, "contact.note.updated", noteId, {
                contactId,
                allergens: allergenIds.length,
            });
        });
        return this.read(ctx, contactId, noteId);
    }

    async remove(
        ctx: OrganizationContext,
        contactId: string,
        noteId: string,
    ): Promise<void> {
        authorize(ctx, "contact:write");
        await this.read(ctx, contactId, noteId);
        await this.db.$transaction(async (tx) => {
            await tx.contactNote.delete({ where: { id: noteId } });
            await this.audit(tx, ctx, "contact.note.deleted", noteId, {
                contactId,
            });
        });
    }

    /** One note of this contact in this organization, or a 404. */
    private async read(
        ctx: OrganizationContext,
        contactId: string,
        noteId: string,
    ): Promise<ContactNoteView> {
        const row = await this.db.contactNote.findFirst({
            where: {
                id: noteId,
                contactId,
                organizationId: ctx.organizationId,
            },
            select: NOTE_SELECT,
        });
        if (!row) throw new NotFoundException("Note not found");
        const views = await withAuthors(this.db, [noteView(row)]);
        return views[0] ?? noteView(row);
    }

    private requireSomething(body: string, allergenIds: string[]): void {
        if (body.trim().length === 0 && allergenIds.length === 0) {
            throw new BadRequestException({
                message: "Write a note or pick an allergen.",
                field: "body",
            });
        }
    }

    /** Every id is on this organization's allergen list. */
    private async checkAllergens(
        ctx: OrganizationContext,
        allergenIds: string[],
    ): Promise<void> {
        if (allergenIds.length === 0) return;
        const found = await this.db.storeAllergen.count({
            where: {
                organizationId: ctx.organizationId,
                id: { in: allergenIds },
            },
        });
        if (found !== allergenIds.length) {
            throw new BadRequestException({
                message:
                    "An allergen in the note is not on your storefront's allergen list.",
                field: "allergenIds",
            });
        }
    }

    private async requireContact(ctx: OrganizationContext, contactId: string) {
        const contact = await this.db.contact.findFirst({
            where: { id: contactId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!contact) throw new NotFoundException("Contact not found");
    }

    /** Who wrote, changed or removed a note — never what it said. */
    private async audit(
        tx: Pick<typeof prisma, "auditEvent">,
        ctx: OrganizationContext,
        action: string,
        noteId: string,
        metadata: Record<string, string | number>,
    ): Promise<void> {
        await tx.auditEvent.create({
            data: {
                action,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "contactNote",
                targetId: noteId,
                outcome: "SUCCESS",
                metadata,
            },
        });
    }
}
