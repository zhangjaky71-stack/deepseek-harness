# Canvas V2.2 — Historical Harness rc.8 Baseline

Status: `SUPERSEDED`

This document used to define the implementation target:

```text
deepseek-ai/deepseek-harness
141eb6fef83422698aef7a981029e843e8161534
dsh@0.1.0-rc.8
```

It is no longer the current Canvas development baseline.

The official project advanced to:

```text
deepseek-ai/deepseek-harness
b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
dsh@0.1.1-rc.2
```

Use [UPSTREAM-0.1.1-RC2-BASELINE.md](UPSTREAM-0.1.1-RC2-BASELINE.md) for all new implementation, review, compatibility and acceptance work.

## Historical value

The rc.8 work remains useful evidence for why the private stack introduced dynamic `ui-renderer`, the ModuleLoader facade and `shell.main`. Those decisions must not be interpreted as proof of current upstream compatibility. In particular, 0.1.1-rc.2 changed Projection, Attachment/image request projection, Settings client mirroring, React bindings, Web transport and repository gates after the rc.8 checkpoint.

## Migration rule

Do not delete old rc.8 implementation records or PR evidence. Mark them as historical/superseded and revalidate the affected node against the current baseline. No node may claim current acceptance solely because it passed an rc.8-oriented source audit.
