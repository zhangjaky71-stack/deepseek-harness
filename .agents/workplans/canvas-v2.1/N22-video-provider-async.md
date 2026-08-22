# N22 — Async Video Provider / Polling / Callback / Resume（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

实现真实/Mock异步Video Provider operation的start/poll/callback/cancel/resume，并与N15 permit、N16 durable Run/Job、N21 video materializer集成。

## 2. 依赖

`N15, N16, N21`

## 3. Async operation identity

Provider operation id只作为Host runtime/reconciliation identity，不作为Browser bearer capability。Durable Run可以保存安全、必要、可重建的provider operation reference（若Provider resume要求），但绝不保存credential/signed temp URL。

## 4. Start

只有持有有效 N15 permit 的 N16 attempt可以start。Start成功/失败与 durable Run transition顺序必须明确，避免crash后既收费又没有可恢复 operation identity。

## 5. Poll/callback

- polling有backoff/timeout/cancel；
- callback严格auth/verify/provider mapping；
- poll与callback可能竞态，terminal settlement幂等；
- duplicate/late callback不能创建第二output；
- callback不直接写Browser或绕过N16。

## 6. Resume/restart

进程重启后根据 durable Run/provider operation reference恢复：

- 已terminal → 不重启Provider；
- pending/running → resume/poll；
- unknown operation → explicit interrupted/failed reconciliation；
-不能silent start一个新收费operation冒充resume。

## 7. Materialization

Provider terminal success只表示remote task完成。N21 video durable save成功后才能把Canvas output/run标记为最终成功。

## 8. Latest Harness integration

实现前重新读取 0.1.1-rc.2 最新 Jobs/cancellation/event packages，不冻结旧rc.8 API。N16 Run authority仍是业务真源。

## 9. Tests

- start/poll success/failure；
- callback success/verification failure；
- poll+callback race；
- duplicate callback；
- cancel before/during terminal；
- restart resume；
- missing provider operation；
- video materialization failure；
- no second Provider operation on recovery；
- latest Jobs REAL integration。

## 10. 验收

真实或高保真Mock async video provider在进程重启/重复回调/取消竞态下保持单一durable Run/output语义。
