"use client";

import { useEffect, useState } from "react";

/** A keyboard takes at least this much of the window's height. */
const KEYBOARD_PX = 150;

export interface VisibleArea {
    /** The visible height: the window less an on-screen keyboard. */
    height: number;
    /** How far the browser scrolled the page under the keyboard. */
    top: number;
    keyboardUp: boolean;
}

/**
 * The part of the screen a keyboard leaves (U16, "keyboard up keeps the
 * format bar visible"). A phone browser opens its keyboard over the page
 * without shrinking it, so a bar pinned to the foot would sit under the
 * keys; the editor sizes itself to this instead. Null where the browser
 * has no visual viewport (a desk, a test): the editor fills the window.
 */
export function useVisibleArea(): VisibleArea | null {
    const [area, setArea] = useState<VisibleArea | null>(null);
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const read = () =>
            setArea({
                height: vv.height,
                top: vv.offsetTop,
                keyboardUp: window.innerHeight - vv.height > KEYBOARD_PX,
            });
        read();
        vv.addEventListener("resize", read);
        vv.addEventListener("scroll", read);
        return () => {
            vv.removeEventListener("resize", read);
            vv.removeEventListener("scroll", read);
        };
    }, []);
    return area;
}
