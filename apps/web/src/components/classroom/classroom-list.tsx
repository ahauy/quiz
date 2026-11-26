import type { ReactNode } from "react";
import type { Classroom } from "@/lib/schemas.js";

interface ClassroomListProps {
  classrooms: readonly Classroom[];
  emptyMessage?: string | undefined;
  renderExtra?: ((classroom: Classroom) => ReactNode) | undefined;
}

export function ClassroomList({
  classrooms,
  emptyMessage = "Chưa có lớp học nào.",
  renderExtra,
}: ClassroomListProps) {
  return (
    <div data-testid="classroom-list" className="flex flex-col gap-3">
      {classrooms.length === 0 ? <p className="text-sm opacity-70">{emptyMessage}</p> : null}
      {classrooms.map((classroom) => (
        <article
          key={classroom.id}
          data-testid="classroom-item"
          className="rounded-md border border-gray-300 p-3"
        >
          <h2 className="font-medium">{classroom.name}</h2>
          <p className="text-sm">
            Mã lớp: <span data-testid="classroom-code">{classroom.code}</span>
          </p>
          {renderExtra?.(classroom)}
        </article>
      ))}
    </div>
  );
}
