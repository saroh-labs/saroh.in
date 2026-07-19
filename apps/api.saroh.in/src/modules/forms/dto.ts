import { Type } from "class-transformer";
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

/**
 * The field descriptor types a Form supports. `email` is special: exactly one
 * email field is REQUIRED per form and its value is the Contact dedupe key
 * (see {@link FormsService.assertFieldsWellFormed} and the enquiry command).
 */
export const FIELD_TYPES = ["text", "email", "tel", "textarea"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** The set of Form statuses. ACTIVE accepts submissions; ARCHIVED does not. */
export const FORM_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

/**
 * One field descriptor in a Form's `fields` array. Persisted verbatim as JSON
 * and re-validated at submit time (S3-002) against the visitor's data.
 */
export class FormFieldDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    name!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(128)
    label!: string;

    @IsIn(FIELD_TYPES)
    type!: FieldType;

    @IsOptional()
    @IsBoolean()
    required?: boolean;
}

/**
 * A field descriptor as read back from the DB (`Form.fields` is `Json`, so it
 * is untyped at the Prisma boundary). Structurally identical to
 * {@link FormFieldDto}; used by the enquiry command when validating a
 * submission against a persisted form.
 */
export interface FormField {
    name: string;
    label: string;
    type: FieldType;
    required?: boolean;
}

/**
 * Create a Form. Structural field validation (types, non-empty array) is done
 * here by class-validator; the SEMANTIC rules (unique field names, at least one
 * `email` field) are enforced in {@link FormsService} so they are shared with
 * updates and unit-testable.
 */
export class CreateFormDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name!: string;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => FormFieldDto)
    fields!: FormFieldDto[];

    @IsOptional()
    @IsString()
    @MaxLength(64)
    siteId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    pipelineId?: string;
}

/**
 * Update a Form. Every field is optional (PATCH semantics). When `fields` is
 * present it fully replaces the array and is re-validated (structural +
 * semantic) exactly like create.
 */
export class UpdateFormDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => FormFieldDto)
    fields?: FormFieldDto[];

    @IsOptional()
    @IsIn(FORM_STATUSES)
    status?: FormStatus;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    pipelineId?: string;
}
