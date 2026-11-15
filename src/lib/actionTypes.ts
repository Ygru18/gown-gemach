export interface ActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  redirect?: string;
  data?: T;
}
