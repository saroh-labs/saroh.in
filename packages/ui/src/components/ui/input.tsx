import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * 38px, the brand file's control height — the same as `Button`, so a field and
 * the button beside it sit on one line rather than two heights pretending to
 * be one. `coarse:` restores the 44px touch target on a phone.
 */

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-[38px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-subtle coarse:h-11",
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
