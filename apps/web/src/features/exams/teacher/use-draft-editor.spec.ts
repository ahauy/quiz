import { describe, expect, it } from "vitest";
import type { TeacherExamDetail } from "@quiz/shared";
import {
  createDraftEditorState,
  draftEditorReducer,
  draftSettingsPayload,
  settingsFromExam,
  validateDraftSettings,
  type DraftEditorAction,
} from "./use-draft-editor.js";
import { strongExamETag } from "../api.js";

const exam: TeacherExamDetail = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  title: "Đề ban đầu",
  state: "DRAFT",
  questionCount: "0",
  opensAt: null,
  closesAt: null,
  durationMinutes: null,
  maxAttempts: null,
  allowAnswerReview: null,
  passwordRequired: false,
  earlyClosedAt: null,
  everPublished: false,
  lastMutationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
};

function reduce(action: DraftEditorAction) {
  return draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), action);
}

describe("draft editor state", () => {
  it("advances invalid-field focus only for a validation result, including repeated submits", () => {
    const initial = createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"'));
    const errors = { durationMinutes: "Thời lượng phải là số nguyên dương." };
    const invalid = draftEditorReducer(initial, { type: "validationFailed", errors });
    const edited = draftEditorReducer(invalid, { type: "settingChanged", field: "title", value: "Tiêu đề hợp lệ" });
    const repeated = draftEditorReducer(edited, { type: "validationFailed", errors });
    expect(invalid.fieldErrorFocusRequestId).toBe(1);
    expect(edited.fieldErrorFocusRequestId).toBe(1);
    expect(repeated.fieldErrorFocusRequestId).toBe(2);
  });

  it("validates numeric and empty secret inputs before a write can be dispatched", () => {
    const settings = { ...createDraftEditorState(exam).settings, durationMinutes: "1.5", maxAttempts: "0", passwordMode: "set" as const, passwordValue: "" };
    expect(validateDraftSettings(settings)).toMatchObject({
      durationMinutes: "Thời lượng phải là số nguyên dương.",
      maxAttempts: "Số lượt làm bài phải là số nguyên dương.",
      passwordValue: "Nhập mật khẩu mới.",
    });
    expect(validateDraftSettings({ ...settings, durationMinutes: "", maxAttempts: "", passwordMode: "unchanged" })).toEqual({});
  });

  it("omits unchanged Vietnam schedule values from an unrelated settings save", () => {
    const timedExam = { ...exam, opensAt: "2026-11-27T02:30:12.345Z", closesAt: "2026-11-27T03:30:45.678Z" };
    const saved = settingsFromExam(timedExam);
    const edited = { ...saved, title: "Chỉ đổi tiêu đề" };
    expect(saved.opensAt).toBe("2026-11-27T09:30:12.345");
    expect(saved.closesAt).toBe("2026-11-27T10:30:45.678");
    expect(draftSettingsPayload(edited, saved)).toEqual({ title: "Chỉ đổi tiêu đề" });
  });
  it("displays and saves an unchanged early-year schedule without reparsing it", () => {
    const earlyExam = { ...exam, opensAt: "0001-01-02T00:00:00.000Z" };
    const saved = settingsFromExam(earlyExam);
    expect(saved.opensAt).toBe("0001-01-02T07:06:30.000");
    expect(validateDraftSettings({ ...saved, title: "Đổi tên" })).toEqual({});
    expect(draftSettingsPayload({ ...saved, title: "Đổi tên" }, saved)).toEqual({ title: "Đổi tên" });
  });
  it("preserves edited settings and their original validator after a definite rejection", () => {
    const edited = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), {
      type: "settingChanged",
      field: "title",
      value: "Đề mới",
    });
    const rejected = draftEditorReducer(edited, { type: "writeRejected", message: "Xung đột" });

    expect(rejected.settings.title).toBe("Đề mới");
    expect(rejected.formETag).toBe('"v1-1-DRAFT"');
    expect(rejected.dirty).toBe(true);
    expect(rejected.error).toBe("Xung đột");
  });

  it("advances a dirty form validator only for its own latest successful child action", () => {
    const edited = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), {
      type: "settingChanged",
      field: "title",
      value: "Chưa lưu",
    });
    const childExam = { ...exam, lastMutationId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
    const current = draftEditorReducer(edited, {
      type: "childWriteSucceeded",
      exam: childExam,
      etag: strongExamETag('"v1-2-DRAFT"'),
      serverTime: null,
      mutationId: childExam.lastMutationId,
    });
    expect(current.settings.title).toBe("Chưa lưu");
    expect(current.formETag).toBe('"v1-2-DRAFT"');
    expect(current.dirty).toBe(true);

    const superseded = draftEditorReducer(current, {
      type: "childWriteSucceeded",
      exam: { ...childExam, lastMutationId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" },
      etag: strongExamETag('"v1-3-DRAFT"'),
      serverTime: null,
      mutationId: childExam.lastMutationId,
    });
    expect(superseded.formETag).toBe('"v1-2-DRAFT"');
    expect(superseded.reviewRequired).toBe(true);
  });

  it("ignores stale detail responses instead of replacing the current editor", () => {
    const state = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), {
      type: "readStarted",
      requestId: 3,
    });
    const stale = draftEditorReducer(state, {
      type: "detailReadSucceeded",
      requestId: 2,
      exam: { ...exam, title: "Phản hồi cũ" },
      etag: strongExamETag('"v1-0-DRAFT"'),
      serverTime: null,
    });
    expect(stale.exam?.title).toBe("Đề ban đầu");
    expect(stale.etag).toBe('"v1-1-DRAFT"');
  });

  it("keeps a dirty form validator until the teacher explicitly adopts a reviewed read", () => {
    const base = createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"'));
    const edited = draftEditorReducer(base, { type: "settingChanged", field: "title", value: "Bản nhập cần giữ" });
    const refreshed = draftEditorReducer(edited, { type: "readStarted", requestId: 1 });
    const conflict = draftEditorReducer(refreshed, {
      type: "detailReadSucceeded",
      requestId: 1,
      exam: { ...exam, title: "Bản mới trên máy chủ" },
      etag: strongExamETag('"v1-2-DRAFT"'),
      serverTime: null,
    });
    expect(conflict.settings.title).toBe("Bản nhập cần giữ");
    expect(conflict.formETag).toBe('"v1-1-DRAFT"');
    expect(conflict.reviewRequired).toBe(true);

    const adopted = draftEditorReducer(conflict, { type: "acceptReviewedState" });
    expect(adopted.settings.title).toBe("Bản mới trên máy chủ");
    expect(adopted.formETag).toBe('"v1-2-DRAFT"');
    expect(adopted.dirty).toBe(false);
  });

  it("adopts a fresh base while keeping local settings and recalculates dirty state", () => {
    const base = createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"'));
    const edited = draftEditorReducer(base, { type: "settingChanged", field: "title", value: "Bản nhập cần giữ" });
    const reading = draftEditorReducer(edited, { type: "readStarted", requestId: 1 });
    const reviewed = draftEditorReducer(reading, {
      type: "detailReadSucceeded", requestId: 1, exam: { ...exam, title: "Tiêu đề mới" },
      etag: strongExamETag('"v1-2-DRAFT"'), serverTime: null,
    });
    const adopted = draftEditorReducer(reviewed, { type: "rebaseReviewedState" });
    expect(adopted.settings.title).toBe("Bản nhập cần giữ");
    expect(adopted.savedSettings.title).toBe("Tiêu đề mới");
    expect(adopted.formETag).toBe('"v1-2-DRAFT"');
    expect(adopted.dirty).toBe(true);
    expect(adopted.reviewRequired).toBe(false);
  });
  it("rebases only fields changed against the original baseline", () => {
    const original = { ...exam, durationMinutes: "30" };
    const base = createDraftEditorState(original, strongExamETag('"v1-1-DRAFT"'));
    const edited = draftEditorReducer(base, { type: "settingChanged", field: "title", value: "Bản nhập cục bộ" });
    const reading = draftEditorReducer(edited, { type: "readStarted", requestId: 1 });
    const reviewed = draftEditorReducer(reading, {
      type: "detailReadSucceeded", requestId: 1,
      exam: { ...exam, title: "Tiêu đề gốc", durationMinutes: "45" },
      etag: strongExamETag('"v1-2-DRAFT"'), serverTime: null,
    });
    const adopted = draftEditorReducer(reviewed, { type: "rebaseReviewedState" });
    expect(adopted.settings.title).toBe("Bản nhập cục bộ");
    expect(adopted.settings.durationMinutes).toBe("45");
    expect(adopted.savedSettings.durationMinutes).toBe("45");
    expect(draftSettingsPayload(adopted.settings, adopted.savedSettings)).toEqual({ title: "Bản nhập cục bộ" });
  });

  it("marks an ambiguous create 404 inconclusive and retires its identity", () => {
    const state = reduce({
      type: "createUnknown",
      draftId: exam.id,
      mutationId: exam.lastMutationId,
      title: "Đề cần tạo",
    });
    const absent = draftEditorReducer(state, { type: "createCheckNotFound" });
    expect(absent.createRecovery).toBe("new-intent-required");
    expect(absent.retiredCreateId).toBe(exam.id);
    expect(absent.settings.title).toBe("Đề cần tạo");
  });

  it("keeps the original unknown write available while comparing a newer canonical version", () => {
    const original = reduce({ type: "writeUnknownWithRetry", mutationId: exam.lastMutationId, draftId: exam.id, retry: { kind: "patch", ifMatch: strongExamETag('"v1-1-DRAFT"'), input: { op: "publish", mutationId: exam.lastMutationId } } });
    const compared = draftEditorReducer(original, { type: "writeNeedsReview", exam: { ...exam, lastMutationId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }, etag: strongExamETag('"v1-2-DRAFT"'), serverTime: "2026-11-27T00:00:00.000Z" });
    expect(compared.unknownWrite?.mutationId).toBe(exam.lastMutationId);
    expect(compared.unknownWrite?.retry?.ifMatch).toBe('"v1-1-DRAFT"');
    expect(compared.reviewRequired).toBe(true);
    expect(compared.etag).toBe('"v1-2-DRAFT"');
    expect(compared.serverTime).toBe("2026-11-27T00:00:00.000Z");
  });
  it("classifies an uncertain delete as delete so owner-scoped absence confirms it", () => {
    const state = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), {
      type: "writeUnknownWithRetry", mutationId: exam.lastMutationId, draftId: exam.id,
      retry: { kind: "delete", ifMatch: strongExamETag('"v1-1-DRAFT"') },
    });
    expect(state.unknownWrite?.kind).toBe("delete");
  });
  it("keeps local adoption blocked when the canonical review read fails", () => {
    const dirty = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), { type: "settingChanged", field: "title", value: "Local" });
    const blocked = draftEditorReducer(dirty, { type: "reviewReadStarted" });
    const failed = draftEditorReducer(blocked, { type: "detailReadFailed", requestId: blocked.readRequestId, message: "read failed" });
    expect(failed.reviewRequired).toBe(true);
    expect(failed.reviewExam).toBeNull();
    expect(failed.formETag).toBe('"v1-1-DRAFT"');
  });
  it("clears an unknown lock after a successful same-correlation retry", () => {
    const state = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), {
      type: "writeUnknownWithRetry", mutationId: exam.lastMutationId, draftId: exam.id,
      retry: { kind: "patch", ifMatch: strongExamETag('"v1-1-DRAFT"'), input: { op: "saveSettings", mutationId: exam.lastMutationId, settings: { title: "Saved" } } },
    });
    const savedExam = { ...exam, title: "Saved" };
    const saved = draftEditorReducer(state, { type: "settingsWriteSucceeded", exam: savedExam, etag: strongExamETag('"v1-2-DRAFT"'), serverTime: null, mutationId: exam.lastMutationId, saved: { ...state.settings, title: "Saved" } });
    expect(saved.unknownWrite).toBeNull();
    expect(saved.pending).toBe(false);
    expect(saved.formETag).toBe('"v1-2-DRAFT"');
  });

  it("ignores an in-flight canonical read after a superseded retry opens review", () => {
    const pendingRead = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), { type: "readStarted", requestId: 1 });
    const latestExam = { ...exam, title: "Phiên bản mới nhất", lastMutationId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
    const supersededRetry = draftEditorReducer(pendingRead, {
      type: "settingsWriteSucceeded", exam: latestExam, etag: strongExamETag('"v1-3-DRAFT"'), serverTime: null,
      mutationId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", saved: { ...pendingRead.settings, title: "Tên đã gửi" },
    });
    const staleRead = draftEditorReducer(supersededRetry, {
      type: "detailReadSucceeded", requestId: 1, exam: { ...exam, title: "Phiên bản cũ" },
      etag: strongExamETag('"v1-2-DRAFT"'), serverTime: null,
    });

    expect(staleRead.reviewRequired).toBe(true);
    expect(staleRead.reviewExam?.title).toBe("Phiên bản mới nhất");
    expect(staleRead.etag).toBe('"v1-3-DRAFT"');
    expect(staleRead.formETag).toBe('"v1-1-DRAFT"');
    expect(staleRead.loading).toBe(false);
  });

  it("rejects an old child page response after the parent validator changes", () => {
    const current = { ...createDraftEditorState(exam, strongExamETag('"v1-2-DRAFT"')), questions: [] };
    const started = draftEditorReducer(current, { type: "childReadStarted", kind: "questions", requestId: 4 });
    const stale = draftEditorReducer(started, {
      type: "questionsLoaded", items: [], nextCursor: "old-cursor", append: false,
      requestId: 4, examId: exam.id, baseETag: strongExamETag('"v1-1-DRAFT"'),
    });
    expect(stale.questionCursor).toBeNull();
    expect(stale.questions).toEqual([]);
  });
  it("ignores a stale child error callback after a newer request starts", () => {
    const current = createDraftEditorState(exam, strongExamETag('"v1-2-DRAFT"'));
    const started = draftEditorReducer(current, { type: "childReadStarted", kind: "questions", requestId: 5 });
    const newer = draftEditorReducer(started, { type: "childReadStarted", kind: "questions", requestId: 6 });
    const stale = draftEditorReducer(newer, { type: "childReadFailed", kind: "questions", requestId: 5, examId: exam.id, baseETag: strongExamETag('"v1-2-DRAFT"'), message: "old failure", cursorRejected: true });
    expect(stale.readError).toBeNull();
    expect(stale.questionRestartId).toBe(0);
  });

  it("does not turn a same-validator background read into a stale-form conflict", () => {
    const edited = draftEditorReducer(createDraftEditorState(exam, strongExamETag('"v1-1-DRAFT"')), { type: "settingChanged", field: "title", value: "Nhập cục bộ" });
    const reading = draftEditorReducer(edited, { type: "readStarted", requestId: 1 });
    const refreshed = draftEditorReducer(reading, { type: "detailReadSucceeded", requestId: 1, exam, etag: strongExamETag('"v1-1-DRAFT"'), serverTime: null });
    expect(refreshed.settings.title).toBe("Nhập cục bộ");
    expect(refreshed.reviewRequired).toBe(false);
  });
});
