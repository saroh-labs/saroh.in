import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { AutomationRule } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { validateActionConfig } from "./automation-config";
import type { AutomationAction } from "./dto";
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from "./dto";

/**
 * Org automation rules (S6-003).
 *
 * A rule is a constrained trigger→action binding — "when a NEW lead arrives, do
 * X" — where X is one of a tiny closed set (send a consent-gated message, or
 * create a follow-up task). Rules are managed by owners/admins only
 * (`automation:manage`, not in the read-only floor). Every operation is
 * tenant-scoped by `ctx.organizationId` (proven by the guards, never
 * client-supplied); a cross-tenant or missing id surfaces as a 404.
 *
 * This service is the WRITE/READ surface only. The firing side — turning a
 * committed lead into rule executions, exactly once per (rule, lead) — lives in
 * the `automation.run` job handler (idempotent by the AutomationRun ledger).
 */
@Injectable()
export class AutomationsService {
    /** The org's automation rules, newest first. `automation:manage`. */
    async list(ctx: OrganizationContext): Promise<AutomationRule[]> {
        authorize(ctx, "automation:manage");
        return prisma.automationRule.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
    }

    /** One rule. `automation:manage`. Cross-tenant or missing → 404. */
    async get(
        ctx: OrganizationContext,
        ruleId: string,
    ): Promise<AutomationRule> {
        authorize(ctx, "automation:manage");
        return this.requireOwned(ctx, ruleId);
    }

    /**
     * Create a rule. `automation:manage`. The DTO has already constrained
     * `trigger` and `action` to their closed sets; here the action-specific
     * `config` is validated (400 on a config the handler could never execute),
     * then the rule is stored stamped with the org + creating user.
     */
    async create(
        ctx: OrganizationContext,
        dto: CreateAutomationRuleDto,
    ): Promise<AutomationRule> {
        authorize(ctx, "automation:manage");

        const action = dto.action as AutomationAction;
        validateActionConfig(action, dto.config);

        return prisma.automationRule.create({
            data: {
                organizationId: ctx.organizationId,
                name: dto.name,
                trigger: dto.trigger,
                action,
                config: dto.config as Prisma.InputJsonValue,
                enabled: dto.enabled ?? true,
                createdByUserId: ctx.userId,
            },
        });
    }

    /**
     * Patch a rule's name / action / config / enabled. `automation:manage`.
     * Cross-tenant or missing → 404. Changing `action` requires a matching
     * `config` (else 400) so the pair is re-validated together; changing only
     * `config` is validated against the EXISTING action. Toggling `enabled` is
     * how an operator disables a rule without deleting it (the handler skips
     * disabled rules).
     */
    async update(
        ctx: OrganizationContext,
        ruleId: string,
        dto: UpdateAutomationRuleDto,
    ): Promise<AutomationRule> {
        authorize(ctx, "automation:manage");

        const existing = await this.requireOwned(ctx, ruleId);

        // Resolve the effective (action, config) pair and re-validate whenever
        // either side changes — a config valid for the old action may be invalid
        // for a new one, and a new config must fit the current action.
        const nextAction = (dto.action ?? existing.action) as AutomationAction;
        if (dto.action !== undefined || dto.config !== undefined) {
            const nextConfig =
                dto.config ??
                (existing.config as unknown as Record<string, unknown>);
            if (dto.action !== undefined && dto.config === undefined) {
                throw new BadRequestException(
                    "Changing action requires a matching config",
                );
            }
            validateActionConfig(nextAction, nextConfig);
        }

        return prisma.automationRule.update({
            where: { id: ruleId },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.action !== undefined ? { action: dto.action } : {}),
                ...(dto.config !== undefined
                    ? { config: dto.config as Prisma.InputJsonValue }
                    : {}),
                ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
            },
        });
    }

    /** Delete a rule. `automation:manage`. Cross-tenant or missing → 404. */
    async remove(
        ctx: OrganizationContext,
        ruleId: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "automation:manage");
        await this.requireOwned(ctx, ruleId);
        await prisma.automationRule.delete({ where: { id: ruleId } });
        return { id: ruleId };
    }

    /**
     * Load a rule and assert it belongs to `ctx.organizationId`. 404 for a
     * missing OR cross-tenant id (never a 403 — no cross-org probing).
     */
    private async requireOwned(
        ctx: OrganizationContext,
        ruleId: string,
    ): Promise<AutomationRule> {
        const rule = await prisma.automationRule.findUnique({
            where: { id: ruleId },
        });
        if (rule?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Automation rule not found");
        }
        return rule;
    }
}
