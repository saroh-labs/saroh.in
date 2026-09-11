import type { ValidationPipeOptions } from "@nestjs/common";

/**
 * The global ValidationPipe's options, in one place (#286).
 *
 * `main.ts` applies them, and DTO specs validate through the same object, so a
 * test of what a body accepts cannot drift from what the API actually does.
 *
 * `enableImplicitConversion` needs a warning. It converts a value to the DTO
 * property's declared type BEFORE the validators run, and for a boolean that
 * conversion is truthiness: the string "false" becomes `true`, and so does `1`.
 * A field that must arrive as a real boolean reads the raw value with
 * `@Transform(({ obj }) => obj.<field>)` ahead of `@IsBoolean()`. See
 * `SetCommentResolvedDto`.
 */
export const validationPipeOptions: ValidationPipeOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
};
