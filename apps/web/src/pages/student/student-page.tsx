import { Link } from "react-router-dom";

export function StudentPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Khu vực học sinh</h1>
      <p className="text-sm opacity-70">Chỉ tài khoản Học sinh mới truy cập được trang này.</p>
      <p data-testid="student-area" className="text-sm">Nội dung dành cho học sinh.</p>
      <Link to="/student/classrooms" className="text-sm underline">Lớp học đã tham gia</Link>
      <Link to="/student/join" className="text-sm underline">Tham gia lớp học bằng mã</Link>
    </section>
  );
}
