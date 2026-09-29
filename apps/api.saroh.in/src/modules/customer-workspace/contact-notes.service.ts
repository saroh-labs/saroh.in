import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allergenKey } from "./allergen-match";
import { ensureAllergyEntries } from "./attention-allergy";
import { requireCustomerPower } from "./customer-access";
import type { ContactNoteDto } from "./dto";

/**
 * Notes about a customer (U8): what the team has written down. Text only
 * (Z2a): an allergy lives on Needs attention (C1), which Order Detail's
 * banner, the kitchen and bookings read.
 *
 * Notes once named allergens too (`ContactNoteAllergen`). Nothing reads or
 * writes those rows now: the C1 backfill copied them to Needs attention, and
 * the table is dropped two deploys later (Z2). For an app from before Z2a the
 * view still carries empty `allergens` / `matchAllergens`, and allergens it
 * sends with a note go on Needs attention rather than being lost. A note that
 * held only allergens (no text) is left out of the list.
 *
 * Reading needs `contact:read`. Writing needs `contact:write` (Owner/Admin
 * today).
 */
export interface ContactNoteView {
    id: string;
    body: string;
    /** Always empty since Z2a; kept for an app from before it. */
    allergens: { id: string; name: string }[];
    /** Always empty since Z2a; kept for an app from before it. */
    matchAllergens: { id: string; name: string }[];
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
} as const;

interface NoteRow {
    id: string;
    body: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

function noteView(row: NoteRow): ContactNoteView {
    return {
        id: row.id,
        body: row.body,
        allergens: [],
        matchAllergens: [],
        createdByUserId: row.createdByUserId,
        author: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/**
 * A contact's notes, newest first. The detail read uses it as a source. A
 * note with no text held only allergens, which are on Needs attention now.
 */
export async function loadContactNotes(
    db: typeof prisma,
    organizationId: string,
    contactId: string,
): Promise<ContactNoteView[]> {
    const rows = await db.contactNote.findMany({
        where: { organizationId, contactId, body: { not: "" } },
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
 * The allergens a Needs attention entry may name: the business's list, one
 * per name (the first row's id wins where two share a name), in list order.
 * Customer Detail sends it beside the notes; the attention sheet reads it.
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
        const key = allergenKey(r.name);
        if (!seen.has(key)) seen.set(key, r);
    }
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
        requireCustomerPower(ctx, "contact:write");
        await this.requireContact(ctx, contactId);
        const body = this.requireText(dto.body ?? "");

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
            await this.toAttention(tx, ctx, contactId, dto);
            await this.audit(tx, ctx, "contact.note.created", note.id, {
                contactId,
            });
            return note.id;
        });
        return this.read(ctx, contactId, id);
    }

    /** The text given replaces what the note had; none keeps it. */
    async update(
        ctx: OrganizationContext,
        contactId: string,
        noteId: string,
        dto: ContactNoteDto,
    ): Promise<ContactNoteView> {
        requireCustomerPower(ctx, "contact:write");
        const current = await this.read(ctx, contactId, noteId);
        const body = this.requireText(dto.body ?? current.body);

        await this.db.$transaction(async (tx) => {
            await tx.contactNote.update({
                where: { id: noteId },
                data: { body, updatedByUserId: ctx.userId },
            });
            await this.toAttention(tx, ctx, contactId, dto);
            await this.audit(tx, ctx, "contact.note.updated", noteId, {
                contactId,
            });
        });
        return this.read(ctx, contactId, noteId);
    }

    async remove(
        ctx: OrganizationContext,
        contactId: string,
        noteId: string,
    ): Promise<void> {
        requireCustomerPower(ctx, "contact:write");
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

    /** A note is its text: one without any is refused. */
    private requireText(body: string): string {
        if (body.trim().length === 0) {
            throw new BadRequestException({
                message: "Write a note.",
                field: "body",
            });
        }
        return body;
    }

    /**
     * An app from before Z2a still sends the allergens picked on a note.
     * They never touch the note; each one on the business's list goes on the
     * person's Needs attention instead (only ever adds, one per name), so an
     * allergy picked there is not lost. Ids not on the list are skipped.
     */
    private async toAttention(
        tx: Parameters<typeof ensureAllergyEntries>[0],
        ctx: OrganizationContext,
        contactId: string,
        dto: ContactNoteDto,
    ): Promise<void> {
        const allergenIds = [...new Set(dto.allergenIds ?? [])];
        if (allergenIds.length === 0) return;
        await ensureAllergyEntries(tx, {
            organizationId: ctx.organizationId,
            contactId,
            userId: ctx.userId,
            allergenIds,
        });
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
