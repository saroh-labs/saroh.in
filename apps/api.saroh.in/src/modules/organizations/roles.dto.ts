import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { ORG_ACTIONS } from "./organization-actions";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * The rings a role may wear on Team. Named, never a hex: the palette belongs
 * to the token layer, and a stored colour would outlive the next palette.
 */
export const RING_TONES = [
    "ink",
    "clay",
    "saffron",
    "slate",
    "moss",
    "plum",
    "sky",
    "rose",
] as const;

/**
 * Invent a role.
 *
 * `actions` is validated against the closed set here so a stale client gets a
 * clear 400 naming the bad value — the service ALSO drops anything that is not
 * grantable, which is the line that actually protects the gate. Two checks,
 * two jobs: this one talks to the person, that one talks to the policy.
 */
export class CreateRoleDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A role needs a name" })
    @MaxLength(40, { message: "Keep the name under 40 characters" })
    label!: string;

    @IsArray()
    @ArrayMaxSize(ORG_ACTIONS.length)
    @IsIn(ORG_ACTIONS, { each: true, message: "Unknown permission" })
    actions!: string[];

    @IsOptional()
    @IsIn(RING_TONES, { message: "Unknown ring colour" })
    ringTone?: string;
}

/** Change an invented role. Every field optional; built-ins are refused. */
export class UpdateRoleDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A role needs a name" })
    @MaxLength(40, { message: "Keep the name under 40 characters" })
    label?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(ORG_ACTIONS.length)
    @IsIn(ORG_ACTIONS, { each: true, message: "Unknown permission" })
    actions?: string[];

    @IsOptional()
    @IsIn(RING_TONES, { message: "Unknown ring colour" })
    ringTone?: string;
}
