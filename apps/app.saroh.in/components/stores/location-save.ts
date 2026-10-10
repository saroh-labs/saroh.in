import type { LocationTab } from "@/lib/stores/location-readiness";
import type {
    StorefrontInput,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

/**
 * The one save path every part of a location's page shares: each control
 * saves on its own (a switch when flipped, a row's sheet when its Save is
 * pressed), so there is no page-wide save to forget.
 */
export type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
    /**
     * Say a refusal beside the control instead of in a toast (UX-036):
     * the location limit, by the radio it stopped.
     */
    inline?: (error: string) => void,
    /** After the API took it: an edit sheet closes. */
    onSaved?: () => void,
) => void;

export interface SectionProps {
    store: StorefrontSettings;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: (fn: (s: StorefrontSettings) => StorefrontSettings) => void;
    /**
     * Open another tab, and put the keyboard on a field there. One of The
     * place's fields opens its sheet instead (`placeSheetFor`).
     */
    goTo?: (tab: LocationTab, focus?: string) => void;
}

/**
 * Scroll to a part of the page and put the keyboard there: the element
 * itself when it takes focus, else the first control inside it. For the
 * readiness card's "Add address" and the like, which a plain `#id` link
 * only scrolls to.
 */
export function jumpTo(id: string): boolean {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ block: "start" });
    const target = el.matches("input, textarea, button, [tabindex]")
        ? el
        : el.querySelector<HTMLElement>(
              "input:not([type=hidden]):not([readonly]), textarea:not([readonly]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
          );
    target?.focus({ preventScroll: true });
    return true;
}
