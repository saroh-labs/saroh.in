"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * The brand's toast (brand file §14): an Ink bar, Paper text, and one action
 * in Saffron — "Undo" for anything reversible. Transient and never blocking;
 * bottom-centre so it never covers the bulk bar's actions at the edges, and
 * on a phone it sits above the tab bar.
 *
 * Unstyled, then styled in full: Sonner's own sheet sets its colours through
 * attribute selectors that outrank utility classes, so layering classes on a
 * styled toast loses to it in exactly the places that matter.
 *
 * On a touch pointer the action, the cancel and the close are each 44px
 * (Undo was about 26px), pulled into the bar's padding so the bar keeps its
 * height. Below `sm` the bar has no minimum width, so it fits a 320px
 * screen.
 *
 * The action is Saffron light on Ink, and flips to Saffron 700 in dark mode,
 * where the bar inverts to Paper and the light cut would fall under 3:1.
 */
export const brandToastOptions: ToasterProps["toastOptions"] = {
    unstyled: true,
    classNames: {
        // `pointer-events-auto`: a modal sheet sets `pointer-events: none`
        // on the body, which the toast would inherit — and its Undo, raised
        // by an action in that sheet, could not be pressed.
        toast: "pointer-events-auto flex w-full min-w-0 items-center sm:min-w-[300px] gap-3 rounded-[10px] bg-primary px-[15px] py-3 text-[13px] text-primary-foreground shadow-lg [&>[data-icon]]:shrink-0 [&_[data-icon]_svg]:size-4",
        title: "font-medium",
        description: "mt-0.5 text-[12.5px] opacity-80",
        actionButton:
            "ml-auto inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-[#F0A92B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground dark:text-[#91550C] coarse:-my-2 coarse:min-h-11 coarse:min-w-11 coarse:px-3 coarse:text-sm",
        cancelButton:
            "ml-auto inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md px-1.5 py-1 text-[12.5px] font-medium opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground coarse:-my-2 coarse:min-h-11 coarse:min-w-11 coarse:px-3 coarse:text-sm",
        closeButton:
            "order-last ml-1 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-primary-foreground opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground coarse:-my-2 coarse:min-h-11 coarse:min-w-11",
        error: "[&_[data-icon]]:text-[#E9736B] dark:[&_[data-icon]]:text-[#B3261E]",
        success:
            "[&_[data-icon]]:text-[#5FBF8A] dark:[&_[data-icon]]:text-[#2F7D4F]",
    },
};

function Toaster({ ...props }: ToasterProps) {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            position="bottom-center"
            className="toaster group"
            toastOptions={brandToastOptions}
            {...props}
        />
    );
}

export { Toaster };
