import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { AdminRole } from "./admin-permissions";
import { OperatorReasonDto } from "./dto";
import type { StaffJob } from "./staff-profile";
import { STAFF_JOBS } from "./staff-profile";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * Invite someone to Saroh's team (admin console U24, R32): their name, the
 * work email the link goes to, what they work as, their console roles and
 * whether they are paid by commission.
 */
export class InviteStaffDto extends OperatorReasonDto {
    @Transform(trim)
    @IsEmail()
    @MaxLength(320)
    email!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give their name" })
    @MaxLength(120)
    name!: string;

    @IsIn(STAFF_JOBS)
    worksAs!: StaffJob;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(Object.values(AdminRole).length)
    @IsString({ each: true })
    roles!: string[];

    @IsOptional()
    @IsBoolean()
    onCommission?: boolean;
}

/**
 * The token from an invite's link, in the body so it never sits in a path
 * or a query string an access log keeps.
 */
export class StaffInviteTokenDto {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    token!: string;
}
