import { Transform } from "class-transformer";
import { IsIn } from "class-validator";

import { SELF_TEST_TEMPLATES } from "./self-test.templates";

const lower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Request a Saroh self-test / template-preview email (S6-004).
 *
 * SECURITY: this DTO carries ONLY a `template` selector — there is deliberately
 * NO recipient field of any kind. The recipient is hard-bound server-side to
 * the authenticated session user's own verified account email. Combined with
 * the global ValidationPipe (`whitelist` + `forbidNonWhitelisted`), any attempt
 * to smuggle a `to`/`recipient`/`email` field in the body is rejected outright
 * rather than silently honored.
 */
export class SelfTestEmailDto {
    @Transform(lower)
    @IsIn(SELF_TEST_TEMPLATES, {
        message: `template must be one of: ${SELF_TEST_TEMPLATES.join(", ")}`,
    })
    template!: string;
}
