import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * The CLOSED set of automation triggers (S6-003). Deliberately tiny: today the
 * only supported trigger is a NEW lead entering the CRM (from a public enquiry
 * OR a hand-created lead). Adding a trigger here is a schema-free change, but the
 * producer that enqueues the `automation.run` job must also be wired for it.
 */
export const AUTOMATION_TRIGGERS = ["lead.created"] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/**
 * The CLOSED set of automation actions (S6-003):
 *  - `send.message` — queue a consent-gated message to the new lead's contact
 *    over the org's connected provider (config: channel, optional subject, body).
 *  - `create.task`  — log a follow-up TASK on the new lead's timeline
 *    (config: body, optional dueInDays).
 * The action's `config` shape is validated by the service, not here, because it
 * is polymorphic on the action.
 */
export const AUTOMATION_ACTIONS = ["send.message", "create.task"] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

/**
 * Create an automation rule (S6-003). `trigger` and `action` are constrained to
 * the closed sets above; `config` is an arbitrary object here and is validated
 * against the chosen `action` by the service. Rules default to enabled.
 */
export class CreateAutomationRuleDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    @Transform(trim)
    @IsIn(AUTOMATION_TRIGGERS, {
        message: `trigger must be one of: ${AUTOMATION_TRIGGERS.join(", ")}`,
    })
    trigger!: string;

    @Transform(trim)
    @IsIn(AUTOMATION_ACTIONS, {
        message: `action must be one of: ${AUTOMATION_ACTIONS.join(", ")}`,
    })
    action!: string;

    @IsObject()
    config!: Record<string, unknown>;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}

/**
 * Patch an automation rule (S6-003). Every field is optional; when `action` is
 * changed, `config` must be supplied so the service can re-validate the pair
 * (a config valid for the old action may be nonsense for the new one).
 */
export class UpdateAutomationRuleDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsIn(AUTOMATION_ACTIONS, {
        message: `action must be one of: ${AUTOMATION_ACTIONS.join(", ")}`,
    })
    action?: string;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}
