/**
 * A phone number in the workspace (DEC-053, #1036): the business's public
 * phone, a customer's, a contact's. The API stores E.164 ("+919845012345")
 * and is the judge; the rule itself is `@saroh/block-contract`'s `phone.ts`,
 * the same code the API runs, so the field says what Save would refuse
 * before Save does. `PhoneInput` (`@saroh/ui/phone-input`) is the field.
 */
import { phoneNumberProblem } from "@saroh/block-contract";
import { z } from "zod";

export {
    PHONE_EXAMPLE,
    phoneLabel,
    phoneNumberProblem as phoneProblem,
    phoneE164 as phoneStored,
} from "@saroh/block-contract";

/**
 * A phone field in a form's schema: "" for none, else a number the API
 * keeps. `saved`, a number saved before numbers were checked, is let
 * through as it is, so an untouched phone never stops the rest saving.
 */
export function phoneSchemaKeeping(saved = "") {
    return z.string().superRefine((value, ctx) => {
        if (saved !== "" && value === saved) return;
        const problem = phoneNumberProblem(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
    });
}

/** A phone field in a form's schema, for a new record. */
export const phoneSchema = phoneSchemaKeeping();
