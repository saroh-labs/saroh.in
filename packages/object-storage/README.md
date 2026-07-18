# @saroh/object-storage

Provider-agnostic object-storage boundary for Saroh media (ticket S2-008).

Depend on the `ObjectStorage` port everywhere; pick an adapter at the app's
composition root and pass typed config in — this package never reads
`process.env`.

- `createR2Storage(config)` — Cloudflare R2 (S3-compatible) adapter, the first provider.
- `createMemoryStorage(config?)` — network-free adapter for tests and local/dev.

Because callers only touch the port, storage can later move to DigitalOcean
Spaces (or any S3-compatible provider) without product changes.
