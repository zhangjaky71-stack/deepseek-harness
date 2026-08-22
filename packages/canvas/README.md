# canvas/ — generative media Canvas

English | [中文](README.zh.md)

The Canvas group owns the session-scoped generative-media workspace and the media-workflow capabilities that operate on it. Durable Canvas state, process-local node definitions, and media Provider/model capability metadata stay in separate packages so Session replay does not depend on deployment registry lifetime. Provider execution, assets, Agent tools, admission, Jobs, and richer browser editing are added as independent roles when their implementations exist.

| Package | Role |
|---|---|
| [`canvas/`](canvas/README.md) | Shared Canvas snapshot, semantic media-workflow vocabulary, revisions, output references, deployment capability policy, projections, interaction context, Host mutations, and durable invariants |
| [`media-workflow/`](media-workflow/README.md) | Versioned semantic node-definition registry, typed ports/config schemas, intrinsic lifecycle, deterministic DAG validation/planning/execution, fingerprints, cache seam, and V1 built-ins |
| [`media-provider/`](media-provider/README.md) | Process-local Provider/model capability registry plus strict/auto/fallback requirement resolution and the concrete execution identity consumed by the workflow engine |
