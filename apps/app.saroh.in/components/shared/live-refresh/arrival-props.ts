/**
 * Not a client module, on purpose: a row drawn on the server (a product's
 * or a customer's orders) calls this too, and a function exported from a
 * "use client" file can't be called there.
 */

/**
 * What a row that just arrived carries: the entrance and the edge
 * (`wk-item wk-arrived` in `workspace.css`, still under reduced motion),
 * and the two ways of touching it.
 */
export function arrivalProps(
    arrived: boolean,
    onTouch: () => void,
): {
    className?: string;
    "data-arrived"?: "";
    onPointerDown?: () => void;
    onFocusCapture?: () => void;
} {
    if (!arrived) return {};
    return {
        className: "wk-item wk-arrived",
        "data-arrived": "",
        onPointerDown: onTouch,
        onFocusCapture: onTouch,
    };
}
