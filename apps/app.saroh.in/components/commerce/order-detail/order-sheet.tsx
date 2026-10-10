"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Sheet } from "@saroh/ui/sheet";
import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

import {
    ACTION_SHEET_FORM,
    ActionSheetContent,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";

import { CHANGE_BUTTON_ID } from "./change-panels";
import type { Panel } from "./panel";

type OpenPanel = Exclude<Panel, null>;

/**
 * Which of Order Detail's sheets is open, one at a time (owner, 10 Oct:
 * the page is read first, and every change opens in a side sheet).
 *
 * `openPanel` is what a button on the page calls: it remembers the button,
 * so the keyboard goes back there when the sheet closes, and counts the
 * opening, so each one starts from the order as it is and not from the
 * last draft. `setPanel` is for the hooks that close a sheet once its
 * write is done, and for an arrival from the Orders list (`useArrival`),
 * which has no button: the keyboard then goes to the Change card's own.
 */
export function useOrderPanel() {
    const [panel, setPanel] = useState<Panel>(null);
    const [opening, setOpening] = useState(0);
    const opener = useRef<HTMLElement | null>(null);

    const openPanel = useCallback((next: OpenPanel) => {
        const active = document.activeElement;
        opener.current =
            active instanceof HTMLElement && active !== document.body
                ? active
                : null;
        setOpening((n) => n + 1);
        setPanel(next);
    }, []);
    const closePanel = useCallback(() => setPanel(null), []);
    const returnFocus = useCallback((from: OpenPanel) => {
        const pressed = opener.current;
        opener.current = null;
        const id = CHANGE_BUTTON_ID[from];
        const back = pressed?.isConnected
            ? pressed
            : id
              ? document.getElementById(id)
              : null;
        back?.focus();
    }, []);

    return { panel, setPanel, opening, openPanel, closePanel, returnFocus };
}

/**
 * The side sheet a change to an order opens in: its title and a line under
 * it, the fields (`OrderSheetBody`, which scrolls) and, pinned at the foot,
 * what the change does to the money with the button that makes it
 * (`OrderSheetFoot`).
 *
 * Nothing is recorded until that button. The way out (Cancel, or "Keep
 * order" on the cancel sheet), Escape and the close button drop what was
 * typed. A press outside does too until something is chosen or typed
 * (`useOrderSheetDraft`), and after that it does nothing: a stray tap must
 * not throw the change away. None of them works while a save is on its way
 * (`busy`). A refusal leaves it open with what was typed: the hook that
 * saves closes it only on success.
 */
export function OrderSheet({
    open,
    title,
    description,
    busy = false,
    wide = false,
    onClose,
    returnFocus,
    children,
}: {
    open: boolean;
    title: string;
    description: string;
    /** A save is on its way: the sheet can't be dismissed. */
    busy?: boolean;
    /** Room for a list of lines with their prices. */
    wide?: boolean;
    onClose: () => void;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
    children: ReactNode;
}) {
    // Said by the draft inside (`useOrderSheetDraft`).
    const [dirty, setDirty] = useState(false);
    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o && !busy) onClose();
            }}
        >
            <ActionSheetContent
                title={title}
                description={description}
                dirty={dirty || busy}
                // Off the paper: "Packing slip" prints the page behind it.
                className={cn("print:hidden", wide && "sm:max-w-lg")}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    returnFocus?.();
                }}
            >
                <SheetDirty.Provider value={setDirty}>
                    <div className={ACTION_SHEET_FORM}>{children}</div>
                </SheetDirty.Provider>
            </ActionSheetContent>
        </Sheet>
    );
}

const SheetDirty = createContext<(dirty: boolean) => void>(() => undefined);

/**
 * What is chosen and typed in an order sheet, told to the sheet: once it
 * differs from what the sheet opened with, a press outside no longer
 * closes it. Call it once in the sheet's draft, with every value the
 * person can change.
 */
export function useOrderSheetDraft(draft: unknown) {
    const setDirty = useContext(SheetDirty);
    const now = JSON.stringify(draft);
    const [first] = useState(now);
    const dirty = now !== first;
    useEffect(() => {
        setDirty(dirty);
        return () => setDirty(false);
    }, [dirty, setDirty]);
}

/** The fields scroll; the inset keeps a focus ring from being clipped. */
export function OrderSheetBody({ children }: { children: ReactNode }) {
    return (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
            {children}
        </div>
    );
}

/**
 * Always on screen under the fields: what saving does (`note`), then the
 * way out and the sheet's own button, which stack on a phone with the
 * button on top.
 *
 * The way out reads "Cancel" unless the sheet's own button cancels
 * something: beside "Cancel order" it is "Keep order" (`dismiss`), so the
 * two never read as the same thing.
 */
export function OrderSheetFoot({
    busy = false,
    dismiss = "Cancel",
    note,
    children,
}: {
    busy?: boolean;
    /** The way out's label. */
    dismiss?: string;
    note?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="border-t border-border pt-3">
            {note}
            <ActionSheetFooter busy={busy} cancel={dismiss}>
                {children}
            </ActionSheetFooter>
        </div>
    );
}
