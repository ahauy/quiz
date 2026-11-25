export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiOkBody<T> {
  data: T;
}
