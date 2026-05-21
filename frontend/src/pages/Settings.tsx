import { useDataStatus } from "@/hooks/useDashboard";
import {
  useCancelTask,
  useCleanupTasks,
  useDeleteTask,
  useInitData,
  useTasks,
  useUpdateData,
} from "@/hooks/useDataMgmt";
import { useSectorSync, useSectorSyncStatus } from "@/hooks/useSectors";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useEffect, useRef } from "react";

export default function Settings() {
  const { data: status } = useDataStatus();
  const { data: tasks } = useTasks();
  const initMutation = useInitData();
  const updateMutation = useUpdateData();
  const cancelMutation = useCancelTask();
  const deleteMutation = useDeleteTask();
  const cleanupMutation = useCleanupTasks();
  const { data: sectorStatus } = useSectorSyncStatus();
  const sectorSyncMutation = useSectorSync();
  const { messages, isConnected, clear } = useWebSocket("/ws/logs");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">系统设置</h2>

      {/* Data Status */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="font-semibold">数据状态</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">数据文件: </span>
            <span className="font-mono">{status?.total_files ?? 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">状态: </span>
            <span
              className={
                status?.is_busy ? "text-yellow-500" : "text-green-500"
              }
            >
              {status?.is_busy ? "运行中" : "空闲"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">最后任务: </span>
            <span>{status?.last_task_status ?? "无"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">WebSocket: </span>
            <span className={isConnected ? "text-green-500" : "text-red-500"}>
              {isConnected ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="font-semibold">数据操作</h3>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => initMutation.mutate()}
            disabled={status?.is_busy || initMutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {initMutation.isPending ? "启动中..." : "全量初始化"}
          </button>
          <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={status?.is_busy || updateMutation.isPending}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {updateMutation.isPending ? "启动中..." : "增量更新"}
          </button>
        </div>
        {(initMutation.error || updateMutation.error) && (
          <p className="text-sm text-red-500">
            {(initMutation.error || updateMutation.error)?.message}
          </p>
        )}
      </div>

      {/* Sector Data */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="font-semibold">板块数据</h3>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">概念板块: </span>
            <span className="font-mono">{sectorStatus?.concept_count ?? 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">最后同步: </span>
            <span>
              {sectorStatus?.synced_at
                ? new Date(sectorStatus.synced_at).toLocaleString()
                : "未同步"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => sectorSyncMutation.mutate()}
          disabled={sectorStatus?.is_syncing || sectorSyncMutation.isPending}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {sectorStatus?.is_syncing ? "同步中..." : "同步板块数据"}
        </button>
        {sectorSyncMutation.error && (
          <p className="text-sm text-red-500">{sectorSyncMutation.error.message}</p>
        )}
      </div>

      {/* Task History */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">任务历史</h3>
          <button
            type="button"
            onClick={() => cleanupMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            清理残留任务
          </button>
        </div>
        {tasks && tasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">类型</th>
                  <th className="text-left p-2">状态</th>
                  <th className="text-left p-2">进度</th>
                  <th className="text-left p-2">消息</th>
                  <th className="text-left p-2">时间</th>
                  <th className="text-left p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2">{t.task_type}</td>
                    <td className="p-2">
                      <span
                        className={
                          t.status === "done"
                            ? "text-green-500"
                            : t.status === "failed"
                              ? "text-red-500"
                              : t.status === "running"
                                ? "text-yellow-500"
                                : ""
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-2 font-mono">
                      {t.progress}/{t.total}
                    </td>
                    <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                      {t.message ?? "-"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {t.status === "running" && (
                          <button
                            type="button"
                            onClick={() => cancelMutation.mutate(t.id)}
                            className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                          >
                            取消
                          </button>
                        )}
                        {t.status !== "running" && (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(t.id)}
                            className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无任务记录</p>
        )}
      </div>

      {/* Real-time Logs */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">实时日志</h3>
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            清空
          </button>
        </div>
        <div className="bg-black/90 text-green-400 rounded-md p-3 h-64 overflow-y-auto font-mono text-xs">
          {messages.length === 0 ? (
            <p className="text-muted-foreground">等待日志...</p>
          ) : (
            messages.map((msg, i) => (
              <div key={`${i}-${msg.slice(0, 20)}`} className="py-0.5">
                {msg}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
