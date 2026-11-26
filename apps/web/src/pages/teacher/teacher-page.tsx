export function TeacherPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Khu vực giáo viên</h1>
      <p className="text-sm opacity-70">Chỉ tài khoản Giáo viên mới truy cập được trang này.</p>
      <p data-testid="teacher-area" className="text-sm">Nội dung dành cho giáo viên.</p>
    </section>
  );
}
