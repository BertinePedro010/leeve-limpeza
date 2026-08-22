import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, field?: string) {
  return NextResponse.json(field ? { message, field } : { message }, { status });
}

export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
