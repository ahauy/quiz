import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExamStatus, type Page, type TeacherExamListItem } from "@quiz/shared";
import { listTeacherExams } from "@/features/exams/api.js";
import { examRefreshDelayMs, readExamServerTime } from "@/features/exams/server-time.js";

const stateLabels: Record<ExamStatus, string> = { DRAFT: "Nháp", SCHEDULED: "Chờ mở", OPEN: "Đang mở", CLOSED: "Đã đóng" };
const filterOptions: { value: ExamStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: ExamStatus.DRAFT, label: "Nháp" },
  { value: ExamStatus.SCHEDULED, label: "Chờ mở" },
  { value: ExamStatus.OPEN, label: "Đang mở" },
  { value: ExamStatus.CLOSED, label: "Đã đóng" },
];
const maxExamRefreshIntervalMs = 2_147_000_000;
function ExamStatusFilter({ value, onChange }: { value: ExamStatus | "ALL"; onChange: (value: ExamStatus | "ALL") => void }) {
  return <label htmlFor="exam-state-filter" className="flex items-center gap-2 text-sm">Lọc trạng thái<select id="exam-state-filter" value={value} onChange={(event) => onChange(event.target.value as ExamStatus | "ALL")} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
function ExamTable({ exams }: { exams: readonly TeacherExamListItem[] }) {
  if (exams.length === 0) return <p className="rounded-md border border-gray-300 p-4 text-sm text-gray-600">Chưa có đề thi trong trạng thái này.</p>;
  return <ul className="divide-y divide-gray-200 rounded-md border border-gray-300" aria-label="Danh sách đề thi">{exams.map((exam) => <li key={exam.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><Link to={`/teacher/exams/${exam.id}`} className="break-words font-medium text-blue-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{exam.title}</Link><p className="mt-1 text-sm text-gray-600">{stateLabels[exam.state]} · {exam.questionCount} câu{exam.opensAt ? ` · Mở ${formatDate(exam.opensAt)}` : ""}</p></div><Link to={`/teacher/exams/${exam.id}`} aria-label={`Mở đề ${exam.title}`} className="rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Quản lý</Link></li>)}</ul>;
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}
function useTeacherExamList(filter: ExamStatus | "ALL") {
  const [page, setPage] = useState<Page<TeacherExamListItem> | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [boundaryRead, setBoundaryRead] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    void listTeacherExams({ ...(filter === "ALL" ? {} : { state: filter }), ...(cursor ? { cursor } : {}) }).then(({ data, headers }) => {
      if (id === requestId.current) { setPage(data); setServerTime(readExamServerTime(headers)); }
    }).catch(() => { if (id === requestId.current) setError("Không thể tải danh sách đề thi."); }).finally(() => { if (id === requestId.current) setLoading(false); });
  }, [boundaryRead, cursor, filter]);
  const refresh = useCallback(() => setBoundaryRead((current) => current + 1), []);
  useEffect(() => {
    if (!serverTime || !page) return;
    const boundary = page.items.flatMap((exam) => exam.state === "SCHEDULED" && exam.opensAt ? [exam.opensAt] : exam.state === "OPEN" && exam.closesAt ? [exam.closesAt] : []).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    if (!boundary) return;
    const delay = examRefreshDelayMs(serverTime, boundary);
    if (delay === null) return;
    const timer = window.setTimeout(refresh, Math.min(delay, maxExamRefreshIntervalMs));
    return () => window.clearTimeout(timer);
  }, [page, refresh, serverTime]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { page, cursor, loading, error, setCursor, reload: () => { setCursor(undefined); setPage(null); refresh(); } };
}
function ListState({ loading, error, reload }: { loading: boolean; error: string | null; reload: () => void }) {
  if (loading && error === null) return <div className="flex flex-col gap-3" aria-busy="true"><p aria-live="polite" className="text-sm text-gray-600">Đang tải danh sách đề thi…</p><div aria-hidden="true" className="flex min-h-16 flex-col justify-center gap-2 rounded-md border border-gray-300 p-4"><span className="h-3 w-2/3 rounded bg-gray-200" /><span className="h-3 w-1/3 rounded bg-gray-200" /></div></div>;
  if (!error) return null;
  return <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3"><p role="alert" className="text-sm text-red-800">{error}</p><button type="button" onClick={reload} className="rounded-md border border-red-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">Thử tải lại</button></div>;
}
function ListPager({ page, cursor, setCursor }: { page: Page<TeacherExamListItem> | null; cursor: string | undefined; setCursor: (cursor: string | undefined) => void }) {
  return <nav aria-label="Phân trang đề thi" className="flex flex-wrap items-center gap-3"><button type="button" disabled={!cursor} onClick={() => setCursor(undefined)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang đầu</button><button type="button" disabled={!page?.nextCursor} onClick={() => setCursor(page?.nextCursor ?? undefined)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang tiếp</button></nav>;
}
export function TeacherExamsPage() {
  const [filter, setFilter] = useState<ExamStatus | "ALL">("ALL");
  const list = useTeacherExamList(filter);
  function changeFilter(value: ExamStatus | "ALL") { setFilter(value); list.setCursor(undefined); }
  const waitingForFirstRead = list.loading && list.page === null;
  const failedFirstRead = list.error !== null && list.page === null;
  return <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Đề thi của tôi</h1><p className="mt-1 text-sm text-gray-600">Quản lý bản nháp, lịch thi và lớp được giao.</p></div><Link to="/teacher/exams/new" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">Tạo đề thi</Link></header><ExamStatusFilter value={filter} onChange={changeFilter} /><ListState loading={list.loading} error={list.error} reload={list.reload} />{!waitingForFirstRead && !failedFirstRead ? <div aria-busy={list.loading && list.page !== null}><ExamTable exams={list.page?.items ?? []} /></div> : null}<ListPager page={list.page} cursor={list.cursor} setCursor={list.setCursor} /></main>;
}
