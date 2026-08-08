import { cn } from "../../lib/utils";

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            // `skeleton-sweep` (globals.css) replaces `animate-pulse`: a
            // directional sweep reads as "arriving", where a stack of blocks
            // pulsing in unison reads as "broken".
            className={cn("skeleton-sweep rounded-md bg-muted", className)}
            {...props}
        />
    );
}

export { Skeleton };
