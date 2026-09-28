import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { ORG_ACTIONS } from "./organization-actions";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Invite someone to the organization (#276).
 *
 * `role` is any role this business HAS — one of the four built-ins or one it
 * invented — so it cannot be checked against a fixed list here. The service
 * checks it against the business's own roles and refuses a key it does not
 * have: a typo must be a 400, never a membership that silently resolves to
 * the read-only floor instead of the narrow role that was meant.
 */
export class InviteMemberDto {
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid email address is required" })
    @MaxLength(320)
    email!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Choose a role" })
    @MaxLength(64)
    role!: string;

    /**
     * Sites a REVIEWER invite grants. Required for REVIEWER and rejected for
     * every other role — the service decides that, because "which sites" is a
     * question only this role asks.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    siteIds?: string[];
}

/**
 * Change a member's role, and for a REVIEWER which sites they may review.
 *
 * `siteIds` replaces the grants outright rather than adding to them: an edit
 * screen shows the current set, and a merchant unticking a site means that
 * site is no longer theirs to see.
 */
export class UpdateMemberRoleDto {
    /** A built-in or invented role key; checked against the business. */
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Choose a role" })
    @MaxLength(64)
    role!: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    siteIds?: string[];
}

/**
 * A person's extra permissions, as the whole list they should hold (F17).
 *
 * Replaces the list outright, like a reviewer's sites: the drawer shows the
 * current set, and switching one off means it is taken away. Each is checked
 * against the closed set here, so a stale client gets a clear 400; the
 * service decides everything else — what may be given at all, what the
 * person saving holds, and whose permissions they may change.
 */
export class SetExtraActionsDto {
    @IsArray()
    @ArrayMaxSize(ORG_ACTIONS.length)
    @IsIn(ORG_ACTIONS, { each: true, message: "Unknown permission" })
    actions!: string[];
}
