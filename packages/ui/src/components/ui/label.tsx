"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * A field's label: 12.5px Geist 500, above its control. That is the one
 * size, so a call site never sets one (labels had been drawn at five).
 */
const labelVariants = cva(
    "text-[0.78125rem] font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:text-disabled-foreground",
);

const Label = React.forwardRef<
    React.ElementRef<typeof LabelPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
        VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
    <LabelPrimitive.Root
        ref={ref}
        // A field's name is Saroh's own words: a session recording may
        // read it. One that names a record adds `data-ph-mask`.
        data-ph-unmask=""
        className={cn(labelVariants(), className)}
        {...props}
    />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
