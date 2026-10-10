"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "../../lib/utils";

const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn(
            "relative flex w-full touch-none select-none items-center",
            className,
        )}
        {...props}
    >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="relative block h-5 w-5 cursor-grab rounded-full border-2 border-primary bg-background ring-offset-background transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing data-[disabled]:pointer-events-none data-[disabled]:border-disabled-border data-[disabled]:bg-disabled coarse:after:absolute coarse:after:-inset-3.5 coarse:after:content-['']" />
    </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
