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
 * The action is Saffron light on Ink, and flips to Saffron 700 in dark mode,
 * where the bar inverts to Paper and the light cut would fall under 3:1.
 */
export const brandToastOptions: ToasterProps["toastOptions"] = {
    unstyled: true,
    classNames: {
        toast: "flex w-full min-w-[300px] items-center gap-3 rounded-[10px] bg-primary px-[15px] py-3 text-[13px] text-primary-foreground shadow-lg [&>[data-icon]]:shrink-0 [&_[data-icon]_svg]:size-4",
        title: "font-medium",
        description: "mt-0.5 text-[12.5px] opacity-80",
        actionButton:
            "ml-auto shrink-0 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-[#F0A92B] hover:underline dark:text-[#91550C]",
        cancelButton:
            "ml-auto shrink-0 rounded-md px-1.5 py-1 text-[12.5px] font-medium opacity-80",
        closeButton:
            "order-last ml-1 shrink-0 rounded-md p-1 text-primary-foreground opacity-70 hover:opacity-100",
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
