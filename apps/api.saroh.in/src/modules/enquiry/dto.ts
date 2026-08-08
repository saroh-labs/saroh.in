import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Public enquiry submission body (S3-002). `data` is the raw map of form field
 * name → submitted value; it is validated against the target Form's `fields` in
 * {@link EnquiryService.submit} (NOT here — the shape is form-specific and the
 * org is derived from the Form, never the client). `idempotencyKey` lets a
 * client safely retry a submission without creating a second lead.
 */
export class SubmitEnquiryDto {
    @IsObject()
    data!: Record<string, unknown>;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    idempotencyKey?: string;
}
