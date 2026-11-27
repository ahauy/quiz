import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ExamAssignment } from "@quiz/shared";
import { ApiError } from "@/lib/api-client.js";
import { getClassrooms } from "@/lib/classroom-api.js";
import type { Classroom } from "@/lib/schemas.js";
import { listExamAssignments, readExamETag } from "../api.js";

type Props = { examId: string; locked: boolean; version: string; onSave: (addClassroomIds: string[], removeClassroomIds: string[], version: string) => Promise<boolean>; onVersionMismatch: () => void };
function assignmentError(): string { return "Không thể tải danh sách lớp được giao."; }
function isRejectedCursor(error: unknown): boolean {
  return error instanceof ApiError && error.body.code === "VALIDATION_ERROR" && Array.isArray(error.body.details)
    && error.body.details.some((detail) => detail !== null && typeof detail === "object" && "field" in detail && detail.field === "cursor");
}
async function readAllAssignments(examId: string, expectedVersion: string): Promise<ExamAssignment[]> {
  const all: ExamAssignment[] = [];
  let cursor: string | undefined;
  do {
    const page = await listExamAssignments(examId, { ...(cursor ? { cursor } : {}), pageSize: 100 });
    if (readExamETag(page.headers, true) !== expectedVersion) throw new Error("Assignment page belongs to a different exam version.");
    all.push(...page.data.items);
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor);
  return all;
}
type AssignmentLoaderSetters = {
  setClasses: Dispatch<SetStateAction<Classroom[]>>;
  setAssignments: Dispatch<SetStateAction<ExamAssignment[]>>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoadedVersion: Dispatch<SetStateAction<string | null>>;
};
function useAssignmentLoader(examId: string, version: string, onVersionMismatch: () => void, assignmentsRef: MutableRefObject<ExamAssignment[]>, selectedRef: MutableRefObject<Set<string>>, setters: AssignmentLoaderSetters) {
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setters.setLoading(true); setters.setError(null); setters.setLoadedVersion(null);
    void Promise.all([getClassrooms(), readAllAssignments(examId, version)]).then(([classes, assignments]) => {
      if (id !== requestId.current) return;
      const previous = new Set(assignmentsRef.current.map((item) => item.classroomId));
      const additions = [...selectedRef.current].filter((classroomId) => !previous.has(classroomId));
      const removals = [...previous].filter((classroomId) => !selectedRef.current.has(classroomId));
      const selected = new Set(assignments.map((item) => item.classroomId));
      for (const classroomId of additions) selected.add(classroomId);
      for (const classroomId of removals) selected.delete(classroomId);
      assignmentsRef.current = assignments; selectedRef.current = selected;
      setters.setClasses(classes); setters.setAssignments(assignments); setters.setSelected(selected); setters.setLoadedVersion(version);
    }).catch((cause) => {
      if (id !== requestId.current) return;
      setters.setError(assignmentError());
      if ((cause instanceof Error && cause.message.includes("different exam version")) || isRejectedCursor(cause)) onVersionMismatch();
    }).finally(() => { if (id === requestId.current) setters.setLoading(false); });
  }, [assignmentsRef, examId, onVersionMismatch, selectedRef, setters.setAssignments, setters.setClasses, setters.setError, setters.setLoadedVersion, setters.setLoading, setters.setSelected, version]);
}
export function ExamAssignmentEditor({ examId, locked, version, onSave, onVersionMismatch }: Props) {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const assignmentsRef = useRef(assignments);
  const selectedRef = useRef(selected);
  assignmentsRef.current = assignments;
  selectedRef.current = selected;
  useAssignmentLoader(examId, version, onVersionMismatch, assignmentsRef, selectedRef, { setClasses, setAssignments, setSelected, setLoading, setError, setLoadedVersion });
  function toggle(classroomId: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(classroomId)) next.delete(classroomId); else next.add(classroomId); selectedRef.current = next; return next; });
  }
  async function save() {
    const baseVersion = loadedVersion;
    if (!baseVersion || baseVersion !== version || locked || loading) return;
    const before = new Set(assignments.map((item) => item.classroomId));
    const adds = [...selected].filter((id) => !before.has(id));
    const removes = [...before].filter((id) => !selected.has(id));
    if (adds.length + removes.length === 0) return;
    setSaving(true);
    if (await onSave(adds, removes, baseVersion)) {
      const names = new Map(classes.map((item) => [item.id, item.name]));
      setAssignments([...selected].map((classroomId) => ({ classroomId, name: names.get(classroomId) ?? assignments.find((item) => item.classroomId === classroomId)?.name ?? "Lớp học" })));
    }
    setSaving(false);
  }
  const currentIds = new Set(assignments.map((item) => item.classroomId));
  const controlsLocked = locked || saving || loading || loadedVersion !== version;
  return <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Giao lớp</h2><p className="text-sm text-gray-600">Chọn các lớp thuộc quyền quản lý của bạn. Thay đổi được lưu cùng một lần.</p>{loading && assignments.length === 0 && <p aria-live="polite">Đang tải lớp học…</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<ul className="grid gap-2 sm:grid-cols-2">{classes.map((classroom) => <li key={classroom.id}><label className="flex items-center gap-2 rounded-md border border-gray-300 p-3 text-sm"><input type="checkbox" checked={selected.has(classroom.id)} disabled={controlsLocked} onChange={() => toggle(classroom.id)} />{classroom.name}</label></li>)}</ul>{assignments.filter((item) => !classes.some((classroom) => classroom.id === item.classroomId)).map((item) => <label key={item.classroomId} className="flex items-center gap-2 rounded-md border border-gray-300 p-3 text-sm"><input type="checkbox" checked={selected.has(item.classroomId)} disabled={controlsLocked} onChange={() => toggle(item.classroomId)} />{item.name}</label>)}<p className="text-sm" aria-live="polite">Đã chọn {selected.size} lớp.</p><button type="button" disabled={controlsLocked || selected.size === 0 && currentIds.size === 0 || [...selected].every((id) => currentIds.has(id)) && [...currentIds].every((id) => selected.has(id))} onClick={() => void save()} className="self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-50">{saving ? "Đang lưu lớp…" : "Lưu giao lớp"}</button></section>;
}
