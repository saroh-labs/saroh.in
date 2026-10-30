import { cn } from "@/lib/cn";
import { ring } from "@/lib/ring";

/**
 * A text field's classes (DEC-195, V11): 16px text, so iOS doesn't zoom in
 * on focus; the Saffron ring; `focus:ring-0` takes off the forms plugin's
 * blue ring. The caller sets the height and width for its row.
 *
 * - default — white, Ink 300 border, Ink on hover, red when `invalid`.
 * - `onInk` — on an Ink panel: no border, the band's Saffron ring.
 * - `bare` — inside a framed group that draws the border itself (the help
 *   search, the link and QR address boxes).
 */
export function fieldClasses({
    invalid = false,
    onInk = false,
    bare = false,
    className,
}: {
    invalid?: boolean;
    onInk?: boolean;
    bare?: boolean;
    className?: string;
} = {}) {
    const base =
        "min-w-0 font-sans text-base font-normal text-foreground placeholder:text-muted-foreground";
    if (bare) {
        return cn(
            base,
            "flex-1 border-none bg-transparent outline-none focus:ring-0",
            className,
        );
    }
    return cn(
        base,
        "rounded-mk-control px-3.5 transition-colors duration-fast ease-out focus:ring-0 focus:ring-offset-0",
        onInk
            ? cn("border-none bg-card", ring({ color: "saffron" }))
            : cn(
                  "border bg-white hover:border-foreground",
                  // The border keeps its colour on focus (the forms plugin
                  // would turn it blue); the ring says it's focused.
                  invalid
                      ? "border-destructive focus:border-destructive"
                      : "border-border-strong focus:border-border-strong",
                  ring(),
              ),
        className,
    );
}
