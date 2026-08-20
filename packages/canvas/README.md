# canvas/ — generative media Canvas

English | [中文](README.zh.md)

The Canvas group owns the session-scoped generative-media workspace and the media-workflow capabilities that operate on it. Durable Canvas state and process-local node-definition metadata stay in separate packages so Session replay does not depend on deployment registry lifetime. Execution, providers, assets, Agent tools, and richer browser editing are added as independent roles when their implementations exist.

| Package | Role |
|---|---|
| [`canvas/`](canvas/README.md) | Shared Canvas snapshot, semantic media-workflow vocabulary, revisions, output references, deployment capability policy, projections, interaction context, Host mutations, and durable invariants |
| [`media-workflow/`](media-workflow/README.md) | Versioned semantic node-definition registry, typed ports/config schemas, intrinsic lifecycle, stable UI/execution metadata, and V1 built-in definitions |
