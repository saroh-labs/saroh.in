import { Transform } from "class-transformer";
import {
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import type { ModuleKey } from "./module-registry";
import type {
    DeactivationBlocker,
    DeactivationImpactItem,
} from "./readiness/module-readiness.port";

/**
 * `GET /organizations/:id/modules/:moduleKey/impact` (F13): what turning the
 * module off touches, read now. `goesWith` are the modules that are on and
 * need it, in the order they go off; `items` are the module's lines and
 * theirs; `blockers` refuse the change and are never overridable.
 */
export interface ModuleImpactView {
    moduleKey: ModuleKey;
    enabled: boolean;
    goesWith: ModuleKey[];
    items: DeactivationImpactItem[];
    blockers: DeactivationBlocker[];
}

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Persisted lifecycle targets a mutation may request. */
export const MODULE_STATUS_VALUES = [
    "ENABLED",
    "DISABLED",
    "ARCHIVED",
] as const;
export type ModuleStatusValue = (typeof MODULE_STATUS_VALUES)[number];

/**
 * Body for `PUT /organizations/:id/modules/:moduleKey`.
 *
 * `reason` is recorded for destructive/blocking changes; `acknowledgedBlockerCodes`
 * lets a second request acknowledge *warnings* — hard deactivation blockers can
 * never be overridden (they return 409 MODULE_DEACTIVATION_BLOCKED).
 */
export class ModuleMutationDto {
    @IsString()
    @IsIn(MODULE_STATUS_VALUES, { message: "Unknown module status" })
    status!: ModuleStatusValue;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    reason?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    acknowledgedBlockerCodes?: string[];
}
