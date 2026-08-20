/** `canvas` namespace dictionaries for the Canvas conversation view. */

export const NS = 'canvas'
export const zh = {
  'view.canvas': '画布', 'mode.minimal': '极简', 'mode.editor': '编辑', 'mode.aria': '画布模式',
  'save.saved': '已保存', 'save.saving': '保存中', 'save.conflict': '存在冲突', 'save.offline': '离线', 'save.save-failed': '保存失败',
  'projection.loading': '正在同步画布…',
  'state.EMPTY.title': '开始创作', 'state.EMPTY.body': '在下方输入框描述你想生成或修改的图片或视频。',
  'state.READY.title': '工作流已就绪', 'state.READY.body': '当前工作流可以运行。',
  'state.DIRTY_READY.title': '工作流有未运行的修改', 'state.DIRTY_READY.body': '正在保留上一次结果；重新运行后会生成与当前工作流一致的新结果。',
  'state.RUNNING.title': '正在生成', 'state.RUNNING.body': '当前运行正在处理媒体工作流。',
  'state.COMPLETED.title': '生成完成', 'state.COMPLETED.body': '结果来自当前工作流版本。',
  'state.FAILED.title': '生成失败', 'state.FAILED.body': '本次运行未完成，可以重试。',
  'state.CANCELLED.title': '已取消', 'state.CANCELLED.body': '本次运行已取消，可以重新生成。',
  'state.INTERRUPTED.title': '运行被中断', 'state.INTERRUPTED.body': 'Host 重启或运行恢复失败时会进入此状态，可以重试。',
  'action.run': '运行', 'action.retry': '重试', 'action.cancel': '取消', 'action.unavailable': '运行控制将在媒体执行能力接入后启用',
  'minimal.output': '当前结果', 'minimal.emptyOutput': '还没有生成结果', 'asset.image': '图片结果', 'asset.video': '视频结果', 'asset.primary': '主要结果',
  'feature.unavailable': '当前部署不可用', 'editor.noWorkflow': '当前没有工作流',
  'editor.library': '节点库', 'editor.libraryCurrent': '当前类型', 'editor.libraryCatalogPending': '这里只复用当前工作流已有类型；完整已安装节点目录等待 client-safe catalog Remote。',
  'editor.inspector': '检查器', 'editor.inspectorEmpty': '选择一个节点后编辑名称和配置。', 'editor.nodeName': '节点名称', 'editor.nodeConfig': '配置 JSON', 'editor.autosaveHint': '停止输入 450ms 后自动保存。',
  'editor.validationOk': '配置有效', 'editor.validationIssue': '需要处理', 'editor.validationRevision': '工作流版本已变化，请先处理冲突。', 'editor.validationConflict': '该草稿基于旧版本，未自动覆盖最新工作流。',
  'editor.undo': '撤销', 'editor.redo': '重做', 'editor.copy': '复制', 'editor.paste': '粘贴', 'editor.delete': '删除', 'editor.shortcuts': '快捷键：⌘/Ctrl+A 全选，C/V 复制粘贴，Z 撤销，Shift+Z 重做，Delete 删除。',
  'editor.commandEditNode': '编辑节点', 'editor.commandPaste': '粘贴节点', 'editor.commandDelete': '删除选择', 'editor.commandAddNode': '添加节点', 'editor.copySuffix': '副本',
} as const

export const en: Record<CanvasKey, string> = {
  'view.canvas':'Canvas','mode.minimal':'Minimal','mode.editor':'Editor','mode.aria':'Canvas mode',
  'save.saved':'Saved','save.saving':'Saving','save.conflict':'Conflict','save.offline':'Offline','save.save-failed':'Save failed',
  'projection.loading':'Syncing Canvas…',
  'state.EMPTY.title':'Start creating','state.EMPTY.body':'Describe the image or video you want to generate or edit in the composer below.',
  'state.READY.title':'Workflow ready','state.READY.body':'The current workflow is ready to run.',
  'state.DIRTY_READY.title':'Workflow has unrun changes','state.DIRTY_READY.body':'The previous result stays visible until you run the current workflow.',
  'state.RUNNING.title':'Generating','state.RUNNING.body':'The current media workflow run is in progress.',
  'state.COMPLETED.title':'Generation complete','state.COMPLETED.body':'The result matches the current workflow revision.',
  'state.FAILED.title':'Generation failed','state.FAILED.body':'This run did not complete and can be retried.',
  'state.CANCELLED.title':'Cancelled','state.CANCELLED.body':'This run was cancelled and can be generated again.',
  'state.INTERRUPTED.title':'Run interrupted','state.INTERRUPTED.body':'A Host restart or failed recovery can interrupt a run; it can be retried.',
  'action.run':'Run','action.retry':'Retry','action.cancel':'Cancel','action.unavailable':'Run controls enable when media execution is connected',
  'minimal.output':'Current result','minimal.emptyOutput':'No generated result yet','asset.image':'Image result','asset.video':'Video result','asset.primary':'Primary result',
  'feature.unavailable':'Unavailable in this deployment','editor.noWorkflow':'No workflow yet',
  'editor.library':'Node library','editor.libraryCurrent':'Current types','editor.libraryCatalogPending':'This list reuses types already present in the workflow; the full installed catalog waits for a client-safe catalog Remote.',
  'editor.inspector':'Inspector','editor.inspectorEmpty':'Select a node to edit its name and config.','editor.nodeName':'Node name','editor.nodeConfig':'Config JSON','editor.autosaveHint':'Autosaves 450ms after typing stops.',
  'editor.validationOk':'Config valid','editor.validationIssue':'Needs attention','editor.validationRevision':'The workflow revision changed; resolve the conflict first.','editor.validationConflict':'This draft is based on an older revision and did not overwrite the latest workflow.',
  'editor.undo':'Undo','editor.redo':'Redo','editor.copy':'Copy','editor.paste':'Paste','editor.delete':'Delete','editor.shortcuts':'Shortcuts: ⌘/Ctrl+A select all, C/V copy/paste, Z undo, Shift+Z redo, Delete removes selection.',
  'editor.commandEditNode':'Edit node','editor.commandPaste':'Paste nodes','editor.commandDelete':'Delete selection','editor.commandAddNode':'Add node','editor.copySuffix':'copy',
}
export type CanvasKey = keyof typeof zh
