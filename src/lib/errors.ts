/** An error whose message is safe and helpful to show to staff. */
export class AppError extends Error {
  readonly fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.fieldErrors = fieldErrors;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} was not found.`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** True when a database error came from the double-booking exclusion constraint. */
export function isDoubleBookingViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (e: unknown): boolean => {
    if (!e || typeof e !== "object" || seen.has(e)) return false;
    seen.add(e);
    const rec = e as Record<string, unknown>;
    if (rec.code === "23P01" || rec.originalCode === "23P01") return true;
    if (typeof rec.message === "string" && rec.message.includes("reservation_items_no_double_booking")) return true;
    for (const key of ["cause", "meta", "driverAdapterError", "error"]) {
      if (visit(rec[key])) return true;
    }
    return false;
  };
  return visit(err);
}
