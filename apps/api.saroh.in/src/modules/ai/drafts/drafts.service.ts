import { randomUUID } from "node:crypto";

import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import type {
    AskAiConfirmBody,
    AskAiDraftCard,
    AskAiDraftField,
    AskAiDraftRefusal,
    AskAiDraftResult,
} from "@saroh/api-contract";
import type { AskAiDraft, AskAiDraftStatus } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import {
    MODULE_LOCKED,
    PLAN_LIMIT_REACHED,
} from "../../billing/plan-limit-errors";
import { businessTimezone } from "../../bookings/staff-availability";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { McpActivityService } from "../../mcp/activity.service";
import type { McpCall, McpTool } from "../../mcp/tool-registry";
import {
    McpToolRegistry,
    messageOf,
    parseInProcess,
    ToolError,
    toolError,
} from "../../mcp/tool-registry";
import { OrderKitchenService } from "../../orders/order-kitchen.service";
import { assertWorkspaceWrite } from "../../organizations/organization-lifecycle.gate";
import { openDraftBody, sealDraftBody } from "../history/sealing";
import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../settings/ai-settings.service";
import { askAiCall, refused, textOf } from "../tools/ask-ai-call";
import type { AiToolRun, AiTurnRef } from "../tools/toolbox.port";
import { askAiAvailable } from "../turn/turn-runner";
import { TurnStore } from "../turn/turn-store";
import type { DraftSpec, ReadContext, TargetState } from "./draft-targets";
import { DRAFT_SPECS, labelOf } from "./draft-targets";

/** A create's request_id while it is only drafted (rolled back, so never kept). */
const DRAFTING = "ask-ai-draft";
/** A confirmed create's request_id: one save per draft, however often Confirm is sent. */
const savedAs = (draftId: string) => `ask-ai:${draftId}`;

/** What a draft keeps sealed: its input, the values before and after, and the card. */
interface DraftBody {
    input: Record<string, unknown>;
    previous: TargetState | null;
    card: AskAiDraftCard;
    /** After Confirm: the record as the save left it, what Undo checks against. */
    applied?: TargetState | null;
    /** After Confirm of an order step: the step Undo names. */
    eventId?: string;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

const STATUS: Record<AskAiDraftStatus, AskAiDraftCard["status"]> = {
    DRAFTED: "drafted",
    CONFIRMED: "confirmed",
    UNDONE: "undone",
    EXPIRED: "expired",
    REFUSED: "refused",
};

/**
 * Hook for the `ai:use` permission (plan U7). Until it exists every member
 * who reaches Ask AI may use it; U7 makes this `authorize(ctx, "ai:use")`.
 */
function assertMayUseAskAi(ctx: OrganizationContext): void {
    void ctx;
}

/**
 * Ask AI's drafts (DEC-220, plan 2026-11-13-001 U5): the AI never saves;
 * the person does.
 *
 * - In a turn, a write tool runs as it would, through the same contract,
 *   services, plan limits and duplicate check, inside a transaction that
 *   is rolled back (`McpToolRegistry.dryRun`): nothing is saved and no AI
 *   activity is recorded. The draft is kept here, sealed, and the turn
 *   ends on its card: every field that will change, old → new.
 * - Confirm, Undo and Draft again take only the draft's id, looked up with
 *   the business and person from the request (another's is a 404). Each
 *   checks again: the halt, `ASK_AI`, the business's switch, the person's
 *   live role and the module; then that nothing changed since.
 * - Confirm re-runs the draft, refuses if the result differs from the
 *   card, takes the draft in one conditional update (a second Confirm
 *   loses), and saves through the normal tool, audited "via Ask AI".
 * - Undo is the change's inverse through the normal services, only while
 *   untouched and on the same business day (a service's shorter window wins).
 */
@Injectable()
export class DraftsService {
    constructor(
        private readonly registry: McpToolRegistry,
        private readonly settings: AiSettingsService,
        private readonly flags: FeatureFlagService,
        private readonly store: TurnStore,
        private readonly kitchen: OrderKitchenService,
        private readonly activity: McpActivityService,
    ) {}

    /**
     * A write tool's call in a turn: a draft card for the person, or a
     * refusal for the model to act on (input that doesn't fit, an unknown
     * id, a taken time). Never saves.
     */
    async draft(
        asker: McpCall,
        tool: McpTool,
        raw: unknown,
        turn: AiTurnRef,
        redraftOfId?: string,
    ): Promise<AiToolRun> {
        const spec = DRAFT_SPECS[tool.name] as DraftSpec | undefined;
        if (!spec) {
            return refused(
                "Ask AI can't draft that. Next: tell the person they can do it in the Saroh app.",
            );
        }
        const org = asker.ctx.organizationId;
        const given =
            raw && typeof raw === "object" && !Array.isArray(raw)
                ? { ...(raw as Record<string, unknown>) }
                : {};
        delete given.business;
        if (!spec.targetOf) given.request_id = DRAFTING;
        const parsed = parseInProcess(tool, given);
        const draft: NewDraft = {
            id: randomUUID(),
            asker,
            tool,
            spec,
            turn,
            redraftOfId,
            input: parsed instanceof ToolError ? given : parsed,
            previous: null,
            fields: [],
            missing: [],
        };
        if (parsed instanceof ToolError) {
            draft.missing = missingOf(tool, given, spec.askable);
            if (draft.missing.length === 0) {
                return textOf(toolError(parsed, tool.name));
            }
            draft.fields = givenFields(given);
            return this.keep(draft);
        }
        const duplicate = await this.duplicateOf(spec, org, parsed);
        if (duplicate) return this.keep({ ...draft, refusal: duplicate });

        const reader = this.reader(asker);
        const targetId = spec.targetOf?.(parsed);
        if (targetId) {
            draft.previous = await asBusiness(org, () =>
                spec.read(reader, targetId),
            );
            if (!draft.previous) {
                return refused(
                    `There is no ${spec.kind} ${targetId} in this business. Next: take the id from a list or get tool's result.`,
                );
            }
        }
        const dry = await this.dryRun(asker, tool, spec, parsed, targetId);
        if (!dry.ok) {
            const refusal = refusalOf(dry.error, spec);
            if (!refusal) return textOf(toolError(dry.error, tool.name));
            return this.keep({ ...draft, refusal });
        }
        if (!dry.value) {
            return refused(
                "Saroh couldn't read back what this would make. Next: try once more, or tell the person to do it in the Saroh app.",
            );
        }
        draft.after = dry.value;
        draft.fields = fieldsOf(draft.previous, dry.value);
        if (draft.previous && draft.fields.length === 0) {
            return {
                output: `Nothing would change: ${spec.kind} ${targetId} is already like that. Tell the person.`,
            };
        }
        return this.keep(draft);
    }

    /** Confirm: re-checks everything, then saves once through the normal tool. */
    async confirm(
        ctx: OrganizationContext,
        draftId: string,
        body: AskAiConfirmBody,
    ): Promise<AskAiDraftResult> {
        const { row, kept, spec, tool } = await this.find(ctx, draftId);
        const org = ctx.organizationId;
        if (row.status !== "DRAFTED") {
            return refusedResult(kept.card, row.status, alreadyWords(row));
        }
        if (Date.now() >= row.expiresAt.getTime()) {
            await this.move(row, "DRAFTED", { status: "EXPIRED" });
            return refusedResult(
                kept.card,
                "EXPIRED",
                "This draft was for an earlier day, so nothing was saved. Ask again to draft it fresh.",
            );
        }
        const gate = await this.gate(ctx, tool);
        if (typeof gate === "string") {
            return refusedResult(kept.card, row.status, gate);
        }
        const asker = gate;
        const fill = filled(tool, kept.card, body);
        if ("missing" in fill) {
            // Still waiting on the person: not refused, nothing saved.
            return refusedResult(
                kept.card,
                row.status,
                `Fill in ${fill.missing.toLowerCase()} first.`,
                "missing",
            );
        }
        const input = { ...kept.input, ...fill.values };

        // Re-validated against the business as it is now.
        const targetId = spec.targetOf?.(input);
        if (targetId && kept.previous) {
            const now = await asBusiness(org, () =>
                spec.read(this.reader(asker), targetId),
            );
            if (!now || changedSince(kept.previous, now)) {
                return this.refuse(row, kept, "changed", CHANGED);
            }
        }
        const duplicate = await this.duplicateOf(spec, org, input);
        if (duplicate) {
            return this.refuse(
                row,
                kept,
                duplicate.reason,
                duplicate.words,
                duplicate.existingId,
            );
        }
        const dry = await this.dryRun(asker, tool, spec, input, targetId);
        if (!dry.ok) {
            const refusal = refusalOf(dry.error, spec) ?? {
                reason: "other" as const,
                words: wordsOf(dry.error, tool),
                existingId: null,
            };
            return this.refuse(
                row,
                kept,
                refusal.reason,
                refusal.words,
                refusal.existingId,
            );
        }
        // A field not shown is never saved: the save must be the card's.
        if (
            kept.card.missing.length === 0 &&
            (!dry.value ||
                JSON.stringify(fieldsOf(kept.previous, dry.value)) !==
                    JSON.stringify(kept.card.fields))
        ) {
            return this.refuse(row, kept, "changed", CHANGED);
        }

        // One Confirm wins; a second, or one racing it, finds it taken.
        const confirmedAt = new Date();
        if (
            !(await this.move(row, "DRAFTED", {
                status: "CONFIRMED",
                confirmedAt,
            }))
        ) {
            const now = await this.reload(row);
            return refusedResult(kept.card, now.status, alreadyWords(now));
        }
        const create = !spec.targetOf;
        const save = create ? { ...input, request_id: savedAs(row.id) } : input;
        const result = await this.registry.callInProcess(tool, save, asker);
        if ("isError" in result) {
            const words = plainWords(textOf(result).output);
            await this.move(row, "CONFIRMED", {
                status: "REFUSED",
                refusal: "other",
            });
            return refusedResult(
                {
                    ...kept.card,
                    refusal: { reason: "other", words, existingId: null },
                },
                "REFUSED",
                words,
            );
        }
        const data =
            "structuredContent" in result ? result.structuredContent : {};
        const madeId = create ? spec.madeOf?.(data) : targetId;
        const applied = madeId
            ? await asBusiness(org, () => spec.read(this.reader(asker), madeId))
            : null;
        const eventId =
            row.tool === "update_order_status" && madeId
                ? await this.lastStep(org, madeId)
                : undefined;
        const card: AskAiDraftCard = {
            ...kept.card,
            status: "confirmed",
            targetId: madeId ?? null,
            targetName: applied?.name ?? kept.card.targetName,
        };
        await asBusiness(org, () =>
            prisma.askAiDraft.update({
                where: { id: row.id },
                data: {
                    targetId: madeId ?? null,
                    targetUpdatedAt: applied?.updatedAt
                        ? new Date(applied.updatedAt)
                        : null,
                    ...sealed(row, {
                        ...kept,
                        input: save,
                        card,
                        applied,
                        ...(eventId ? { eventId } : {}),
                    }),
                },
            }),
        );
        return {
            outcome: create ? "added" : "done",
            card,
            words: create ? `Added ${card.targetName}.` : "Done.",
            canUndo: !create && !!spec.undo,
            open: create && madeId ? { kind: spec.kind, id: madeId } : null,
        };
    }

    /** Undo a confirmed edit through its inverse, while untouched and on the same day. */
    async undo(
        ctx: OrganizationContext,
        draftId: string,
    ): Promise<AskAiDraftResult> {
        const { row, kept, spec, tool } = await this.find(ctx, draftId);
        const org = ctx.organizationId;
        if (
            row.status !== "CONFIRMED" ||
            !spec.undo ||
            !row.targetId ||
            !kept.previous ||
            !kept.applied
        ) {
            return refusedResult(
                kept.card,
                row.status,
                row.status === "UNDONE"
                    ? "This was already undone."
                    : "There's nothing to undo here.",
            );
        }
        if (Date.now() >= row.expiresAt.getTime()) {
            return refusedResult(
                kept.card,
                row.status,
                "Undo works only on the day the change was made. Change it in the app instead.",
            );
        }
        const gate = await this.gate(ctx, tool);
        if (typeof gate === "string") {
            return refusedResult(kept.card, row.status, gate);
        }
        const asker = gate;
        const targetId = row.targetId;
        const now = await asBusiness(org, () =>
            spec.read(this.reader(asker), targetId),
        );
        if (!now || changedSince(kept.applied, now)) {
            return refusedResult(
                kept.card,
                row.status,
                "It has changed since, so Saroh won't undo it. Change it in the app instead.",
                "changed",
            );
        }
        const plan = spec.undo(targetId, kept.previous, kept.applied);
        if ("cannot" in plan) {
            return refusedResult(
                kept.card,
                row.status,
                `${plan.cannot}, so Saroh can't undo this here. Change it in the app instead.`,
            );
        }
        if (
            !(await this.move(row, "CONFIRMED", {
                status: "UNDONE",
                undoneAt: new Date(),
            }))
        ) {
            const again = await this.reload(row);
            return refusedResult(kept.card, again.status, alreadyWords(again));
        }
        let words = spec.undoNote ?? "Put back as it was.";
        try {
            if ("orderStage" in plan) {
                if (!kept.eventId) throw new ToolError("No step to undo.");
                const eventId = kept.eventId;
                const back = await runInOrgContext(org, async () => {
                    await assertWorkspaceWrite(org, "wind-down");
                    return this.kitchen.undoStage(asker.ctx, targetId, eventId);
                });
                await runInOrgContext(org, () =>
                    this.activity.record(asker, {
                        tool: "update_order_status",
                        target: `order:${targetId}`,
                        summary: `Undid the order's step back to ${back.stage}.`,
                    }),
                );
                words = back.told
                    ? "Put back. They've already been told."
                    : "Put back.";
            } else {
                const inverse = this.registry.get(plan.tool) ?? tool;
                const result = await this.registry.callInProcess(
                    inverse,
                    plan.input,
                    asker,
                );
                if ("isError" in result) {
                    throw new ToolError(textOf(result).output);
                }
            }
        } catch (error) {
            await this.move(row, "UNDONE", {
                status: "CONFIRMED",
                undoneAt: null,
            });
            return refusedResult(kept.card, "CONFIRMED", wordsOf(error, tool));
        }
        return {
            outcome: "undone",
            card: { ...kept.card, status: "undone" },
            words,
            canUndo: false,
            open: null,
        };
    }

    /** Draft again: the same change against the business as it is now. Free, capped per conversation. */
    async redraft(
        ctx: OrganizationContext,
        draftId: string,
    ): Promise<AskAiDraftResult> {
        const { row, kept, tool } = await this.find(ctx, draftId);
        const org = ctx.organizationId;
        if (row.status === "CONFIRMED" || row.status === "UNDONE") {
            return refusedResult(
                kept.card,
                row.status,
                "This was saved already. Ask again for a new change.",
            );
        }
        let cap: number;
        try {
            cap = await this.settings.get("askAi.redraftsPerConversation", org);
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) throw error;
            return refusedResult(
                kept.card,
                row.status,
                "Draft again isn't available yet. Ask again instead.",
            );
        }
        const used = await asBusiness(org, () =>
            prisma.askAiDraft.count({
                where: {
                    organizationId: org,
                    conversationId: row.conversationId,
                    redraftOfId: { not: null },
                },
            }),
        );
        if (used >= cap) {
            return refusedResult(
                kept.card,
                row.status,
                "That's all the fresh drafts this conversation gets. Ask again in a new message.",
            );
        }
        const gate = await this.gate(ctx, tool);
        if (typeof gate === "string") {
            return refusedResult(kept.card, row.status, gate);
        }
        const { request_id: _drafting, ...input } = kept.input;
        const run = await this.draft(
            gate,
            tool,
            input,
            { conversationId: row.conversationId, turnId: row.turnId },
            row.id,
        );
        if (!run.card) {
            return refusedResult(kept.card, row.status, plainWords(run.output));
        }
        await this.move(row, "DRAFTED", { status: "EXPIRED" });
        const card = run.card.data as AskAiDraftCard;
        return {
            outcome: card.refusal ? "refused" : "drafted",
            card,
            words:
                card.refusal?.words ?? "Drafted again with what's there now.",
            canUndo: false,
            open: null,
        };
    }

    /** Ask AI may act here now, and this person may make this change; else why not. */
    private async gate(
        ctx: OrganizationContext,
        tool: McpTool,
    ): Promise<McpCall | string> {
        assertMayUseAskAi(ctx);
        const org = ctx.organizationId;
        if (
            !(await askAiAvailable(this.settings, this.flags, this.store, org))
        ) {
            return "Ask AI is off for this business now, so nothing was changed.";
        }
        const asker = askAiCall(ctx);
        if (!this.registry.allows(tool, asker.ctx)) {
            return "Your role here no longer lets you make this change, so nothing was changed.";
        }
        if (
            tool.module &&
            (await this.registry.modulesOff(asker.ctx, tool.module)).has(
                tool.module,
            )
        ) {
            return "That part of Saroh is off for this business now, so nothing was changed.";
        }
        return asker;
    }

    /** The tool run as it would, rolled back; what it would leave, read as the card reads it. */
    private dryRun(
        asker: McpCall,
        tool: McpTool,
        spec: DraftSpec,
        input: Record<string, unknown>,
        targetId: string | undefined,
    ) {
        const reader = this.reader(asker);
        const draftInput = spec.targetOf
            ? input
            : { ...input, request_id: DRAFTING };
        return this.registry.dryRun(tool, draftInput, asker, (result) => {
            const id = targetId ?? spec.madeOf?.(result.data);
            return id ? spec.read(reader, id) : Promise.resolve(null);
        });
    }

    private async duplicateOf(
        spec: DraftSpec,
        org: string,
        input: Record<string, unknown>,
    ): Promise<Refusal | null> {
        const duplicate = spec.duplicate;
        const same = duplicate
            ? await asBusiness(org, () => duplicate(org, input))
            : null;
        return same
            ? {
                  reason: "duplicate",
                  words: `You already have ${JSON.stringify(same.name)}. Open the one you have instead.`,
                  existingId: same.id,
              }
            : null;
    }

    private reader(asker: McpCall): ReadContext {
        return {
            ctx: asker.ctx,
            read: async (name, input) => {
                const tool = this.registry.get(name);
                if (!tool) return null;
                try {
                    return (await tool.run(input, asker)).data;
                } catch {
                    return null;
                }
            },
        };
    }

    /** Keeps a new draft, sealed, and hands the turn its card. */
    private async keep(d: NewDraft): Promise<AiToolRun> {
        const org = d.asker.ctx.organizationId;
        const zone = await asBusiness(org, () => businessTimezone(prisma, org));
        const expiresAt = endOfBusinessDay(new Date(), zone);
        const targetId = d.spec.targetOf?.(d.input) ?? null;
        const card: AskAiDraftCard = {
            draftId: d.id,
            tool: d.tool.name,
            kind: d.spec.kind,
            action: d.spec.targetOf ? "edit" : "create",
            status: d.refusal ? "refused" : "drafted",
            targetId,
            targetName:
                d.previous?.name ??
                d.after?.name ??
                [d.input.name, d.input.email].find(
                    (v): v is string => typeof v === "string",
                ) ??
                "",
            fields: d.fields,
            missing: d.missing.map((field) => ({
                field,
                label: labelOf(field),
            })),
            refusal: d.refusal ?? null,
            note: d.spec.note ?? null,
            expiresAt: expiresAt.toISOString(),
        };
        const row = {
            id: d.id,
            organizationId: org,
            conversationId: d.turn.conversationId,
        };
        await asBusiness(org, () =>
            prisma.askAiDraft.create({
                data: {
                    ...row,
                    userId: d.asker.ctx.userId,
                    turnId: d.turn.turnId,
                    tool: d.tool.name,
                    status: d.refusal ? "REFUSED" : "DRAFTED",
                    refusal: d.refusal?.reason ?? null,
                    targetId,
                    targetUpdatedAt: d.previous?.updatedAt
                        ? new Date(d.previous.updatedAt)
                        : null,
                    ...sealed(row, {
                        input: d.input,
                        previous: d.previous,
                        card,
                    }),
                    redraftOfId: d.redraftOfId ?? null,
                    expiresAt,
                },
            }),
        );
        return {
            output: d.refusal
                ? `Saroh won't make this change: ${d.refusal.words} The person sees why on a card.`
                : "Drafted. The person sees a card and confirms it; nothing is saved until they do.",
            card: { kind: "draft", data: card },
        };
    }

    /** The asker's own draft in the business they have open; any other is a 404. */
    private async find(ctx: OrganizationContext, draftId: string) {
        const row = await asBusiness(ctx.organizationId, () =>
            prisma.askAiDraft.findFirst({
                where: {
                    id: draftId,
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                },
            }),
        );
        const spec = row && DRAFT_SPECS[row.tool];
        const tool = row && this.registry.get(row.tool);
        if (!row || !spec || !tool) {
            throw new NotFoundException("That draft isn't here");
        }
        const kept = openDraftBody<DraftBody>(
            {
                ciphertext: row.bodyCiphertext,
                iv: row.bodyIv,
                authTag: row.bodyAuthTag,
            },
            {
                organizationId: row.organizationId,
                conversationId: row.conversationId,
                rowId: row.id,
            },
        );
        return { row, kept, spec, tool };
    }

    private async reload(row: AskAiDraft): Promise<AskAiDraft> {
        return asBusiness(row.organizationId, () =>
            prisma.askAiDraft.findUniqueOrThrow({ where: { id: row.id } }),
        );
    }

    /** Moves a draft on only from `from`: true when this call moved it. */
    private async move(
        row: AskAiDraft,
        from: AskAiDraftStatus,
        data: {
            status: AskAiDraftStatus;
            refusal?: string;
            confirmedAt?: Date;
            undoneAt?: Date | null;
        },
    ): Promise<boolean> {
        const done = await asBusiness(row.organizationId, () =>
            prisma.askAiDraft.updateMany({
                where: {
                    id: row.id,
                    organizationId: row.organizationId,
                    status: from,
                },
                data,
            }),
        );
        return done.count === 1;
    }

    /** Refuses a drafted draft for good (Draft again can try once more). */
    private async refuse(
        row: AskAiDraft,
        kept: DraftBody,
        reason: AskAiDraftRefusal,
        words: string,
        existingId: string | null = null,
    ): Promise<AskAiDraftResult> {
        await this.move(row, "DRAFTED", { status: "REFUSED", refusal: reason });
        return refusedResult(
            { ...kept.card, refusal: { reason, words, existingId } },
            "REFUSED",
            words,
            reason,
        );
    }

    /** The order's last kitchen step: what an Undo of a confirmed step names. */
    private async lastStep(
        org: string,
        orderId: string,
    ): Promise<string | undefined> {
        const event = await asBusiness(org, () =>
            prisma.orderEvent.findFirst({
                where: { orderId, organizationId: org, kind: "STAGE" },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: { id: true },
            }),
        );
        return event?.id;
    }
}

interface Refusal {
    reason: AskAiDraftRefusal;
    words: string;
    existingId: string | null;
}

interface NewDraft {
    id: string;
    asker: McpCall;
    tool: McpTool;
    spec: DraftSpec;
    turn: AiTurnRef;
    redraftOfId?: string;
    input: Record<string, unknown>;
    previous: TargetState | null;
    after?: TargetState;
    fields: AskAiDraftField[];
    missing: string[];
    refusal?: Refusal;
}

const CHANGED =
    "It has changed since this was drafted, so nothing was saved. Draft it again to see it as it is now.";

function sealed(
    row: { id: string; organizationId: string; conversationId: string },
    body: DraftBody,
) {
    const s = sealDraftBody(body, {
        organizationId: row.organizationId,
        conversationId: row.conversationId,
        rowId: row.id,
    });
    return {
        bodyCiphertext: s.ciphertext,
        bodyIv: s.iv,
        bodyAuthTag: s.authTag,
    };
}

/** The end of `now`'s day in the business's zone: a draft's last moment. */
export function endOfBusinessDay(now: Date, zone: string): Date {
    const day = DateTime.fromJSDate(now, { zone });
    return (day.isValid ? day : DateTime.fromJSDate(now, { zone: "UTC" }))
        .endOf("day")
        .toJSDate();
}

const isEmpty = (v: unknown) =>
    v === null ||
    v === undefined ||
    v === "" ||
    (Array.isArray(v) && v.length === 0);

/**
 * Every field that will change, old → new: for an edit those that differ,
 * for a create every one with a value. Nothing else is ever saved.
 */
export function fieldsOf(
    before: TargetState | null,
    after: TargetState,
): AskAiDraftField[] {
    return Object.entries(after.fields).flatMap(([field, value]) => {
        const old = before ? (before.fields[field] ?? null) : null;
        const same = before
            ? JSON.stringify(old) === JSON.stringify(value ?? null)
            : isEmpty(value);
        return same
            ? []
            : [
                  {
                      field,
                      label: labelOf(field, after.currency),
                      old,
                      new: value ?? null,
                  },
              ];
    });
}

/** What the model gave for a create it left fields out of, as the card shows it. */
function givenFields(given: Record<string, unknown>): AskAiDraftField[] {
    return Object.entries(given)
        .filter(([k, v]) => k !== "request_id" && !isEmpty(v))
        .map(([field, value]) => ({
            field,
            label: labelOf(field),
            old: null,
            new: value,
        }));
}

/** Whether a record moved since it was read: its row, or what the card shows. */
export function changedSince(then: TargetState, now: TargetState): boolean {
    return (
        then.updatedAt !== now.updatedAt ||
        JSON.stringify(then.fields) !== JSON.stringify(now.fields) ||
        JSON.stringify(then.restore ?? null) !==
            JSON.stringify(now.restore ?? null)
    );
}

/**
 * The fields a person can fill on the card: the input misses only them
 * (each required, top-level and one the tool lets a person type). Any
 * other problem is the model's to fix: none.
 */
export function missingOf(
    tool: McpTool,
    given: Record<string, unknown>,
    askable: readonly string[] = [],
): string[] {
    const parsed = tool.contract.input.safeParse(given);
    if (parsed.success) return [];
    const keys = parsed.error.issues.map((i) =>
        i.path.length === 1 &&
        typeof i.path[0] === "string" &&
        askable.includes(i.path[0]) &&
        given[i.path[0]] === undefined
            ? i.path[0]
            : null,
    );
    return keys.every((k) => k !== null) ? [...new Set(keys)] : [];
}

/**
 * The card's missing fields as the person filled them, each checked by the
 * tool's own contract; or the first one still missing. Anything else in
 * the body is ignored.
 */
export function filled(
    tool: McpTool,
    card: AskAiDraftCard,
    body: AskAiConfirmBody,
): { values: Record<string, unknown> } | { missing: string } {
    const values: Record<string, unknown> = {};
    for (const { field, label } of card.missing) {
        const schema = tool.contract.input.shape[field] as
            | { safeParse(v: unknown): { success: boolean; data?: unknown } }
            | undefined;
        const value = body.fields?.[field];
        const parsed =
            value === undefined ? undefined : schema?.safeParse(value);
        if (!parsed?.success) return { missing: label };
        values[field] = parsed.data;
    }
    return { values };
}

/** A refusal the card shows (plan limit, a duplicate), or null for the model's own mistakes. */
export function refusalOf(error: unknown, spec: DraftSpec): Refusal | null {
    if (!(error instanceof HttpException)) return null;
    const body = error.getResponse() as { details?: { code?: string } };
    const code = typeof body === "object" ? body.details?.code : undefined;
    if (code === PLAN_LIMIT_REACHED || code === MODULE_LOCKED) {
        return {
            reason: "plan-limit",
            words: `${messageOf(error)} Nothing was saved.`,
            existingId: null,
        };
    }
    if (error.getStatus() === 409 && spec.duplicate) {
        return {
            reason: "duplicate",
            words: `${messageOf(error)} Open the one you have instead.`,
            existingId: null,
        };
    }
    return null;
}

function wordsOf(error: unknown, tool: McpTool): string {
    return plainWords(textOf(toolError(error, tool.name)).output);
}

/** A tool's refusal for a person: its sentence without the model's "Next:". */
function plainWords(text: string): string {
    return text.split(" Next: ")[0];
}

function alreadyWords(row: AskAiDraft): string {
    switch (row.status) {
        case "CONFIRMED":
            return "This was already saved.";
        case "UNDONE":
            return "This was saved and then undone.";
        case "EXPIRED":
            return "This draft was replaced or ran out. Ask again to draft it fresh.";
        case "REFUSED":
            return "Saroh won't save this one. Draft it again to see it as it is now.";
        default:
            return "This draft is waiting for you to confirm it.";
    }
}

function refusedResult(
    card: AskAiDraftCard,
    status: AskAiDraftStatus,
    words: string,
    reason: AskAiDraftRefusal = card.refusal?.reason ?? "other",
): AskAiDraftResult {
    return {
        outcome: "refused",
        card: {
            ...card,
            status: STATUS[status],
            refusal: card.refusal ?? { reason, words, existingId: null },
        },
        words,
        canUndo: false,
        open: null,
    };
}
