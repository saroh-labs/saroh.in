// Re-export the shared @saroh/tailwind-config preset, the same way every other
// app in the monorepo does.
//
// This file used to be a hand-maintained fork of the preset. The reason was
// real once: the old marketing site was built on Aceternity components, which
// needed `bg-grid`/`bg-dot` utilities (generated through mini-svg-data-uri), an
// addVariablesForColors plugin, and spotlight/meteor/scroll keyframes that the
// preset does not carry.
//
// The rebuilt site uses none of them — no grid, no dots, no spotlight, no
// meteors, not one `animate-*` class. What the fork still did was duplicate the
// entire token map by hand, which is a drift trap: the five-step radius scale
// added to the preset never reached this app, so `rounded-xl` here silently
// meant something different from `rounded-xl` in the workspace.
//
// Content globs resolve relative to this app's directory at build time, and the
// preset includes packages/ui's glob so component-only classes are not purged.
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

export default sharedConfig;
