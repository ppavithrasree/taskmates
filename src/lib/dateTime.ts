export type TimeFormat = "12" | "24";

const formatterFor = (format: TimeFormat = "24") =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: format === "12",
  });

export const formatClockTime = (timestamp: number, format: TimeFormat = "24") =>
  formatterFor(format).format(new Date(timestamp)).replace(/\s([AP]M)$/i, (match) => match.toLowerCase());

export const formatClockTime24 = (timestamp: number) => formatClockTime(timestamp, "24");

export const formatTimeRange = (start: number, end: number, format: TimeFormat = "24") =>
  `${formatClockTime(start, format)} - ${formatClockTime(end, format)}`;

export const formatTimeRange24 = (start: number, end: number) => formatTimeRange(start, end, "24");

export const formatDayAwareDateTime = (timestamp: number, format: TimeFormat = "24") => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const day = sameDay(date, today)
    ? "Today"
    : sameDay(date, yesterday)
      ? "Yesterday"
      : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  return `${day}, ${formatClockTime(timestamp, format)}`;
};
