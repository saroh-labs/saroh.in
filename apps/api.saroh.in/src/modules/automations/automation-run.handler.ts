import { Injectable, Logger } from "@nestjs/common";
import type { AutomationRule, Job, Lead } from "@saroh/database";
import { prisma } from "@saroh/database";

import { CommunicationsService } from "../communications/communications.service";
import {
    parseCreateTaskConfig,
    parseSendMessageConfig,
} from "./automation-config";

/** The `type` this handler is registered under (matches the producers). */
export const AUTOMATION_RUN_TYPE = "automation.run";

/**
 * Payload the lead-creation producers (public enquiry S3-002, hand-create
 * S3-005) enqueue inside the lead's transaction. Only `leadId` is load-bearing;
 * the handler re-derives the org + contact from the Lead so it never trusts a
 * stale id.
 */
export interface AutomationRunPayload {
    leadId: string;
}

/** A day in milliseconds — for turning `dueInDays` into a concrete due date. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consumer for the `automation.run` job (S6-003): turn a committed NEW Lead into
 * its org's enabled automation-rule executions.
 *
 * Delivery is AT-LEAST-ONCE (the job worker may run this more than once) and an
 * org may have several rules, so the AutomationRun ledger provides the
 * exactly-once guarantee PER (rule, lead):
 *
 *  1. For each enabled `lead.created` rule, the handler first CLAIMS the work by
 *     creating an AutomationRun, guarded by `@@unique([ruleId, leadId])`. A retry
 *     (or a second rule sharing the lead) re-attempts the create, hits P2002, and
 *     is skipped — so each rule fires EXACTLY ONCE per lead no matter how many
 *     times the job runs.
 *  2. The action runs AFTER the claim. Because the claim already committed, a
 *     failing action is recorded as a FAILED run and is NOT retried (at-most-once
 *     side effects: better to drop a send/task than to double-fire it). The error
 *     is captured on the run for audit; the job still completes.
 *
 * The action itself reuses the SAME tenant-safe paths as a user would:
 *  - `send.message` → {@link CommunicationsService.sendMessageAsSystem}, which
 *    runs the identical recipient resolution, consent gate, connected-provider
 *    requirement, and atomic outbox — so an automated message is as safe as a
 *    hand-sent one (a REVOKED consent SUPPRESSES it).
 *  - `create.task` → a system-authored TASK Activity on the lead's timeline.
 */
@Injectable()
export class AutomationRunHandler {
    private readonly logger = new Logger(AutomationRunHandler.name);

    constructor(private readonly communications: CommunicationsService) {}

    /** Bound {@link JobHandler} to register with the {@link JobHandlerRegistry}. */
    readonly handle = async (job: Job): Promise<void> => {
        const { leadId } = job.payload as unknown as AutomationRunPayload;

        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        // The lead vanished (deleted before the job ran). Nothing to automate —
        // complete as a no-op rather than retrying a job that can never succeed.
        if (!lead) {
            this.logger.warn(
                `automation.run: lead ${leadId} not found; completing as no-op.`,
            );
            return;
        }

        const rules = await prisma.automationRule.findMany({
            where: {
                organizationId: lead.organizationId,
                trigger: "lead.created",
                enabled: true,
            },
            orderBy: { createdAt: "asc" },
        });

        for (const rule of rules) {
            await this.runRule(rule, lead);
        }
    };

    /**
     * Claim (once per rule+lead) and execute a single rule. A P2002 on the claim
     * means this rule already ran for this lead — skip. A failing action is
     * recorded as FAILED (not rethrown), so one rule's failure never wedges the
     * job or blocks the other rules.
     */
    private async runRule(rule: AutomationRule, lead: Lead): Promise<void> {
        // (1) CLAIM — the exactly-once guard. If it throws P2002 the rule has
        // already fired for this lead; skip silently.
        let runId: string;
        try {
            const run = await prisma.automationRun.create({
                data: {
                    organizationId: lead.organizationId,
                    ruleId: rule.id,
                    leadId: lead.id,
                    status: "DONE",
                },
            });
            runId = run.id;
        } catch (err) {
            if ((err as { code?: string }).code === "P2002") {
                this.logger.log(
                    `automation.run: rule ${rule.id} already fired for lead ${lead.id}; skipping.`,
                );
                return;
            }
            throw err;
        }

        // (2) EXECUTE — after the committed claim. A failure is captured on the
        // run and swallowed (at-most-once side effects); never rethrown.
        try {
            await this.execute(rule, lead);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(
                `automation.run: rule ${rule.id} action "${rule.action}" failed for lead ${lead.id}: ${message}`,
            );
            await prisma.automationRun.update({
                where: { id: runId },
                data: { status: "FAILED", error: message.slice(0, 500) },
            });
        }
    }

    /** Dispatch a rule's action against the triggering lead. */
    private async execute(rule: AutomationRule, lead: Lead): Promise<void> {
        const config = rule.config as unknown as Record<string, unknown>;

        switch (rule.action) {
            case "send.message": {
                const cfg = parseSendMessageConfig(config);
                await this.communications.sendMessageAsSystem(
                    lead.organizationId,
                    {
                        channel: cfg.channel,
                        contactId: lead.contactId,
                        leadId: lead.id,
                        subject: cfg.subject,
                        body: cfg.body,
                    },
                );
                return;
            }
            case "create.task": {
                const cfg = parseCreateTaskConfig(config);
                await prisma.activity.create({
                    data: {
                        organizationId: lead.organizationId,
                        leadId: lead.id,
                        type: "TASK",
                        body: cfg.body,
                        dueAt: new Date(Date.now() + cfg.dueInDays * DAY_MS),
                        // System-authored (no request actor).
                        actorUserId: null,
                    },
                });
                return;
            }
            default:
                // An unknown action on a stored rule (e.g. a rule written by a
                // newer version). Record it as a failure rather than throwing an
                // unhandled error, so the run is auditable.
                throw new Error(
                    `Unsupported automation action "${rule.action}"`,
                );
        }
    }
}
