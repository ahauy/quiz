const STORAGE_KEY = "quiz.oauth.teacherCode";

// teacherCode entered before redirecting to Google must survive the full-page
// consent round-trip; sessionStorage is scoped to the tab and cleared on take.
export function saveOAuthTeacherCode(code: string): void {
  if (code) {
    sessionStorage.setItem(STORAGE_KEY, code);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function takeOAuthTeacherCode(): string | undefined {
  const value = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  return value ?? undefined;
}
