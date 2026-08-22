# N21 — Video Asset / Durable Binary / Range Access（0.1.1-rc.2 Revision）

Status: `PLANNED`

## 1. 目标

建立 Video output/input 的 durable binary authority、stable CanvasVideoAssetRef、安全读取/Range能力与 Browser播放 seam。不要误认为官方 0.1.1-rc.2 的 Image Attachment升级已经解决视频。

## 2. 依赖

`N04, N16, N19`

## 3. Authority split

```text
Image binary → official Harness Attachment
Video binary → N21 video durable authority
Canvas Domain → stable refs + provenance only
```

如果未来 Harness Attachment正式扩展 Video，应优先迁移到官方 seam；本节点不提前伪造不存在的 generic video API。

## 4. Durable video ref

至少包含stable object identity、verified media type、bytes、duration/dimensions/codecs的safe metadata和provenance。不得包含provider temporary download URL、credential、Browser object URL。

## 5. Commit ordering

```text
Provider video result
→ bounded/verified download or bytes
→ durable video save
→ stable VideoAssetRef
→ Canvas completed/output event
```

保存失败不能commit completed output。

## 6. Read / Range / Auth

Video通常需要Range/streaming；读取接口必须：

- session/Canvas/history authorization-aware；
-支持 bounded range；
-正确 content type/length/range semantics；
- attachment/video id不是bearer authorization；
-避免把 provider origin URL直接暴露 Browser。

## 7. Image-to-video input

输入图片使用 N17 stable official Attachment-backed ref；N15验证 availability，N22 Provider adapter读取并编码。

## 8. Tests

- durable save/read；
- range requests；
- cross-session read deny；
- save failure no completed event；
- refresh/replay video ref；
- image-to-video stable image input；
- large video memory/buffering bounds；
- no temp URL/secret in Session/Browser durable DTO。

## 9. 验收

Mock video输出完成 durable save→Canvas output→Minimal/Editor playback，且Range/auth/restart测试通过后 ACCEPTED。
