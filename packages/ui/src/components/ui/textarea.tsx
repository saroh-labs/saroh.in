import * as React from "react";
import { cn } from "../../lib/utils";
import { fieldFocus, fieldStates } from "./input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** A long text field. Its states are `Input`'s, from the same two strings. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    "flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm placeholder:text-muted-foreground coarse:text-base",
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
Textarea.displayName = "Textarea";

export { Textarea };
