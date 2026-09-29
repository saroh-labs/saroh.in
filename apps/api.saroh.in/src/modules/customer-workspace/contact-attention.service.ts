import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allergenKey } from "./allergen-match";
import type {
    AttentionEntryView,
    AttentionRead,
    AttentionRow,
} from "./attention-read";
import {
    ATTENTION_SELECT,
    attentionFor,
    attentionSuggestionsFor,
    attentionViews,
    canSeeSensitive,
} from "./attention-read";
import { requireCustomerPower } from "./customer-access";
import type {
    AttentionKind,
    ConfirmAttentionDto,
    CreateAttentionDto,
    UpdateAttentionDto,
} from "./dto";

/**
 * Needs attention, written (DEC-040, C1): one list per customer of what the
 * team must know — an allergy, a medical note, an access need, anything
 * else.
 *
 * - Writing needs `contact:write`. A sensitive entry (Medical by default)
 *   can be made, changed, confirmed or removed only by someone who may read
 *   it (`canSeeSensitive`).
 * - An Allergy entry names an allergen from the business's list when it has
 *   one, so an order can be checked against a product's "Contains"; a
 *   business with no list writes the allergy as its label. One entry per
 *   allergen name per person.
 * - Removing an entry, or "Nothing to add" on a suggestion, stamps
 *   `removedAt`; the row stays.
 * - Activity records the kind and whether it is sensitive, never the words
 *   (DEC-035).
 */
export interface ContactAttentionView extends AttentionRead {
    /** Waiting for staff; present only for someone who can add them. */
    suggestions?: AttentionEntryView[];
}

interface Fields {
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    allergenId: string | null;
}

@Injectable()
export class ContactAttentionService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    /** The person's list as this viewer may see it. */
    async list(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<ContactAttentionView> {
        requireCustomerPower(ctx, "contact:read");
        await this.requireContact(ctx, contactId);
        const [read, suggestions] = await Promise.all([
            attentionFor(ctx, [contactId], this.db),
            attentionSuggestionsFor(ctx, contactId, this.db),
        ]);
        return {
            ...(read.get(contactId) ?? {
                entries: [],
                hiddenSensitiveCount: 0,
            }),
            ...(suggestions === undefined ? {} : { suggestions }),
        };
    }

    async create(
        ctx: OrganizationContext,
        contactId: string,
        dto: CreateAttentionDto,
    ): Promise<AttentionEntryView> {
        requireCustomerPower(ctx, "contact:write");
        await this.requireContact(ctx, contactId);
        const { fields, allergenName } = await this.settle(ctx, {
            kind: dto.kind,
            label: dto.label ?? "",
            detail: dto.detail ?? null,
            sensitive: dto.sensitive ?? dto.kind === "MEDICAL",
            allergenId: dto.allergenId ?? null,
        });
        this.requireSensitiveReader(ctx, fields.sensitive);
        await this.refuseSecondAllergy(
            ctx,
            contactId,
            fields,
            null,
            allergenName,
        );

        const id = await this.db.$transaction(async (tx) => {
            const row = await tx.contactAttention.create({
                data: {
                    organizationId: ctx.organizationId,
                    contactId,
                    ...fields,
                    source: "STAFF",
                    status: "ACTIVE",
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await this.audit(tx, ctx, "contact.attention.created", row.id, {
                contactId,
                kind: fields.kind,
                sensitive: fields.sensitive ? "yes" : "no",
            });
            return row.id;
        });
        return this.view(ctx, contactId, id);
    }

    /** Fields given replace what the entry had; fields left out are kept. */
    async update(
        ctx: OrganizationContext,
        contactId: string,
        entryId: string,
        dto: UpdateAttentionDto,
    ): Promise<AttentionEntryView> {
        requireCustomerPower(ctx, "contact:write");
        const current = await this.find(ctx, contactId, entryId);
        this.requireSensitiveReader(ctx, current.sensitive);

        const kind = dto.kind ?? current.kind;
        const allergenId =
            dto.allergenId !== undefined
                ? dto.allergenId
                : kind === "ALLERGY"
                  ? (current.allergen?.id ?? null)
                  : null;
        // A new allergen with no label given takes the allergen's name; a
        // label the team wrote is kept otherwise.
        const label =
            dto.label ??
            (dto.allergenId !== undefined &&
            dto.allergenId !== current.allergen?.id
                ? ""
                : current.label);
        const { fields, allergenName } = await this.settle(ctx, {
            kind,
            label,
            detail: dto.detail !== undefined ? dto.detail : current.detail,
            sensitive: dto.sensitive ?? current.sensitive,
            allergenId,
        });
        this.requireSensitiveReader(ctx, fields.sensitive);
        await this.refuseSecondAllergy(
            ctx,
            contactId,
            fields,
            entryId,
            allergenName,
        );

        await this.db.$transaction(async (tx) => {
            await tx.contactAttention.update({
                where: { id: entryId },
                data: fields,
            });
            await this.audit(tx, ctx, "contact.attention.updated", entryId, {
                contactId,
                kind: fields.kind,
                sensitive: fields.sensitive ? "yes" : "no",
            });
        });
        return this.view(ctx, contactId, entryId);
    }

    /** Off the list — or, for a suggestion, "Nothing to add". */
    async remove(
        ctx: OrganizationContext,
        contactId: string,
        entryId: string,
    ): Promise<void> {
        requireCustomerPower(ctx, "contact:write");
        const current = await this.find(ctx, contactId, entryId);
        this.requireSensitiveReader(ctx, current.sensitive);
        await this.db.$transaction(async (tx) => {
            await tx.contactAttention.update({
                where: { id: entryId },
                data: { removedAt: new Date() },
            });
            await this.audit(
                tx,
                ctx,
                current.status === "SUGGESTED"
                    ? "contact.attention.dismissed"
                    : "contact.attention.removed",
                entryId,
                { contactId, kind: current.kind },
            );
        });
    }

    /**
     * "Add to Needs attention": a suggestion goes on the record, with the
     * kind, label and sensitive tick staff settled on (C12). What they left
     * out stays as suggested, and the detail (the booker's words) is kept.
     * Confirming one already on it answers with the entry as it is, so a
     * second tap is harmless.
     */
    async confirm(
        ctx: OrganizationContext,
        contactId: string,
        entryId: string,
        dto: ConfirmAttentionDto = {},
    ): Promise<AttentionEntryView> {
        requireCustomerPower(ctx, "contact:write");
        const current = await this.find(ctx, contactId, entryId);
        this.requireSensitiveReader(ctx, current.sensitive);
        if (current.status === "ACTIVE") {
            return this.view(ctx, contactId, entryId);
        }
        const kind = dto.kind ?? current.kind;
        const { fields, allergenName } = await this.settle(ctx, {
            kind,
            label: dto.label ?? current.label,
            detail: current.detail,
            sensitive: dto.sensitive ?? current.sensitive,
            allergenId:
                dto.allergenId !== undefined
                    ? dto.allergenId
                    : kind === "ALLERGY"
                      ? (current.allergen?.id ?? null)
                      : null,
        });
        this.requireSensitiveReader(ctx, fields.sensitive);
        await this.refuseSecondAllergy(
            ctx,
            contactId,
            fields,
            entryId,
            allergenName,
        );
        await this.db.$transaction(async (tx) => {
            // Only a suggestion still waiting is added: a teammate's "Nothing
            // to add" or Add a moment ago stands, and the answer below is the
            // entry as it now is (or a 404, once set aside).
            const { count } = await tx.contactAttention.updateMany({
                where: {
                    id: entryId,
                    organizationId: ctx.organizationId,
                    status: "SUGGESTED",
                    removedAt: null,
                },
                data: {
                    ...fields,
                    status: "ACTIVE",
                    confirmedByUserId: ctx.userId,
                },
            });
            if (count === 0) return;
            await this.audit(tx, ctx, "contact.attention.confirmed", entryId, {
                contactId,
                kind: fields.kind,
                sensitive: fields.sensitive ? "yes" : "no",
            });
        });
        return this.view(ctx, contactId, entryId);
    }

    /**
     * The rules that need the business's allergen list. An Allergy entry
     * names one of its allergens when there is a list (an id from another
     * business is a 404, as any cross-tenant id); its label defaults to the
     * allergen's name. Other kinds name no allergen.
     */
    private async settle(
        ctx: OrganizationContext,
        f: Fields,
    ): Promise<{ fields: Fields; allergenName: string | null }> {
        if (f.kind !== "ALLERGY") {
            if (f.allergenId) {
                throw new BadRequestException({
                    message: "Only an allergy names an allergen.",
                    field: "allergenId",
                });
            }
            return {
                fields: this.requireLabel({ ...f, allergenId: null }),
                allergenName: null,
            };
        }
        if (f.allergenId) {
            const allergen = await this.db.storeAllergen.findFirst({
                where: { id: f.allergenId, organizationId: ctx.organizationId },
                select: { id: true, name: true },
            });
            if (!allergen) throw new NotFoundException("Allergen not found");
            return {
                fields: this.requireLabel({
                    ...f,
                    label: f.label || allergen.name.trim(),
                }),
                allergenName: allergen.name,
            };
        }
        const listed = await this.db.storeAllergen.count({
            where: { organizationId: ctx.organizationId },
        });
        if (listed > 0) {
            throw new BadRequestException({
                message: "Pick the allergen from your list.",
                field: "allergenId",
            });
        }
        return { fields: this.requireLabel(f), allergenName: null };
    }

    private requireLabel(f: Fields): Fields {
        if (f.label.trim().length === 0) {
            throw new BadRequestException({
                message:
                    f.kind === "ALLERGY"
                        ? "Say what they're allergic to."
                        : "Say what the team should know.",
                field: "label",
            });
        }
        return f;
    }

    private requireSensitiveReader(
        ctx: OrganizationContext,
        sensitive: boolean,
    ): void {
        if (sensitive && !canSeeSensitive(ctx)) {
            throw new ForbiddenException(
                "Your role can't see sensitive notes, so it can't change them.",
            );
        }
    }

    /** One entry per allergen name per person: the second is a 409. */
    private async refuseSecondAllergy(
        ctx: OrganizationContext,
        contactId: string,
        f: Fields,
        exceptId: string | null,
        allergenName: string | null,
    ): Promise<void> {
        if (f.kind !== "ALLERGY") return;
        const others = await this.db.contactAttention.findMany({
            where: {
                organizationId: ctx.organizationId,
                contactId,
                kind: "ALLERGY",
                status: "ACTIVE",
                removedAt: null,
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { label: true, allergen: { select: { name: true } } },
        });
        const key = allergenKey(allergenName ?? f.label);
        if (
            others.some((o) => allergenKey(o.allergen?.name ?? o.label) === key)
        ) {
            throw new ConflictException({
                message: "This allergy is already on their list.",
                field: f.allergenId ? "allergenId" : "label",
            });
        }
    }

    /** One entry of this contact in this organization, not removed; or 404. */
    private async find(
        ctx: OrganizationContext,
        contactId: string,
        entryId: string,
    ): Promise<AttentionRow> {
        const row: AttentionRow | null =
            await this.db.contactAttention.findFirst({
                where: {
                    id: entryId,
                    contactId,
                    organizationId: ctx.organizationId,
                    removedAt: null,
                },
                select: ATTENTION_SELECT,
            });
        if (!row) throw new NotFoundException("Entry not found");
        return row;
    }

    private async view(
        ctx: OrganizationContext,
        contactId: string,
        entryId: string,
    ): Promise<AttentionEntryView> {
        const row = await this.find(ctx, contactId, entryId);
        const [view] = await attentionViews(this.db, ctx.organizationId, [row]);
        return view;
    }

    private async requireContact(ctx: OrganizationContext, contactId: string) {
        const contact = await this.db.contact.findFirst({
            where: { id: contactId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!contact) throw new NotFoundException("Contact not found");
    }

    /** Who changed the list and what kind of entry — never its words. */
    private async audit(
        tx: Pick<typeof prisma, "auditEvent">,
        ctx: OrganizationContext,
        action: string,
        entryId: string,
        metadata: Record<string, string>,
    ): Promise<void> {
        await tx.auditEvent.create({
            data: {
                action,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "contactAttention",
                targetId: entryId,
                outcome: "SUCCESS",
                metadata,
            },
        });
    }
}
