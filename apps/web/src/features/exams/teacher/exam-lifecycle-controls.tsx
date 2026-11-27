import type { ExamStatus, TeacherExamDetail } from "@quiz/shared";

type LifecycleAction = "publish" | "withdraw" | "closeEarly";
interface Props { exam: TeacherExamDetail; pending: boolean; locked?: boolean; onAction: (action: LifecycleAction) => Promise<boolean>; onDelete: () => Promise<boolean>; onDeleted: () => void }
const stateLabels: Record<ExamStatus, string> = { DRAFT: "Nháp", SCHEDULED: "Chờ mở", OPEN: "Đang mở", CLOSED: "Đã đóng" };
function ActionButton({ label, action, disabled, onAction }: { label: string; action: LifecycleAction; disabled: boolean; onAction: Props["onAction"] }) {
  return <button type="button" disabled={disabled} onClick={() => void onAction(action)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{label}</button>;
}
function DeleteButton({ pending, locked, onDelete, onDeleted }: Pick<Props, "pending" | "locked" | "onDelete" | "onDeleted">) {
  async function remove() {
    if (!window.confirm("Xóa bản nháp chưa từng xuất bản? Thao tác này không thể hoàn tác.")) return;
    if (await onDelete()) onDeleted();
  }
  return <button type="button" disabled={pending || locked} onClick={() => void remove()} className="rounded-md border border-red-500 px-3 py-2 text-sm text-red-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">Xóa nháp</button>;
}
export function ExamLifecycleControls(props: Props) {
  const { exam, pending, locked = false, onAction, onDelete, onDeleted } = props;
  const editableDraft = exam.state === "DRAFT";
  return <section className="flex flex-wrap items-center gap-2 rounded-md border border-gray-300 p-3" aria-label="Trạng thái và thao tác đề"><p className="mr-auto text-sm">Trạng thái: <strong>{stateLabels[exam.state]}</strong></p>{editableDraft && <ActionButton label="Xuất bản" action="publish" disabled={pending || locked} onAction={onAction} />}{exam.state === "SCHEDULED" && <ActionButton label="Thu hồi" action="withdraw" disabled={pending || locked} onAction={onAction} />}{exam.state === "OPEN" && <ActionButton label="Đóng sớm" action="closeEarly" disabled={pending || locked} onAction={onAction} />}{editableDraft && !exam.everPublished && <DeleteButton pending={pending} locked={locked} onDelete={onDelete} onDeleted={onDeleted} />}</section>;
}
