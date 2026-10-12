import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

// `code` is an optional, stable machine-readable identifier (e.g.
// "SYSTEM_ACCESS_BLOCKED") for errors the frontend must branch on by
// something other than the free-text `message` - never required, so every
// existing caller keeps working unchanged.
export function fail(message: string, status = 400, field?: string, code?: string) {
  return NextResponse.json({ message, ...(field ? { field } : {}), ...(code ? { code } : {}) }, { status });
}

export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
