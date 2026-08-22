# Canvas V2.2 — Session Event and Projection Protocol (`dsh@0.1.1-rc.2`)

## 1. Durable authority

Canvas semantic truth is append-only Session state. Browser stores, Provider callbacks, request-image caches and live progress are not substitute authorities.

```text
Browser / Agent command
        ↓
Host CanvasService
        ↓ atomic validation/authorization
Canvas Session event(s)
        ↓
Host Projection fold state
        ↓ official wire view
Browser Canvas projection
```

## 2. Durable event principles

A durable Canvas event may contain:

- stable Canvas/workflow/run/node/edge identifiers;
- semantic node configuration after boundary validation;
- workflow/layout/run revisions where the owning event requires them;
- stable image/video asset references and safe metadata;
- model/provider identity required for provenance;
- terminal run/output state and history links.

A durable Canvas event must not contain:

- image/video bytes or base64;
- Browser object/blob URLs;
- provider temporary download URLs;
- provider credentials/tokens;
- `RequestImageAttachment.data`;
- request-image `variantId` when it is only a transform/cache identity;
- DeepSeek Files/other remote upload bearer identity unless a future durable provider contract explicitly proves it is safe and reconstructable;
- high-frequency progress percentages.

## 3. Image event rule under the new Attachment pipeline

For images:

```text
provider/user bytes
→ Harness Attachment validates/normalizes/commits master
→ stable ImageAttachmentRef / CanvasImageAssetRef
→ only then append Canvas output/link event
```

If attachment persistence fails, a completed Canvas output event must not be published.

Model-request projection is later and non-semantic:

```text
durable ImageAttachmentRef
→ Attachment.readImageRequest(route policy)
→ RequestImageAttachment
→ LLM/Provider transport
```

The request variant never changes Canvas workflow/run history by itself.

## 4. Projection contract

The current official Session Projection framework separates Host fold state from client-visible wire view. Canvas should define:

- Host state schema/version;
- deterministic `init` / `apply` fold behavior;
- a client-safe wire view schema/projection;
- replay/checkpoint compatibility.

Browser-visible Projection must contain enough semantic state for Minimal/Editor without leaking Host-only audit, authorization internals, credentials or binary data.

## 5. Interaction context is not a Canvas event

Current UI selection/focus/region is transient presentation context. N08 may log a model-visible plugin-context message only when that exact admitted user message is actually consumed by the Agent, but selection itself does not become a `canvas/change` semantic event.

Therefore:

```text
selected node / edge / asset / region
≠ workflow mutation
≠ Canvas revision increment
```

## 6. Registry/settings changes are not Canvas semantic events

The following process/deployment changes are external authorities and do not append Canvas events merely because they changed:

- Media Node Registry registration/HMR;
- Media Model/Provider Registry registration/HMR;
- Canvas Settings document edits;
- current feature capability activation;
- provider health snapshots;
- request-image cache creation.

A Run may persist the exact resolved identities it used for reproducibility, but registry mutation itself is not Session history.

## 7. Revisions

Keep revision domains separate:

- `workflowRevision`: semantic workflow mutation fence;
- `layoutRevision`: durable/editor layout mutation fence;
- `runRevision`: durable run lifecycle update fence where used;
- registry revisions: process-local discovery generations, not Session durable revisions.

A workflow mutation must not advance layout revision merely because node positions are displayed, and a layout save must not change semantic execution fingerprints.

## 8. Run snapshot rule

N16 must start a run from an exact workflow identity/revision admitted by N15. A later workflow edit may not silently change the already-started run.

```text
N15 admit exact WorkflowRef
→ N16 commits immutable Run snapshot/reference
→ later workflowRevision changes are separate history
```

## 9. History

Current Projection is optimized for current semantic state. Large run/variant history stays behind explicit history APIs/indexes rather than being stuffed into the current Browser Projection.

History records stable asset/provenance references. Request-image transforms and provider transport caches remain reconstructable/transient and are not history variants.

## 10. Video

Official Attachment upgrades currently provide the authoritative image path. N21 still owns the video binary durability design. The same event rule applies: persist video bytes through the eventual video authority first, then append only a stable Canvas asset reference.

## 11. Validation requirements

- replay from Session events reconstructs the same Canvas Host state;
- Browser wire view contains no Host-only/binary values;
- attachment save failure cannot publish completed image output;
- request-image derivation produces no Canvas event;
- selection/region changes produce no Canvas semantic revision;
- registry/settings/HMR changes alone produce no Canvas event;
- run snapshot remains pinned after workflow edits;
- history remains queryable without unbounded current Projection growth.
