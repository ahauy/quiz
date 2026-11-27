import { Link } from "react-router-dom";

export function TeacherPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Khu vực giáo viên</h1>
      <p className="text-sm opacity-70">Chỉ tài khoản Giáo viên mới truy cập được trang này.</p>
      <p data-testid="teacher-area" className="text-sm">Nội dung dành cho giáo viên.</p>
      <nav aria-label="Khu vực giáo viên" className="flex flex-col items-start gap-1">
        <Link to="/teacher/exams" className="text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          Quản lý đề thi
        </Link>
        <Link to="/teacher/questions" className="text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          Ngân hàng câu hỏi
        </Link>
        <Link to="/teacher/classrooms" className="text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          Quản lý lớp học
        </Link>
      </nav>
    </section>
  );
}
