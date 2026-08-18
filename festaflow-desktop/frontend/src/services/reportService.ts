import { apiFetch } from "./api";
import { DashboardSummary } from "../types";

export const reportService = {
  summary: () => apiFetch<DashboardSummary>("/reports/summary"),
};
