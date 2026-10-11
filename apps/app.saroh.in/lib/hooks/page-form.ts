import { focusFirstError } from "@saroh/ui/field";
import type { BaseSyntheticEvent } from "react";

/**
 * How a form on a page of its own checks itself (a sheet checks when its
 * Save is pressed): each field on leaving it, then as it is fixed, and on
 * submit the keyboard goes to the first field in error.
 *
 *     const form = useForm({ resolver, defaultValues, ...PAGE_FORM });
 *     <form onSubmit={form.handleSubmit(onSubmit, toFirstError)}>
 *
 * `onTouched` is react-hook-form's name for "on the first blur, then on
 * every change". `toFirstError` is `handleSubmit`'s second argument and
 * takes the place of the form library's own focus-on-error, which only
 * knows the fields it holds a ref for and skips a select or a set of chips.
 */
export const PAGE_FORM = {
    mode: "onTouched",
    shouldFocusError: false,
} as const;

/** Put the keyboard on the first field in error in the form submitted. */
export function toFirstError(_errors?: unknown, event?: BaseSyntheticEvent) {
    const from: unknown = event?.target;
    toFirstErrorIn(from instanceof Element ? from.closest("form") : null);
}

/**
 * The same for a form checked outside `handleSubmit`: a step's Continue,
 * which checks only its own fields (`form.trigger`).
 */
export function toFirstErrorIn(form: Element | null) {
    // The errors are drawn a moment after this is called (the form library
    // sets them, then React draws them), so look until one is on the page:
    // a few frames at most.
    let looks = 0;
    const look = () => {
        const drawn = (form ?? document).querySelector(
            '[aria-invalid="true"]:not([disabled])',
        );
        if (drawn) focusFirstError(form);
        else if (++looks < 12) setTimeout(look, 16);
    };
    setTimeout(look, 0);
}
