// The list primitive every app's screens share: the merchant workspace and the
// admin console. Moved here from app.saroh.in so the two cannot drift
// (admin console plan, D6).
export * from "./data-view";
export * from "./types";
export {
    TABLE_MIN_WIDTH,
    phoneModeFor,
    resolveViewMode,
    useViewMode,
} from "./use-view-mode";
