import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Role } from "@quiz/shared";
import { useAuthStore } from "@/stores/auth-store.js";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { OAuthCallbackPage } from "@/pages/oauth-callback";
import { ProfilePage } from "@/pages/profile";
import { TeacherPage } from "@/pages/teacher";
import { StudentPage } from "@/pages/student";
import { TeacherClassroomsPage } from "@/pages/teacher-classrooms";
import { StudentClassroomsPage } from "@/pages/student-classrooms";
import { JoinByCodePage } from "@/pages/join-by-code";

interface GuardProps {
  allow: readonly Role[];
  children: ReactNode;
}

export function RoleGuard({ allow, children }: GuardProps) {
  const role = useAuthStore((state) => state.role);
  if (!role) {
    return <Navigate to="/login" replace />;
  }
  if (!allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route
        path="/profile"
        element={
          <RoleGuard allow={[Role.TEACHER, Role.STUDENT]}>
            <ProfilePage />
          </RoleGuard>
        }
      />
      <Route
        path="/teacher"
        element={
          <RoleGuard allow={[Role.TEACHER]}>
            <TeacherPage />
          </RoleGuard>
        }
      />
      <Route
        path="/student"
        element={
          <RoleGuard allow={[Role.STUDENT]}>
            <StudentPage />
          </RoleGuard>
        }
      />
      <Route
        path="/teacher/classrooms"
        element={
          <RoleGuard allow={[Role.TEACHER]}>
            <TeacherClassroomsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/student/classrooms"
        element={
          <RoleGuard allow={[Role.STUDENT]}>
            <StudentClassroomsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/student/join"
        element={
          <RoleGuard allow={[Role.STUDENT]}>
            <JoinByCodePage />
          </RoleGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
