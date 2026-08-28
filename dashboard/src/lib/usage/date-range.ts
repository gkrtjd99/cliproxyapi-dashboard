export type DateFilter = "today" | "7d" | "30d" | "all" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

const ALL_TIME_RANGE: DateRange = {
  from: "2020-01-01",
  to: "2099-12-31",
};

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getUsageDateRange(
  period: DateFilter | string = "all",
  customFrom?: string,
  customTo?: string,
  currentDate: Date = new Date(),
): DateRange {
  const now = new Date(currentDate);
  const to = toLocalDateString(now);

  switch (period) {
    case "today":
      return { from: to, to };
    case "7d":
    case "30d": {
      const days = period === "7d" ? 7 : 30;
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - (days - 1));
      return { from: toLocalDateString(fromDate), to };
    }
    case "all":
      return { ...ALL_TIME_RANGE };
    case "custom":
      return { from: customFrom || to, to: customTo || to };
    default:
      return { ...ALL_TIME_RANGE };
  }
}
