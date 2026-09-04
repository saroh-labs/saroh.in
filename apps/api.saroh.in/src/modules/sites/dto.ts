import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDefined,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
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
 * name-derived slug, and `subdomain` optionally reserves an `<x>.saroh.app`
 * label (format-checked here; claim/verification is S2-007).
 */
/** Trim a string, mapping an emptied one to null so "" never reaches the DB. */
const trimOrNull = ({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

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

    // Visibility, not content: a hidden section stays in the draft, keeps its
    // place, and is left out of the published snapshot. ABSENT means visible,
    // so an older client that never sends the field cannot hide anything by
    // omission.
    @IsOptional()
    @IsBoolean({ message: "hidden must be a boolean" })
    hidden?: boolean;

    /*
     * The section's stable identity across saves. The editor sends back the key
     * it was given for an existing section and omits it for a new one, which
     * the server then mints.
     *
     * This is what a reviewer's note is pinned to, so sending the WRONG key
     * moves someone's comment onto a different section. It is not a security
     * boundary — everyone who can write sections can already rewrite their
     * content — but it is why the key is a plain opaque string with no meaning
     * to guess at, and why keys are unique per page version.
     */
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    key?: string;
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

// A page path is a single root-relative segment path: "/", "/about",
// "/trade-accounts". Lowercase, hyphen-separated, no trailing slash (except the
// root itself), no query or fragment. Pinned here so a merchant cannot author a
// path the public renderer would never match.
const PAGE_PATH_RE = /^\/$|^(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const PAGE_PATH_MSG =
    "Path must start with / and use lowercase letters, numbers and hyphens (for example /about or /trade-accounts)";

/**
 * Add a page to a site.
 *
 * `isHome` is deliberately ABSENT: a site's home page is decided when the site
 * is created from its template, and a second page claiming to be home would
 * make "which page do visitors land on" ambiguous with no way to resolve it.
 * Moving the home page is a separate operation nobody has asked for yet.
 */
export class CreatePageDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(200, { message: "Title must be at most 200 characters" })
    title!: string;

    @Transform(trim)
    @IsString()
    @Matches(PAGE_PATH_RE, { message: PAGE_PATH_MSG })
    @MaxLength(200, { message: "Path must be at most 200 characters" })
    path!: string;
}

/**
 * Rename a page, move it, or both.
 *
 * Both fields are optional and ABSENT means "leave this alone" — a rename that
 * omitted the path must not move the page to an empty one. Neither is
 * nullable: a page with no title or no path is not a state worth having.
 */
export class UpdatePageDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(200, { message: "Title must be at most 200 characters" })
    title?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(PAGE_PATH_RE, { message: PAGE_PATH_MSG })
    @MaxLength(200, { message: "Path must be at most 200 characters" })
    path?: string;

    /**
     * Absent means LEAVE ALONE, never "make visible".
     *
     * The same rule `DraftSectionInputDto.hidden` follows, for the same reason:
     * a client that predates this field must not be able to put a deliberately
     * parked page back on a live site simply by not mentioning it.
     */
    @IsOptional()
    @IsBoolean({ message: "hidden must be a boolean" })
    hidden?: boolean;
}

/**
 * A reviewer's note, pinned to a section (#193).
 *
 * `sectionKey` rather than a section id: ids are regenerated on every save, so
 * a note keyed to one would detach the moment the page was edited.
 */
export class CreateCommentDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A note needs something in it" })
    @MaxLength(2000, { message: "Notes are limited to 2000 characters" })
    body!: string;

    @IsString()
    @MinLength(1, { message: "pageId is required" })
    pageId!: string;

    @IsString()
    @MinLength(1, { message: "sectionKey is required" })
    @MaxLength(64)
    sectionKey!: string;
}

/**
 * A reviewer's verdict on the site.
 *
 * Two outcomes and no more. The spec's "approved with notes" is APPROVED plus
 * an open-note count, not a third state — a workflow with states grows rounds,
 * and this is meant to stay notes and one approval.
 */
export class CreateApprovalDto {
    @IsIn(["APPROVED", "CHANGES_REQUESTED"], {
        message: "outcome must be APPROVED or CHANGES_REQUESTED",
    })
    outcome!: "APPROVED" | "CHANGES_REQUESTED";
}

/**
 * Search and social settings for a site (#188).
 *
 * Every field is optional and nullable, and the two are different requests:
 * ABSENT means "leave this alone", NULL means "clear it". A settings form that
 * only sends what changed must not silently wipe the fields it omitted, and a
 * merchant clearing a share image must be able to actually clear it.
 */
export class UpdateSiteSettingsDto {
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(200, { message: "Title must be at most 200 characters" })
    seoTitle?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(500, { message: "Description must be at most 500 characters" })
    seoDescription?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(2048)
    // Only a web address. Every sink today is an attribute (<img src>,
    // og:image), where a javascript: or data: value is inert — but the field
    // is merchant-controlled and will be read by more code over time, and a
    // scheme check here is cheaper than remembering one at each future sink.
    @Matches(/^https?:\/\/\S+$/i, {
        message:
            "The share image must be a web address starting with http:// or https://",
    })
    socialImageUrl?: string | null;

    // Facts about the picture, measured by the app when it was chosen (#220).
    // Null clears them along with the picture; a pasted address the browser
    // could not measure simply leaves them unset.
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt()
    @Min(1)
    socialImageWidth?: number | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt()
    @Min(1)
    socialImageHeight?: number | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt()
    @Min(1)
    socialImageBytes?: number | null;
}

/** Mint a preview link (#198). The choices are the ones the design offers. */
export class CreatePreviewLinkDto {
    @IsIn([1, 7, 30], { message: "A preview link lasts 1, 7 or 30 days" })
    expiresInDays!: 1 | 7 | 30;
}
