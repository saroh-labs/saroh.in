import type { ValidationPipeOptions } from "@nestjs/common";

/**
 * The global ValidationPipe's options, in one place (#286).
 *
 * `main.ts` applies them, and DTO specs validate through the same object, so a
 * test of what a body accepts cannot drift from what the API actually does.
 *
 * ## No implicit conversion (#314)
 *
 * `enableImplicitConversion` used to be set here, and it is the reason this
 * file needed a warning at all. It coerces every value to the property's
 * declared type BEFORE the validators run, and for a boolean that coercion is
 * TRUTHINESS: the string `"false"` became `true`, and so did `"0"` and `"no"`.
 * `@IsBoolean()` then saw a real boolean and passed.
 *
 * That is not a validation failure anyone can see. A caller who sent
 * `{"featured": "false"}` — trivial from a form post, a shell, or a client that
 * stringifies — got the opposite of what they asked for, and no error. Seven
 * fields were exposed to it, among them whether an automation rule runs and
 * whether a billing change applies immediately.
 *
 * The workaround was per-field: read the raw value with
 * `@Transform(({ obj }) => obj.field)` ahead of `@IsBoolean()`. It worked, and
 * it had to be remembered every time, on every new boolean, for ever. Turning
 * the conversion off removes the trap instead of stepping around it.
 *
 * ## What that means for a DTO
 *
 * A body is JSON, so it already carries real numbers, strings and booleans:
 * nothing there needs converting. A value that arrives as TEXT — a query string
 * or a route param, which are strings by definition — converts explicitly with
 * `@Type(() => Number)` on the property. `ListAdminAuditDto.limit` is the one
 * such field today.
 *
 * The rule this leaves is simple, and it is the same one in both directions:
 * what a caller sends is what the validators see.
 */
export const validationPipeOptions: ValidationPipeOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
    // Still on: it is what builds the DTO CLASS from the plain object, so
    // `@Type`, nested `ValidateNested` DTOs and every `@Transform` run at all.
    // Only the implicit, type-directed coercion is gone.
    transform: true,
};
