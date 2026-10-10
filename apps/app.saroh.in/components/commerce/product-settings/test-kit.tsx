/**
 * What Product settings' component tests share: the sheet, the dialog and
 * the confirm drawn in place (a portal and Radix's focus handling are not
 * what is tested), and the few DOM helpers the tests press and type with.
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import type { ReactElement, ReactNode } from "react";
import { act, cloneElement, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

/** An overlay drawn in place: its trigger always, its content while open. */
function overlay(kind: string) {
    const Ctx = createContext<{
        open: boolean;
        set: (open: boolean) => void;
    }>({ open: false, set: () => undefined });
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Root: ({
            open,
            onOpenChange,
            children,
        }: {
            open: boolean;
            onOpenChange: (open: boolean) => void;
            children?: ReactNode;
        }) => (
            <Ctx.Provider value={{ open, set: onOpenChange }}>
                {children}
            </Ctx.Provider>
        ),
        Trigger: ({
            children,
        }: {
            children: ReactElement<{ onClick?: () => void }>;
        }) => {
            const { set } = useContext(Ctx);
            return cloneElement(children, { onClick: () => set(true) });
        },
        Content: ({ children }: { children?: ReactNode }) => {
            const { open, set } = useContext(Ctx);
            return open ? (
                <div role="dialog" data-kind={kind}>
                    {children}
                    {/* Escape, the close button, a press outside. */}
                    <button type="button" onClick={() => set(false)}>
                        Dismiss
                    </button>
                </div>
            ) : null;
        },
        Title: ({ children }: { children?: ReactNode }) => (
            <h2 data-title="">{children}</h2>
        ),
        Pass,
    };
}

export function sheetMock() {
    const o = overlay("sheet");
    return {
        Sheet: o.Root,
        SheetTrigger: o.Trigger,
        SheetContent: o.Content,
        SheetTitle: o.Title,
        SheetHeader: o.Pass,
        SheetDescription: o.Pass,
        SheetFooter: o.Pass,
    };
}

export function dialogMock() {
    const o = overlay("dialog");
    return {
        Dialog: o.Root,
        DialogTrigger: o.Trigger,
        DialogContent: o.Content,
        DialogTitle: o.Title,
        DialogHeader: o.Pass,
        DialogDescription: o.Pass,
        DialogFooter: o.Pass,
    };
}

export function confirmMock() {
    return {
        ConfirmDialog: ({
            open,
            onOpenChange,
            title,
            description,
            confirmLabel,
            cancelLabel = "Cancel",
            onConfirm,
        }: {
            open: boolean;
            onOpenChange: (open: boolean) => void;
            title: string;
            description: string;
            confirmLabel: string;
            cancelLabel?: string;
            onConfirm: () => void;
        }) =>
            open ? (
                <div role="alertdialog">
                    <h2 data-title="">{title}</h2>
                    <p>{description}</p>
                    <button type="button" onClick={() => onOpenChange(false)}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            ) : null,
    };
}

/** A page to draw on, and the helpers that read and press it. */
export function stage() {
    let root: Root;
    let host: HTMLDivElement;
    const within = (el?: ParentNode | null): ParentNode => el ?? host;

    const kit = {
        mount() {
            (
                globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
            ).IS_REACT_ACT_ENVIRONMENT = true;
            host = document.createElement("div");
            document.body.appendChild(host);
            root = createRoot(host);
        },
        unmount() {
            act(() => root.unmount());
            host.remove();
            document.body.innerHTML = "";
        },
        render(node: ReactElement) {
            act(() => root.render(node));
        },
        text: () => host.textContent,
        /** A button by its words or its accessible name. */
        button(name: string, el?: ParentNode | null) {
            return Array.from(within(el).querySelectorAll("button")).find(
                (b) =>
                    b.getAttribute("aria-label") === name ||
                    (!b.hasAttribute("aria-label") &&
                        b.textContent.trim() === name),
            );
        },
        press(name: string, el?: ParentNode | null) {
            const b = kit.button(name, el);
            if (!b) throw new Error(`No button "${name}"`);
            act(() => b.click());
        },
        sheet: () =>
            host.querySelector<HTMLElement>(
                '[role="dialog"][data-kind="sheet"]',
            ),
        dialog: () =>
            host.querySelector<HTMLElement>(
                '[role="dialog"][data-kind="dialog"]',
            ),
        confirm: () => host.querySelector<HTMLElement>('[role="alertdialog"]'),
        title: (el: ParentNode | null) =>
            el?.querySelector("[data-title]")?.textContent ?? null,
        inputs: (el?: ParentNode | null) =>
            Array.from(within(el).querySelectorAll("input")),
        type(el: HTMLInputElement | null | undefined, value: string) {
            if (!el) throw new Error("No field to type in");
            act(() => {
                Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value",
                )?.set?.call(el, value);
                el.dispatchEvent(new Event("input", { bubbles: true }));
            });
        },
        /** Submits the open overlay's form and lets its save settle. */
        async submit(el: ParentNode | null) {
            const form = el?.querySelector("form");
            if (!form) throw new Error("No form");
            await act(async () => {
                form.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true }),
                );
                for (let i = 0; i < 10; i++) await Promise.resolve();
            });
        },
        /** Lets a pressed button's server call settle. */
        async settle() {
            await act(async () => {
                for (let i = 0; i < 10; i++) await Promise.resolve();
            });
        },
    };
    return kit;
}
