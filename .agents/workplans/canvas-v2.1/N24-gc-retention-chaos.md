# N24 — GC / Retention / Orphan / Chaos Recovery（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

在进程崩溃、partial materialization、history retention、plugin/provider缺失和重复回调下保证 Canvas/Attachment/Video资产不会出现不可解释的durable状态，并明确谁拥有“引用”与“底层对象删除”。

## 2. 依赖

`N17, N21, N22, N23`

## 3. Image retention ownership

0.1.1-rc.2 Harness Attachment拥有normalized image object/content-addressed store。Canvas负责：

- 哪些 Canvas Session/Run/History仍引用某 stable image ref；
- 哪些 output/variant可被产品retention淘汰；
- 生成 orphan/reference telemetry。

Canvas不应绕过Attachment owner直接删除底层image object。最终binary GC遵守官方 Attachment retention/content-addressing policy。

## 4. Video retention

N21 video authority定义自己的 object/ref retention接口，原则与Image一致：Canvas business history决定引用，binary store决定安全物理删除。

## 5. Orphan cases

至少覆盖：

- Provider成功，Attachment/video save成功，但Canvas Session append失败；
- candidate前几个save成功，后一个save失败；
- Run durable start后进程crash，provider已收费但operation identity尚未完整settle；
- callback duplicate/late；
- history entry已retire但binary仍有其他Session/Run引用；
- underlying attachment/video object损坏/丢失。

## 6. Recovery principles

- content-addressed orphan可以暂时存在，不能把它推断成completed Canvas output；
- reconciliation必须幂等；
- GC只能删除已证明无live/durable reference且满足store retention条件的对象；
- missing binary使Asset显式 unavailable/corrupt，不从provider temp URL silent恢复；
- cleanup failure不破坏semantic history truth。

## 7. Request-image cache

Attachment request-image variants/cache属于Attachment/request infrastructure，生命周期不由Canvas history variant GC直接控制。Canvas删除历史output引用不等于手工删除某 `variantId` cache file。

## 8. Chaos tests

- crash at each materialization/append boundary；
- duplicate/late provider completion；
- process restart；
- missing/corrupt image/video object；
- concurrent history retention + active run；
- shared content-addressed image refs；
- retry/cancel/reconciliation；
- GC interruption/resume；
- no dangling semantic completed output to nonexistent asset without explicit corruption state。

## 9. 验收

经过故障注入后，Session replay、Run reconciliation、asset availability与binary store reference/retention结果一致；无误删live对象，无silent semantic repair。
