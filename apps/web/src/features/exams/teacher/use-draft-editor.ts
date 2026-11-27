import { useCallback, useEffect, useReducer, useRef, type Dispatch as ReactDispatch, type MutableRefObject } from "react";
import type { ExamAction, ExamQuestionSnapshot, TeacherExamDetail, TeacherExamWriteRequest } from "@quiz/shared";
import { ApiError } from "@/lib/api-client.js";
import {
  classifyExamWriteOutcome,
  createTeacherExam,
  deleteTeacherExam,
  getTeacherExam,
  listExamHistory,
  listExamQuestions,
  patchTeacherExam,
  readExamETag,
  type ExamEntityTag,
} from "../api.js";
import { formatExamInstantInVietnam, readExamServerTime, vietnamLocalDateTimeToIso } from "../server-time.js";

export interface DraftSettings {
  title: string;
  durationMinutes: string;
  maxAttempts: string;
  allowAnswerReview: "unset" | "yes" | "no";
  opensAt: string;
  closesAt: string;
  passwordMode: "unchanged" | "set" | "disable";
  passwordValue: string;
}
export type DraftFieldErrors = Partial<Record<keyof DraftSettings, string>>;
type RetriableWrite = { kind: "patch"; ifMatch: ExamEntityTag; input: TeacherExamWriteRequest } | { kind: "delete"; ifMatch: ExamEntityTag };
export type TeacherExamWriteIntent = TeacherExamWriteRequest extends infer Request
  ? Request extends { mutationId: string }
    ? Omit<Request, "mutationId">
    : never
  : never;
export interface DraftEditorState {
  exam: TeacherExamDetail | null;
  etag: ExamEntityTag | null;
  formETag: ExamEntityTag | null;
  settings: DraftSettings;
  savedSettings: DraftSettings;
  dirty: boolean;
  fieldErrors: DraftFieldErrors;
  fieldErrorFocusRequestId: number;
  loading: boolean;
  pending: boolean;
  error: string | null;
  readError: string | null;
  notice: string | null;
  reviewRequired: boolean;
  reviewExam: TeacherExamDetail | null;
  readRequestId: number;
  serverTime: string | null;
  unknownWrite: { mutationId: string; kind: "existing" | "create" | "delete"; draftId?: string; title?: string; retry?: RetriableWrite } | null;
  createRecovery: "none" | "checking" | "inconclusive" | "new-intent-required";
  retiredCreateId: string | null;
  createDuplicate: { exam: TeacherExamDetail; etag: ExamEntityTag; submittedTitle: string } | null;
  deleteConfirmed: boolean;
  questions: ExamQuestionSnapshot[];
  questionCursor: string | null;
  history: ExamAction[];
  historyCursor: string | null;
  questionReadId: number;
  historyReadId: number;
  questionRestartId: number;
  historyRestartId: number;
}
export type DraftEditorAction =
  | { type: "routeChanged"; requestId: number }
  | { type: "settingChanged"; field: keyof DraftSettings; value: string }
  | { type: "readStarted"; requestId: number }
  | { type: "reviewReadStarted" }
  | { type: "detailReadSucceeded"; requestId: number; exam: TeacherExamDetail; etag: ExamEntityTag; serverTime: string | null }
  | { type: "detailReadFailed"; requestId: number; message: string }
  | { type: "childReadFailed"; kind: "questions" | "history"; requestId: number; examId: string; baseETag: ExamEntityTag; message: string; cursorRejected?: boolean }
  | { type: "childReadStarted"; kind: "questions" | "history"; requestId: number }
  | { type: "writeStarted" }
  | { type: "writeRejected"; message: string; fieldErrors?: DraftFieldErrors }
  | { type: "writeUnknown"; mutationId: string; kind: "existing" | "delete"; draftId: string }
  | { type: "writeUnknownWithRetry"; mutationId: string; draftId: string; retry: RetriableWrite }
  | { type: "createUnknown"; mutationId: string; draftId: string; title: string }
  | { type: "createDuplicateFound"; exam: TeacherExamDetail; etag: ExamEntityTag; submittedTitle: string }
  | { type: "createCheckNotFound" }
  | { type: "writeConfirmed"; exam: TeacherExamDetail; etag: ExamEntityTag; serverTime?: string | null }
  | { type: "writeNeedsReview"; exam: TeacherExamDetail; etag: ExamEntityTag; serverTime: string | null }
  | { type: "writeUnchanged" }
  | { type: "acceptReviewedState" }
  | { type: "rebaseReviewedState" }
  | { type: "acknowledgeReviewedOutcome" }
  | { type: "validationFailed"; errors: DraftFieldErrors }
  | { type: "deleteSucceeded" }
  | { type: "settingsWriteSucceeded"; exam: TeacherExamDetail; etag: ExamEntityTag; serverTime: string | null; mutationId: string; saved: DraftSettings }
  | { type: "childWriteSucceeded"; exam: TeacherExamDetail; etag: ExamEntityTag; serverTime: string | null; mutationId: string }
  | { type: "deleteCheckNotFound" }
  | { type: "questionsLoaded"; items: ExamQuestionSnapshot[]; nextCursor: string | null; append: boolean; requestId: number; examId: string; baseETag: ExamEntityTag }
  | { type: "historyLoaded"; items: ExamAction[]; nextCursor: string | null; append: boolean; requestId: number; examId: string; baseETag: ExamEntityTag }
  | { type: "clearFeedback" };

const blankSettings = (): DraftSettings => ({
  title: "",
  durationMinutes: "",
  maxAttempts: "",
  allowAnswerReview: "unset",
  opensAt: "",
  closesAt: "",
  passwordMode: "unchanged",
  passwordValue: "",
});
export function settingsFromExam(exam: TeacherExamDetail): DraftSettings {
  return {
    title: exam.title,
    durationMinutes: exam.durationMinutes ?? "",
    maxAttempts: exam.maxAttempts ?? "",
    allowAnswerReview: exam.allowAnswerReview === null ? "unset" : exam.allowAnswerReview ? "yes" : "no",
    opensAt: exam.opensAt ? formatExamInstantInVietnam(exam.opensAt) ?? "" : "",
    closesAt: exam.closesAt ? formatExamInstantInVietnam(exam.closesAt) ?? "" : "",
    passwordMode: "unchanged",
    passwordValue: "",
  };
}
export function createDraftEditorState(exam: TeacherExamDetail | null = null, etag: ExamEntityTag | null = null): DraftEditorState {
  const settings = exam ? settingsFromExam(exam) : blankSettings();
  return {
    exam, etag, formETag: etag, settings, savedSettings: settings, dirty: false, fieldErrors: {}, fieldErrorFocusRequestId: 0,
    loading: false, pending: false, error: null, readError: null, notice: null, reviewRequired: false,
    reviewExam: null, readRequestId: 0, unknownWrite: null, createRecovery: "none",
    retiredCreateId: null, createDuplicate: null, deleteConfirmed: false, serverTime: null,
    questions: [], questionCursor: null, history: [], historyCursor: null, questionReadId: 0, historyReadId: 0, questionRestartId: 0, historyRestartId: 0,
  };
}
function sameSettings(left: DraftSettings, right: DraftSettings): boolean {
  return (Object.keys(left) as (keyof DraftSettings)[]).every((key) => left[key] === right[key]);
}
function reduceSettingsAction(state: DraftEditorState, action: DraftEditorAction): DraftEditorState | null {
  switch (action.type) {
    case "settingChanged": {
      const settings = { ...state.settings, [action.field]: action.value };
      const fieldErrors = { ...state.fieldErrors };
      delete fieldErrors[action.field];
      return { ...state, settings, dirty: !sameSettings(settings, state.savedSettings), fieldErrors, error: null, notice: null, ...(action.field === "title" ? { createDuplicate: null } : {}) };
    }
    case "validationFailed": return { ...state, fieldErrors: action.errors, fieldErrorFocusRequestId: state.fieldErrorFocusRequestId + 1, error: null, notice: null };
    case "acceptReviewedState": return acceptReviewedState(state);
    case "rebaseReviewedState": return rebaseReviewedState(state, false);
    case "acknowledgeReviewedOutcome": return rebaseReviewedState(state, true);
    default: return null;
  }
}
function acceptReviewedState(state: DraftEditorState): DraftEditorState {
  if (!state.reviewExam || !state.etag) return state;
  const settings = settingsFromExam(state.reviewExam);
  return { ...state, exam: state.reviewExam, formETag: state.etag, settings, savedSettings: settings, dirty: false, reviewRequired: false, reviewExam: null, notice: "Đã tải trạng thái mới của đề." };
}
function rebaseReviewedState(state: DraftEditorState, clearUnknown: boolean): DraftEditorState {
  if (!state.reviewExam || !state.etag) return state;
  const savedSettings = settingsFromExam(state.reviewExam);
  const settings = { ...savedSettings };
  for (const key of Object.keys(state.settings) as (keyof DraftSettings)[]) {
    if (state.settings[key] !== state.savedSettings[key]) Object.assign(settings, { [key]: state.settings[key] });
  }
  const unknownWrite = clearUnknown ? null : state.unknownWrite;
  const notice = clearUnknown ? "Đã đối chiếu phiên bản hiện tại. Lần ghi trước có thể đã được thay thế; các thay đổi của bạn vẫn được giữ." : "Đã dùng phiên bản mới làm dữ liệu gốc. Các thay đổi của bạn vẫn được giữ.";
  return { ...state, exam: state.reviewExam, formETag: state.etag, savedSettings, settings, dirty: !sameSettings(settings, savedSettings), unknownWrite, reviewRequired: false, reviewExam: null, notice };
}
function reduceReadAction(state: DraftEditorState, action: DraftEditorAction): DraftEditorState | null {
  switch (action.type) {
    case "routeChanged": return { ...createDraftEditorState(), readRequestId: action.requestId };
    case "readStarted": return { ...state, readRequestId: action.requestId, loading: true, error: null };
    case "reviewReadStarted": return { ...state, reviewRequired: true, reviewExam: null, loading: true, error: null };
    case "detailReadSucceeded": return detailReadSucceeded(state, action);
    case "detailReadFailed": return action.requestId === state.readRequestId ? { ...state, loading: false, error: action.message } : state;
    case "childReadFailed": return childReadFailed(state, action);
    case "childReadStarted": return action.kind === "questions" ? { ...state, questionReadId: action.requestId } : { ...state, historyReadId: action.requestId };
    case "questionsLoaded": return questionsLoaded(state, action);
    case "historyLoaded": return historyLoaded(state, action);
    case "clearFeedback": return { ...state, error: null, notice: null };
    default: return null;
  }
}
function detailReadSucceeded(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "detailReadSucceeded" }>): DraftEditorState {
  if (action.requestId !== state.readRequestId) return state;
  const incoming = settingsFromExam(action.exam);
  if (!state.exam) return { ...createDraftEditorState(action.exam, action.etag), readRequestId: action.requestId, serverTime: action.serverTime };
  if (state.dirty || state.reviewRequired) {
    const reviewRequired = state.reviewRequired || action.etag !== state.formETag;
    return { ...state, exam: action.exam, etag: action.etag, serverTime: action.serverTime, reviewRequired, reviewExam: reviewRequired ? action.exam : null, loading: false };
  }
  return { ...state, exam: action.exam, etag: action.etag, formETag: action.etag, serverTime: action.serverTime, settings: incoming, savedSettings: incoming, dirty: false, loading: false, reviewRequired: false, reviewExam: null };
}
function questionsLoaded(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "questionsLoaded" }>): DraftEditorState {
  if (action.requestId !== state.questionReadId || state.exam?.id !== action.examId || state.etag !== action.baseETag) return state;
  return { ...state, readError: null, questions: action.append ? [...state.questions, ...action.items] : action.items, questionCursor: action.nextCursor };
}
function historyLoaded(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "historyLoaded" }>): DraftEditorState {
  if (action.requestId !== state.historyReadId || state.exam?.id !== action.examId || state.etag !== action.baseETag) return state;
  return { ...state, readError: null, history: action.append ? [...state.history, ...action.items] : action.items, historyCursor: action.nextCursor };
}
function childReadFailed(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "childReadFailed" }>): DraftEditorState {
  const latestRequestId = action.kind === "questions" ? state.questionReadId : state.historyReadId;
  if (action.requestId !== latestRequestId || state.exam?.id !== action.examId || state.etag !== action.baseETag) return state;
  return action.kind === "questions"
    ? { ...state, readError: action.message, ...(action.cursorRejected ? { questions: [], questionCursor: null, questionRestartId: state.questionRestartId + 1 } : {}) }
    : { ...state, readError: action.message, ...(action.cursorRejected ? { history: [], historyCursor: null, historyRestartId: state.historyRestartId + 1 } : {}) };
}
function reduceWriteRecovery(state: DraftEditorState, action: DraftEditorAction): DraftEditorState | null {
  switch (action.type) {
    case "writeUnknown": return { ...state, pending: false, unknownWrite: { mutationId: action.mutationId, kind: action.kind, draftId: action.draftId }, notice: "Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái trước khi tiếp tục." };
    case "writeUnknownWithRetry": return { ...state, pending: false, unknownWrite: { mutationId: action.mutationId, kind: action.retry.kind === "delete" ? "delete" : "existing", draftId: action.draftId, retry: action.retry }, notice: "Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái trước khi tiếp tục." };
    case "createUnknown": return { ...state, pending: false, settings: { ...state.settings, title: action.title }, dirty: true, unknownWrite: { mutationId: action.mutationId, kind: "create", draftId: action.draftId, title: action.title }, createRecovery: "checking", notice: "Chưa xác nhận được kết quả tạo nháp. Hãy kiểm tra trạng thái." };
    case "createDuplicateFound": return { ...state, pending: false, createDuplicate: { exam: action.exam, etag: action.etag, submittedTitle: action.submittedTitle }, notice: "Mã đề đã thuộc về một đề hiện có. Hãy xem và chọn rõ trước khi mở đề đó." };
    case "createCheckNotFound": return { ...state, pending: false, unknownWrite: null, createRecovery: "new-intent-required", retiredCreateId: state.unknownWrite?.draftId ?? null, notice: "Không xác định được lần tạo trước. Bạn có thể bắt đầu một lần tạo mới; yêu cầu cũ sẽ không được gửi lại." };
    case "deleteCheckNotFound": return { ...state, pending: false, unknownWrite: null, deleteConfirmed: true, notice: "Đã xác nhận đề không còn tồn tại." };
    case "writeNeedsReview": return { ...state, readRequestId: state.readRequestId + 1, loading: false, pending: false, etag: action.etag, serverTime: action.serverTime, reviewRequired: true, reviewExam: action.exam, notice: "Đề đã thay đổi trong lúc xử lý. Hãy xem lại trước khi tiếp tục." };
    case "writeUnchanged": return { ...state, pending: false, notice: "Trạng thái hiện tại chưa xác nhận lần ghi trước. Bạn có thể kiểm tra lại hoặc thử lại đúng yêu cầu đã giữ." };
    default: return null;
  }
}
function reduceWriteResult(state: DraftEditorState, action: DraftEditorAction): DraftEditorState | null {
  switch (action.type) {
    case "writeStarted": return { ...state, pending: true, error: null, notice: null };
    case "writeRejected": return { ...state, pending: false, error: action.message, ...(action.fieldErrors ? { fieldErrors: action.fieldErrors, fieldErrorFocusRequestId: state.fieldErrorFocusRequestId + 1 } : {}) };
    case "deleteSucceeded": return { ...state, pending: false, deleteConfirmed: true, notice: "Đã xóa bản nháp." };
    case "writeConfirmed": return writeConfirmed(state, action);
    case "settingsWriteSucceeded": return settingsWriteSucceeded(state, action);
    case "childWriteSucceeded": return childWriteSucceeded(state, action);
    default: return null;
  }
}
function writeConfirmed(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "writeConfirmed" }>): DraftEditorState {
  const savedSettings = settingsFromExam(action.exam);
  const preserveLocal = state.dirty && state.unknownWrite?.retry?.kind === "patch" && state.unknownWrite.retry.input.op !== "saveSettings";
  const settings = preserveLocal ? state.settings : savedSettings;
  return { ...state, readRequestId: state.readRequestId + 1, loading: false, exam: action.exam, etag: action.etag, formETag: action.etag, serverTime: action.serverTime ?? state.serverTime, settings, savedSettings, dirty: !sameSettings(settings, savedSettings), pending: false, unknownWrite: null, createRecovery: "none", reviewRequired: false, reviewExam: null, notice: "Đã xác nhận thay đổi được lưu." };
}
function settingsWriteSucceeded(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "settingsWriteSucceeded" }>): DraftEditorState {
  if (action.exam.lastMutationId !== action.mutationId) return { ...state, readRequestId: state.readRequestId + 1, loading: false, etag: action.etag, serverTime: action.serverTime, pending: false, unknownWrite: null, reviewRequired: true, reviewExam: action.exam, notice: "Kết quả đã bị thay thế bởi thay đổi khác. Hãy xem lại đề." };
  const saved: DraftSettings = { ...action.saved, passwordMode: "unchanged", passwordValue: "" };
  return { ...state, readRequestId: state.readRequestId + 1, loading: false, exam: action.exam, etag: action.etag, formETag: action.etag, serverTime: action.serverTime, savedSettings: saved, settings: saved, dirty: false, pending: false, unknownWrite: null, reviewRequired: false, reviewExam: null, notice: "Đã lưu cấu hình." };
}
function childWriteSucceeded(state: DraftEditorState, action: Extract<DraftEditorAction, { type: "childWriteSucceeded" }>): DraftEditorState {
  if (action.exam.lastMutationId !== action.mutationId) return { ...state, readRequestId: state.readRequestId + 1, loading: false, pending: false, unknownWrite: null, reviewRequired: true, reviewExam: action.exam, etag: action.etag, serverTime: action.serverTime, notice: "Kết quả đã bị thay thế bởi thay đổi khác. Hãy xem lại đề." };
  return { ...state, readRequestId: state.readRequestId + 1, loading: false, exam: action.exam, etag: action.etag, formETag: action.etag, serverTime: action.serverTime, questions: [], questionCursor: null, pending: false, unknownWrite: null, reviewRequired: false, reviewExam: null, notice: "Đã lưu thay đổi." };
}
export function draftEditorReducer(state: DraftEditorState, action: DraftEditorAction): DraftEditorState {
  return reduceSettingsAction(state, action) ?? reduceReadAction(state, action) ?? reduceWriteRecovery(state, action) ?? reduceWriteResult(state, action) ?? state;
}

function localizedError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.body.code === "VALIDATION_ERROR" && Array.isArray(error.body.details)) {
      const fields: Record<string, string> = { title: "tên đề", questions: "câu hỏi", settings: "cấu hình", durationMinutes: "thời lượng", maxAttempts: "số lượt", allowAnswerReview: "chính sách xem đáp án", schedule: "lịch thi", opensAt: "giờ mở", closesAt: "giờ đóng", classroomIds: "lớp được giao", sourceQuestionId: "câu hỏi nguồn", snapshotId: "bản chụp câu hỏi", beforeSnapshotId: "thứ tự câu hỏi", removeClassroomIds: "lớp được bỏ liên kết" };
      const reasons: Record<string, string> = { REQUIRED: "còn thiếu", POSITIVE_INTEGER: "phải là số nguyên dương", OPEN_NOT_FUTURE: "phải ở tương lai theo giờ máy chủ", CLOSE_NOT_AFTER_OPEN: "phải sau giờ mở", WINDOW_TOO_SHORT: "ngắn hơn thời lượng", CLASSROOM_NOT_ASSIGNED: "không còn được giao", NOT_IN_EXAM: "không còn trong đề" };
      const messages = error.body.details.flatMap((detail) => {
        if (detail === null || typeof detail !== "object") return [];
        const field = "field" in detail && typeof detail.field === "string" ? fields[detail.field] : undefined;
        const reason = "reason" in detail && typeof detail.reason === "string" ? reasons[detail.reason] : undefined;
        return field && reason ? [`${field} ${reason}`] : field ? [field] : [];
      });
      if (messages.length) return `Thông tin chưa hợp lệ: ${messages.join("; ")}.`;
    }
    const messages: Record<string, string> = {
      EXAM_VERSION_CONFLICT: "Đề đã được thay đổi ở nơi khác. Dữ liệu của bạn vẫn được giữ.",
      EXAM_INVALID_STATE: "Thao tác không phù hợp với trạng thái hiện tại của đề.",
      VALIDATION_ERROR: "Thông tin chưa hợp lệ. Hãy kiểm tra các trường cấu hình.",
      EXAM_NOT_FOUND: "Không tìm thấy đề thi.",
      CLASSROOM_NOT_FOUND: "Không tìm thấy lớp học đã chọn.",
      CLASSROOM_NOT_ASSIGNED: "Lớp được bỏ liên kết không còn được giao cho đề.",
      EXAM_DUPLICATE_SOURCE: "Câu hỏi này đã có trong đề.",
      SOURCE_QUESTION_NOT_FOUND: "Không tìm thấy câu hỏi nguồn.",
      SNAPSHOT_NOT_FOUND: "Không tìm thấy bản chụp câu hỏi.",
      EXAM_WRITE_BUSY: "Hệ thống đã hủy thay đổi trước khi lưu. Bạn có thể thử lại.",
      EXAM_HASH_BUSY: "Hệ thống đang bận tạo mật khẩu. Hãy thử lại sau.",
    };
    return messages[error.body.code] ?? "Không thể hoàn tất thao tác. Dữ liệu bạn nhập vẫn được giữ.";
  }
  return "Chưa xác nhận được kết quả. Hãy kiểm tra trạng thái trước khi tiếp tục.";
}
function localizedFieldErrors(error: unknown): DraftFieldErrors | undefined {
  if (!(error instanceof ApiError) || error.body.code !== "VALIDATION_ERROR" || !Array.isArray(error.body.details)) return undefined;
  const fields: Record<string, keyof DraftSettings> = {
    title: "title", durationMinutes: "durationMinutes", maxAttempts: "maxAttempts", allowAnswerReview: "allowAnswerReview",
    opensAt: "opensAt", closesAt: "closesAt",
  };
  const labels: Partial<Record<keyof DraftSettings, string>> = {
    title: "Tên đề", durationMinutes: "Thời lượng", maxAttempts: "Số lượt làm bài",
    allowAnswerReview: "Chính sách xem đáp án", opensAt: "Giờ mở", closesAt: "Giờ đóng",
  };
  const reasons: Record<string, string> = { REQUIRED: "còn thiếu", POSITIVE_INTEGER: "phải là số nguyên dương", OPEN_NOT_FUTURE: "phải ở tương lai theo giờ máy chủ", CLOSE_NOT_AFTER_OPEN: "phải sau giờ mở", WINDOW_TOO_SHORT: "ngắn hơn thời lượng" };
  const result: DraftFieldErrors = {};
  for (const detail of error.body.details) {
    if (detail === null || typeof detail !== "object" || !("field" in detail) || typeof detail.field !== "string") continue;
    const field = fields[detail.field];
    if (!field) continue;
    const reason = "reason" in detail && typeof detail.reason === "string" ? reasons[detail.reason] : undefined;
    result[field] = `${labels[field] ?? "Thông tin"}${reason ? ` ${reason}` : " chưa hợp lệ"}.`;
  }
  return Object.keys(result).length ? result : undefined;
}
function mutationId(): string {
  return crypto.randomUUID();
}
function isOwnedDuplicate(error: unknown): boolean {
  return error instanceof ApiError && error.body.code === "EXAM_ALREADY_EXISTS" && Array.isArray(error.body.details) && error.body.details.some((detail) => detail !== null && typeof detail === "object" && "field" in detail && detail.field === "id" && "reason" in detail && detail.reason === "OWNED_DUPLICATE");
}
function isRejectedCursor(error: unknown): boolean {
  return error instanceof ApiError && error.body.code === "VALIDATION_ERROR" && Array.isArray(error.body.details)
    && error.body.details.some((detail) => detail !== null && typeof detail === "object" && "field" in detail && detail.field === "cursor");
}
export function draftSettingsPayload(settings: DraftSettings, saved: DraftSettings) {
  const opensAt = settings.opensAt === saved.opensAt ? undefined : settings.opensAt === "" ? null : vietnamLocalDateTimeToIso(settings.opensAt);
  const closesAt = settings.closesAt === saved.closesAt ? undefined : settings.closesAt === "" ? null : vietnamLocalDateTimeToIso(settings.closesAt);
  if ((settings.opensAt !== "" && opensAt === null) || (settings.closesAt !== "" && closesAt === null)) {
    throw new TypeError("Lịch ngày giờ không hợp lệ.");
  }
  return {
    ...(settings.title !== saved.title ? { title: settings.title } : {}),
    ...(settings.durationMinutes !== saved.durationMinutes ? { durationMinutes: settings.durationMinutes === "" ? null : settings.durationMinutes } : {}),
    ...(settings.maxAttempts !== saved.maxAttempts ? { maxAttempts: settings.maxAttempts === "" ? null : settings.maxAttempts } : {}),
    ...(settings.allowAnswerReview !== saved.allowAnswerReview ? { allowAnswerReview: settings.allowAnswerReview === "unset" ? null : settings.allowAnswerReview === "yes" } : {}),
    ...(settings.opensAt !== saved.opensAt ? { opensAt: opensAt! } : {}),
    ...(settings.closesAt !== saved.closesAt ? { closesAt: closesAt! } : {}),
    ...(settings.passwordMode === "set" ? { password: { mode: "set" as const, value: settings.passwordValue } } : {}),
    ...(settings.passwordMode === "disable" ? { password: { mode: "disable" as const } } : {}),
  };
}
export function validateDraftSettings(settings: DraftSettings, saved: DraftSettings = blankSettings()): DraftFieldErrors {
  const errors: DraftFieldErrors = {};
  if (!settings.title.trim()) errors.title = "Nhập tên đề.";
  if (settings.durationMinutes !== "" && !/^[1-9][0-9]*$/.test(settings.durationMinutes)) errors.durationMinutes = "Thời lượng phải là số nguyên dương.";
  if (settings.maxAttempts !== "" && !/^[1-9][0-9]*$/.test(settings.maxAttempts)) errors.maxAttempts = "Số lượt làm bài phải là số nguyên dương.";
  if (settings.opensAt !== saved.opensAt && settings.opensAt !== "" && vietnamLocalDateTimeToIso(settings.opensAt) === null) errors.opensAt = "Nhập ngày giờ mở hợp lệ.";
  if (settings.closesAt !== saved.closesAt && settings.closesAt !== "" && vietnamLocalDateTimeToIso(settings.closesAt) === null) errors.closesAt = "Nhập ngày giờ đóng hợp lệ.";
  if (settings.passwordMode === "set" && settings.passwordValue.length === 0) errors.passwordValue = "Nhập mật khẩu mới.";
  return errors;
}
type EditorDispatch = ReactDispatch<DraftEditorAction>;
function useExamReader(examId: string | undefined, dispatch: EditorDispatch, sequence: MutableRefObject<number>) {
  const loadExam = useCallback(async (id = examId) => {
    if (!id) return;
    const requestId = ++sequence.current;
    dispatch({ type: "readStarted", requestId });
    try {
      const response = await getTeacherExam(id);
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      dispatch({ type: "detailReadSucceeded", requestId, exam: response.data, etag, serverTime: readExamServerTime(response.headers) });
    } catch (error) { dispatch({ type: "detailReadFailed", requestId, message: localizedError(error) }); }
  }, [dispatch, examId, sequence]);
  useEffect(() => {
    dispatch({ type: "routeChanged", requestId: ++sequence.current });
    if (examId) void loadExam(examId);
  }, [dispatch, examId, loadExam, sequence]);
  return loadExam;
}
function useDraftCreator(dispatch: EditorDispatch) {
  return useCallback(async (title: string) => {
    const id = crypto.randomUUID();
    const idForMutation = mutationId();
    dispatch({ type: "writeStarted" });
    try {
      const response = await createTeacherExam({ id, title, mutationId: idForMutation });
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      dispatch({ type: "writeConfirmed", exam: response.data, etag, serverTime: readExamServerTime(response.headers) });
      return response.data.id;
    } catch (error) {
      if (classifyExamWriteOutcome(error) === "unknown") dispatch({ type: "createUnknown", draftId: id, mutationId: idForMutation, title });
      else if (isOwnedDuplicate(error)) {
        try {
          const existing = await getTeacherExam(id);
          const etag = readExamETag(existing.headers);
          if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
          dispatch({ type: "createDuplicateFound", exam: existing.data, etag, submittedTitle: title });
        } catch {
          dispatch({ type: "writeRejected", message: "Mã đề đã thuộc về một nháp, nhưng chưa đọc được trạng thái đó. Tên bạn nhập vẫn được giữ." });
        }
      }
      else dispatch({ type: "writeRejected", message: localizedError(error) });
      return null;
    }
  }, [dispatch]);
}
function useSettingsWriter(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch, loadExam: (id?: string) => Promise<void>) {
  return useCallback(async () => {
    const current = stateRef.current;
    if (!current.exam || !current.formETag || current.pending || current.reviewRequired || current.unknownWrite) return;
    const validation = validateDraftSettings(current.settings, current.savedSettings);
    if (Object.keys(validation).length > 0) { dispatch({ type: "validationFailed", errors: validation }); return; }
    const settings = draftSettingsPayload(current.settings, current.savedSettings);
    const idForMutation = mutationId();
    try {
      dispatch({ type: "writeStarted" });
      const input: TeacherExamWriteRequest = { op: "saveSettings", mutationId: idForMutation, settings };
      const response = await patchTeacherExam(current.exam.id, current.formETag, input);
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      dispatch({ type: "settingsWriteSucceeded", exam: response.data, etag, serverTime: readExamServerTime(response.headers), mutationId: idForMutation, saved: current.settings });
    } catch (error) {
      if (classifyExamWriteOutcome(error) === "unknown") dispatch({ type: "writeUnknownWithRetry", mutationId: idForMutation, draftId: current.exam.id, retry: { kind: "patch", ifMatch: current.formETag, input: { op: "saveSettings", mutationId: idForMutation, settings } } });
      else { const fieldErrors = localizedFieldErrors(error); if (error instanceof ApiError && error.status === 412) dispatch({ type: "reviewReadStarted" }); dispatch({ type: "writeRejected", message: localizedError(error), ...(fieldErrors ? { fieldErrors } : {}) }); if (error instanceof ApiError && error.status === 412) void loadExam(current.exam.id); }
    }
  }, [dispatch, loadExam, stateRef]);
}
function useChildWriter(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch, loadExam: (id?: string) => Promise<void>) {
  return useCallback(async (input: TeacherExamWriteIntent, expectedVersion?: string) => {
    const current = stateRef.current;
    if (!current.exam || !current.formETag || current.pending || current.reviewRequired || current.unknownWrite) return null;
    if (expectedVersion && current.etag !== expectedVersion) { void loadExam(current.exam.id); return null; }
    const idForMutation = mutationId();
    dispatch({ type: "writeStarted" });
    try {
      const response = await patchTeacherExam(current.exam.id, current.formETag, { ...input, mutationId: idForMutation } as TeacherExamWriteRequest);
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      dispatch({ type: "childWriteSucceeded", exam: response.data, etag, serverTime: readExamServerTime(response.headers), mutationId: idForMutation });
      return response.data;
    } catch (error) {
      if (classifyExamWriteOutcome(error) === "unknown") dispatch({ type: "writeUnknownWithRetry", mutationId: idForMutation, draftId: current.exam.id, retry: { kind: "patch", ifMatch: current.formETag, input: { ...input, mutationId: idForMutation } as TeacherExamWriteRequest } });
      else {
        const fieldErrors = localizedFieldErrors(error);
        if (error instanceof ApiError && error.status === 412) dispatch({ type: "reviewReadStarted" });
        dispatch({ type: "writeRejected", message: localizedError(error), ...(fieldErrors ? { fieldErrors } : {}) });
        if (error instanceof ApiError && error.status === 412) void loadExam(current.exam.id);
      }
      return null;
    }
  }, [dispatch, loadExam, stateRef]);
}
function useOutcomeChecker(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch) {
  return useCallback(async () => {
    const pendingWrite = stateRef.current.unknownWrite;
    if (!pendingWrite?.draftId) return null;
    dispatch({ type: "writeStarted" });
    try {
      const response = await getTeacherExam(pendingWrite.draftId);
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      const serverTime = readExamServerTime(response.headers);
      if (response.data.lastMutationId === pendingWrite.mutationId) dispatch({ type: "writeConfirmed", exam: response.data, etag, serverTime });
      else if (pendingWrite.retry && etag === pendingWrite.retry.ifMatch) dispatch({ type: "writeUnchanged" });
      else dispatch({ type: "writeNeedsReview", exam: response.data, etag, serverTime });
      return pendingWrite.kind === "create" && response.data.lastMutationId === pendingWrite.mutationId ? response.data.id : null;
    } catch (error) {
      if (pendingWrite.kind === "create" && error instanceof ApiError && error.status === 404) dispatch({ type: "createCheckNotFound" });
      else if (pendingWrite.kind === "delete" && error instanceof ApiError && error.status === 404) dispatch({ type: "deleteCheckNotFound" });
      else dispatch({ type: "writeRejected", message: localizedError(error) });
      return null;
    }
  }, [dispatch, stateRef]);
}
function useDraftDeleter(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch) {
  return useCallback(async () => {
    const current = stateRef.current;
    if (!current.exam || !current.etag || current.pending || current.unknownWrite || current.reviewRequired || current.exam.state !== "DRAFT" || current.exam.everPublished) return false;
    dispatch({ type: "writeStarted" });
    try {
      await deleteTeacherExam(current.exam.id, current.etag);
      dispatch({ type: "deleteSucceeded" });
      return true;
    } catch (error) {
      if (classifyExamWriteOutcome(error) === "unknown") dispatch({ type: "writeUnknownWithRetry", mutationId: "delete", draftId: current.exam.id, retry: { kind: "delete", ifMatch: current.etag } });
      else dispatch({ type: "writeRejected", message: localizedError(error) });
      return false;
    }
  }, [dispatch, stateRef]);
}
function useUnknownRetry(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch) {
  return useCallback(async () => {
    const current = stateRef.current;
    const unknown = current.unknownWrite;
    if (!unknown?.draftId || !unknown.retry || current.pending) return false;
    dispatch({ type: "writeStarted" });
    try {
      if (unknown.retry.kind === "delete") {
        await deleteTeacherExam(unknown.draftId, unknown.retry.ifMatch);
        dispatch({ type: "deleteSucceeded" });
        return true;
      }
      const response = await patchTeacherExam(unknown.draftId, unknown.retry.ifMatch, unknown.retry.input);
      const etag = readExamETag(response.headers);
      if (!etag) throw new TypeError("Thiếu ETag của đề thi.");
      if (unknown.retry.input.op === "saveSettings") {
        dispatch({ type: "settingsWriteSucceeded", exam: response.data, etag, serverTime: readExamServerTime(response.headers), mutationId: unknown.mutationId, saved: current.settings });
      } else {
        dispatch({ type: "childWriteSucceeded", exam: response.data, etag, serverTime: readExamServerTime(response.headers), mutationId: unknown.mutationId });
      }
      return true;
    } catch (error) {
      dispatch({ type: "writeRejected", message: localizedError(error) });
      return false;
    }
  }, [dispatch, stateRef]);
}
function useQuestionReader(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch, loadExam: (id?: string) => Promise<void>) {
  const questionSequence = useRef(0);
  const refreshQuestions = useCallback(async (append = false) => {
    const current = stateRef.current;
    if (!current.exam || !current.etag) return;
    const requestId = ++questionSequence.current;
    const { id: examId } = current.exam;
    const baseETag = current.etag;
    dispatch({ type: "childReadStarted", kind: "questions", requestId });
    try {
      const response = await listExamQuestions(examId, append && current.questionCursor ? { cursor: current.questionCursor } : {});
      const responseETag = readExamETag(response.headers, true);
      const latest = stateRef.current;
      if (requestId !== questionSequence.current || latest.exam?.id !== examId) return;
      if (!responseETag || responseETag !== baseETag || latest.etag !== baseETag) {
        dispatch({ type: "childReadFailed", kind: "questions", requestId, examId, baseETag, message: "Danh sách câu hỏi đã thay đổi. Đang tải lại dữ liệu đề.", cursorRejected: append });
        if (!latest.pending) void loadExam(examId);
        return;
      }
      dispatch({ type: "questionsLoaded", items: response.data.items, nextCursor: response.data.nextCursor, append, requestId, examId, baseETag });
    } catch (error) {
      const latest = stateRef.current;
      const cursorRejected = append && isRejectedCursor(error);
      dispatch({ type: "childReadFailed", kind: "questions", requestId, examId, baseETag, message: localizedError(error), cursorRejected });
      if (requestId === questionSequence.current && latest.exam?.id === examId && latest.etag === baseETag && !latest.pending && (cursorRejected || error instanceof ApiError && error.status === 412)) void loadExam(examId);
    }
  }, [dispatch, loadExam, stateRef]);
  return refreshQuestions;
}
function useHistoryReader(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch, loadExam: (id?: string) => Promise<void>) {
  const historySequence = useRef(0);
  const refreshHistory = useCallback(async (append = false) => {
    const current = stateRef.current;
    if (!current.exam || !current.etag) return;
    const requestId = ++historySequence.current;
    const { id: examId } = current.exam;
    const baseETag = current.etag;
    dispatch({ type: "childReadStarted", kind: "history", requestId });
    try {
      const response = await listExamHistory(examId, append && current.historyCursor ? { cursor: current.historyCursor } : {});
      const responseETag = readExamETag(response.headers, true);
      const latest = stateRef.current;
      if (requestId !== historySequence.current || latest.exam?.id !== examId) return;
      if (!responseETag || responseETag !== baseETag || latest.etag !== baseETag) {
        dispatch({ type: "childReadFailed", kind: "history", requestId, examId, baseETag, message: "Lịch sử đã thay đổi. Đang tải lại dữ liệu đề.", cursorRejected: append });
        if (!latest.pending) void loadExam(examId);
        return;
      }
      dispatch({ type: "historyLoaded", items: response.data.items, nextCursor: response.data.nextCursor, append, requestId, examId, baseETag });
    } catch (error) {
      const latest = stateRef.current;
      const cursorRejected = append && isRejectedCursor(error);
      dispatch({ type: "childReadFailed", kind: "history", requestId, examId, baseETag, message: localizedError(error), cursorRejected });
      if (requestId === historySequence.current && latest.exam?.id === examId && latest.etag === baseETag && !latest.pending && (cursorRejected || error instanceof ApiError && error.status === 412)) void loadExam(examId);
    }
  }, [dispatch, loadExam, stateRef]);
  return refreshHistory;
}
function useChildReaders(stateRef: MutableRefObject<DraftEditorState>, dispatch: EditorDispatch, loadExam: (id?: string) => Promise<void>) {
  return { refreshQuestions: useQuestionReader(stateRef, dispatch, loadExam), refreshHistory: useHistoryReader(stateRef, dispatch, loadExam) };
}
export function useDraftEditor(examId: string | undefined) {
  const [state, dispatch] = useReducer(draftEditorReducer, undefined, () => createDraftEditorState());
  const requestSequence = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadExam = useExamReader(examId, dispatch, requestSequence);
  const createDraft = useDraftCreator(dispatch);
  const saveSettings = useSettingsWriter(stateRef, dispatch, loadExam);
  const writeChild = useChildWriter(stateRef, dispatch, loadExam);
  const checkUnknownOutcome = useOutcomeChecker(stateRef, dispatch);
  const retryUnknownWrite = useUnknownRetry(stateRef, dispatch);
  const deleteDraft = useDraftDeleter(stateRef, dispatch);
  const childReaders = useChildReaders(stateRef, dispatch, loadExam);
  return { state, dispatch, loadExam, createDraft, saveSettings, writeChild, checkUnknownOutcome, retryUnknownWrite, deleteDraft, ...childReaders };
}
