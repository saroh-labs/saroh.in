// Re-export the shared @saroh/tailwind-config preset. This app consumes
// @saroh/ui (Wordmark, Card), and the shared preset already includes the
// packages/ui source glob so component-only classes are never purged (#92).
import sharedConfig from "../../tooling/tailwind-config/tailwind.config";

export default sharedConfig;
