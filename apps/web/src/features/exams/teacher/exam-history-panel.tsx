import { useEffect, useState } from "react";
import type { ExamAction } from "@quiz/shared";
import type { DraftEditorState } from "./use-draft-editor.js";

interface Props { state: DraftEditorState; onLoad: (append?: boolean) => Promise<void>; version?: string }
function actionLabel(action: ExamAction): string {
  if (action.type === "PUBLISHED") return `Đã xuất bản · ${action.classroomIds.length} lớp`;
  if (action.type === "WITHDRAWN") return "Đã thu hồi";
  const added = action.addedClassroomIds.length;
  const removed = action.removedClassroomIds.length;
  return `Đã thay đổi giao lớp · thêm ${added}, bỏ ${removed}`;
}
function HistoryRow({ action }: { action: ExamAction }) {
  const when = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(action.at));
  return <li className="flex flex-col gap-1 border-b border-gray-200 py-3 last:border-b-0"><p className="text-sm font-medium">{actionLabel(action)}</p><p className="text-xs text-gray-600">{when} · Người thực hiện: {action.actorId}</p></li>;
}
function HistoryBody({ actions }: { actions: readonly ExamAction[] }) {
  if (actions.length === 0) return <p className="rounded-md border border-gray-300 p-3 text-sm text-gray-600">Chưa có lịch sử thao tác.</p>;
  return <ol className="divide-y divide-gray-200 rounded-md border border-gray-300 px-3">{actions.map((action) => <HistoryRow key={action.id} action={action} />)}</ol>;
}
export function ExamHistoryPanel({ state, onLoad, version }: Props) {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!state.exam) return;
    setLoading(true); void onLoad(false).finally(() => setLoading(false));
  }, [state.exam?.id, onLoad, version, state.historyRestartId]);
  async function loadMore() { setLoading(true); try { await onLoad(true); } finally { setLoading(false); } }
  const initialState = loading && state.history.length === 0 ? <p aria-live="polite" aria-busy="true" className="rounded-md border border-gray-300 p-3 text-sm text-gray-600">Đang tải lịch sử…</p> : state.readError && state.history.length === 0 ? <p role="alert" className="rounded-md border border-gray-300 p-3 text-sm text-red-700">{state.readError}</p> : <HistoryBody actions={state.history} />;
  return <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Lịch sử đề</h2>{initialState}{state.historyCursor && <button type="button" disabled={loading} onClick={() => void loadMore()} className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Tải thêm lịch sử</button>}</section>;
}
