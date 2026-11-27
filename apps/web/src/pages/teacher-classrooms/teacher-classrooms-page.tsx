import { useCallback, useEffect, useState } from "react";
import {
  ClassroomList,
  CreateClassroomDialog,
  StudentRoster,
} from "@/components/classroom";
import { FormAlert } from "@/components/ui/field.js";
import { getClassrooms } from "@/lib/classroom-api.js";
import { getErrorMessage } from "@/lib/forms.js";
import type { Classroom } from "@/lib/schemas.js";

export function TeacherClassroomsPage() {
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
    <section className="flex flex-col gap-4" data-testid="teacher-classrooms-page">
      <h1 className="text-xl font-semibold">Lớp học của tôi</h1>
      <CreateClassroomDialog
        onCreated={(classroom) => setClassrooms((current) => [classroom, ...current])}
      />
      {error ? <FormAlert message={error} /> : null}
      {loading ? (
        <div data-testid="classroom-list-skeleton" className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-md border border-gray-200 bg-gray-100 motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        <ClassroomList
          classrooms={classrooms}
          renderExtra={(classroom) => <StudentRoster classroomId={classroom.id} />}
        />
      )}
    </section>
  );
}
