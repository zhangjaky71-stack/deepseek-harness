# canvas/ — generative media Canvas

English | [中文](README.zh.md)

The Canvas group owns the session-scoped generative-media workspace and the media-workflow capabilities that operate on it. Durable Canvas state, process-local node definitions, media Provider/model metadata, and Provider runtime adapters stay in separate packages so Session replay does not depend on deployment registry lifetime or Provider SDK state. Assets, Agent tools, admission, Jobs, and richer browser editing are added as independent roles when their implementations exist.

| Package | Role |
|---|---|
| [`canvas/`](canvas/README.md) | Shared Canvas snapshot, semantic media-workflow vocabulary, revisions, output references, deployment capability policy, projections, interaction context, Host mutations, and durable invariants |
| [`media-workflow/`](media-workflow/README.md) | Versioned semantic node-definition registry, typed ports/config schemas, intrinsic lifecycle, deterministic DAG validation/planning/execution, fingerprints, cache seam, and V1 built-ins |
| [`media-provider/`](media-provider/README.md) | N13 Provider/model capability registry and strict/auto/fallback resolver plus N14 runtime adapter registry, semantic Provider operations, error normalization, and N12 ProviderExecutor bridge |
| [`media-provider-mock/`](media-provider-mock/README.md) | Opt-in deterministic/fault-injectable image/video Provider used by keyless N14 runtime and full-DAG tests; never a shipped production Provider |
