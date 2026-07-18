import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsDefined,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
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

/**
 * One section in a draft-sections replace request. `content` is deliberately
 * typed loosely here (validation of its *shape* is the section contract's job,
 * not class-validator's): the service runs every section through
 * `parseSectionContent(type, contractVersion, content)` and rejects the whole
 * request — naming the offending index and reason — if any fails. We only
 * enforce that `type`/`contractVersion` are present and well-typed so the
 * contract lookup can't be fed junk.
 */
export class DraftSectionInputDto {
    @IsString()
    @MinLength(1, { message: "type is required" })
    @MaxLength(120)
    type!: string;

    @IsInt({ message: "contractVersion must be an integer" })
    @Min(1, { message: "contractVersion must be at least 1" })
    contractVersion!: number;

    // Any JSON value the contract will validate; must be present (an empty
    // object is fine — the contract decides whether that's valid content).
    @IsDefined({ message: "content is required" })
    content!: unknown;
}

/**
 * Replace a draft PageVersion's sections with an ordered list (S2-005). The
 * array order IS the section order: the service persists `order = index`. A
 * whole-list replace keeps the write atomic and the resulting order gap-free.
 * An empty array is allowed and clears the draft's sections.
 */
export class UpdateDraftSectionsDto {
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => DraftSectionInputDto)
    sections!: DraftSectionInputDto[];
}
