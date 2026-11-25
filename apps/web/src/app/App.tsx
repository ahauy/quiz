import { Button } from "../components/ui/button.js";

export function App() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Web thi trắc nghiệm</h1>
      <p className="mt-2 text-sm opacity-70">Sprint 0 shell — sẵn sàng cho US-AUTH-001.</p>
      <div className="mt-4 flex gap-2">
        <Button>Giáo viên</Button>
        <Button variant="secondary">Học sinh</Button>
      </div>
    </main>
  );
}
