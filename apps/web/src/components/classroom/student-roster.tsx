import { useCallback, useEffect, useState } from "react";
import { EnrollmentStatus } from "@quiz/shared";
import { Button } from "@/components/ui/button.js";
import { FormAlert } from "@/components/ui/field.js";
import {
  approveEnrollment,
  getClassroomEnrollments,
  removeEnrollment,
} from "@/lib/classroom-api.js";
import { getErrorMessage } from "@/lib/forms.js";
import type { Enrollment } from "@/lib/schemas.js";

export function StudentRoster({ classroomId }: { classroomId: string }) {
  const [enrollments, setEnrollments] = useState<readonly Enrollment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getClassroomEnrollments(classroomId);
      setEnrollments(rows);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApprove = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await approveEnrollment(classroomId, userId);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const onRemove = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await removeEnrollment(classroomId, userId);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div data-testid="student-roster" className="mt-3 border-t border-gray-200 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Học sinh đã tham gia</h3>
        <Button
          type="button"
          variant="secondary"
          data-testid="roster-refresh"
          disabled={loading || busyUserId !== null}
          onClick={() => void load()}
        >
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>
      {error ? <FormAlert message={error} /> : null}
      {loading ? <p className="text-sm opacity-70">Đang tải danh sách…</p> : null}
      {!loading && enrollments.length === 0 ? (
        <p className="text-sm opacity-70">Chưa có học sinh nào.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {enrollments.map((enrollment) => (
          <li
            key={enrollment.id}
            data-testid="roster-row"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span>
              {enrollment.displayName} ({enrollment.email})
            </span>
            <span data-testid="roster-status" className="opacity-70">
              {enrollment.status === EnrollmentStatus.APPROVED ? "Đã duyệt" : "Chờ duyệt"}
            </span>
            {enrollment.status === EnrollmentStatus.PENDING ? (
              <Button
                type="button"
                aria-label={`Duyệt ${enrollment.displayName}`}
                disabled={busyUserId === enrollment.userId}
                onClick={() => void onApprove(enrollment.userId)}
              >
                Duyệt
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              aria-label={`Xóa ${enrollment.displayName}`}
              disabled={busyUserId === enrollment.userId}
              onClick={() => void onRemove(enrollment.userId)}
            >
              Xóa
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
