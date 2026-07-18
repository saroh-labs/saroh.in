import { Transform } from "class-transformer";
import {
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

// A platform subdomain is a single DNS label: 1–63 chars, lowercase
// alphanumeric and hyphens, never starting/ending with a hyphen. Full
// verification/reservation is deferred to S2-007; we only pin the shape here.
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUBDOMAIN_MSG =
    "Subdomain must be a lowercase DNS label (letters, numbers, hyphens; not starting or ending with a hyphen)";

/**
 * Request to create a draft {@link Site} from a template (S2-003).
 *
 * `name` is the only hard requirement. `templateId`/`templateVersion` select
 * the source template (defaulting to the latest starter). `slug` overrides the
 * name-derived slug, and `subdomain` optionally reserves an `<x>.saroh.in`
 * label (format-checked here; claim/verification is S2-007).
 */
export class CreateSiteFromTemplateDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "name is required" })
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    slug?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(63)
    @Matches(SUBDOMAIN_RE, { message: SUBDOMAIN_MSG })
    subdomain?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    templateId?: string;

    @IsOptional()
    @IsInt({ message: "templateVersion must be an integer" })
    @Min(1, { message: "templateVersion must be at least 1" })
    templateVersion?: number;
}
