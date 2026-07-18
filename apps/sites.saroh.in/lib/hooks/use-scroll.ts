import { useCallback, useEffect, useState } from "react";

export default function useScroll(threshold: number) {
    const [scrolled, setScrolled] = useState(false);

    const onScroll = useCallback(() => {
        setScrolled(window.scrollY > threshold);
    }, [threshold]);

    useEffect(() => {
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, [onScroll]);

    // also check on first load: sync state to the real scroll position (an
    // external DOM value) once on mount, since no scroll event fires initially.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync to external scroll position on mount
        onScroll();
    }, [onScroll]);

    return scrolled;
}
