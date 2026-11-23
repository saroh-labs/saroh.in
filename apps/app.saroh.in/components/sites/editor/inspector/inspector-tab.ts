/** The inspector's tabs. Its own file, so `chrome-panel` reads it without importing `site-inspector`, which imports it (a cycle). */
export type InspectorTab = "content" | "style" | "visibility" | "feedback";
