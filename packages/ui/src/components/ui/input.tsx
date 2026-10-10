import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * 38px, the brand file's control height — the same as `Button`, so a field and
 * the button beside it sit on one line rather than two heights pretending to
 * be one. `coarse:` restores the 44px touch target on a phone, and sets the
 * text at 16px there: iOS Safari zooms the page when a smaller field takes
 * focus and leaves it zoomed. A call site never sets a field's type size.
 *
 * The states a field can be in, each with a look of its own:
 * - hover: the edge moves one step (Ink 400 to Ink 500), as a Select's does;
 * - focus: the one ring every primitive draws (`fieldFocus`);
 * - invalid (`aria-invalid`): the destructive edge on its tint;
 * - disabled: the disabled fill, label and edge, never an opacity;
 * - read-only: a hairline, no fill, the value at full contrast. It is a
 *   value to read and copy, so it must not look like a box to type in, nor
 *   like a disabled one.
 */
export const fieldFocus =
    "ring-offset-background focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const fieldStates =
    "transition-colors duration-fast hover:border-muted-foreground disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-subtle [&[readonly]]:border-border [&[readonly]]:bg-transparent [&[readonly]]:text-foreground";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-[38px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground coarse:h-11 coarse:text-base",
                    fieldFocus,
                    fieldStates,
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = "Input";

export { Input };
