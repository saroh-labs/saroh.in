import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import { PROJECT_ROLES } from "./project-role";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";

export class CreateProjectDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(150)
    name!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(150)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug?: string;
}

export class CreateTeamDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(150)
    name!: string;
}

export class TeamMemberDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "userId is required" })
    userId!: string;
}

export class GrantUserAccessDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "userId is required" })
    userId!: string;

    @IsString()
    @IsIn(PROJECT_ROLES, { message: "Unknown project role" })
    role!: (typeof PROJECT_ROLES)[number];
}

export class GrantTeamAccessDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "teamId is required" })
    teamId!: string;

    @IsString()
    @IsIn(PROJECT_ROLES, { message: "Unknown project role" })
    role!: (typeof PROJECT_ROLES)[number];
}
