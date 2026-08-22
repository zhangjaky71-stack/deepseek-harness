# `@deepseek-ai/dsh-media-provider-mock`

English | [中文](README.zh.md)

Opt-in development/test Provider for the Canvas media-generation runtime. It exists to prove N13/N14/N15/N16 contracts without calling a paid external Provider.

## Scope

The mock registers Provider/model descriptors and Provider runtime adapters through the same public media-provider seams used by real plugins. It supports deterministic success and fault/cancellation/async scenarios required by workflow, admission and lifecycle tests.

It must never become a production fallback merely because a real Provider is unavailable.

## Authority boundaries

- The mock does not write Canvas Session events directly.
- The mock does not own durable image/video storage.
- Image result bytes/fixtures flow through the same N17 Harness Attachment materializer contract as a real image Provider.
- Video result bytes/fixtures flow through the N21 video materializer contract.
- Model/provider selection is still N13; governance is still N15; durable lifecycle is still N16.

## No silent production fallback

A content/policy/network failure from a real Provider must not automatically reroute to this mock. The mock is installed only by explicit test/development composition.

## `0.1.1-rc.2` revalidation

The core mock behavior from N14 is retained. Revalidation must prove that its image outputs no longer rely on any private asset-store assumption and instead reach the synchronized official Attachment path before Canvas output completion.

Tests should also keep credentials absent, deterministic execution identities stable, cancellation contained and plugin disposal/HMR registration clean.

See N14, N17 and N25 workplans.