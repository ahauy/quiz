import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClassroomList } from "@/components/classroom";
import { Button } from "@/components/ui/button.js";
import { FormAlert } from "@/components/ui/field.js";
import { getClassrooms } from "@/lib/classroom-api.js";
import { getErrorMessage } from "@/lib/forms.js";
import type { Classroom } from "@/lib/schemas.js";

export function StudentClassroomsPage() {
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<readonly Classroom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await getClassrooms();
      setClassrooms(rows);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4" data-testid="student-classrooms-page">
      <h1 className="text-xl font-semibold">Lớp học đã tham gia</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => navigate("/student/join")}>
          Tham gia lớp học
        </Button>
        <Link to="/student" className="text-sm underline">Về khu vực học sinh</Link>
      </div>
      {error ? <FormAlert message={error} /> : null}
      {loading ? (
        <div data-testid="classroom-list-skeleton" className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-md border border-gray-200 bg-gray-100 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <ClassroomList
          classrooms={classrooms}
          emptyMessage="Bạn chưa tham gia lớp học nào được giáo viên duyệt."
        />
      )}
    </section>
  );
}
