import type { Post, TimeGap } from "@/types";

export const DAY_MINUTES = 24 * 60;
export const MIN_POST_DURATION_MINUTES = 5;

export const startOfLocalDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const dateKey = (timestamp: number) => {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const previousLocalDayRange = (now = Date.now()) => {
  const todayStart = startOfLocalDay(now);
  return { start: todayStart - 86_400_000, end: todayStart - 1 };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const normalizeIntervalsForDay = (
  posts: Pick<Post, "startTime" | "endTime" | "deletedAt">[],
  dayStart: number
): TimeGap[] => {
  const dayEnd = dayStart + 86_400_000;

  return posts
    .filter((post) => !post.deletedAt && post.endTime > post.startTime)
    .map((post) => ({
      start: clamp(post.startTime, dayStart, dayEnd),
      end: clamp(post.endTime, dayStart, dayEnd),
    }))
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({
      start: Math.floor((interval.start - dayStart) / 60_000),
      end: Math.ceil((interval.end - dayStart) / 60_000),
    }))
    .map((interval) => ({
      start: clamp(interval.start, 0, DAY_MINUTES),
      end: clamp(interval.end, 0, DAY_MINUTES),
    }))
    .filter((interval) => interval.end > interval.start);
};

export const mergeIntervals = (intervals: TimeGap[]) => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TimeGap[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...interval });
      continue;
    }

    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
};

export const findMissingIntervals = (mergedIntervals: TimeGap[]) => {
  const gaps: TimeGap[] = [];
  let cursor = 0;

  for (const interval of mergedIntervals) {
    if (interval.start > cursor) gaps.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < DAY_MINUTES) gaps.push({ start: cursor, end: DAY_MINUTES });
  return gaps;
};

export const analyzeDayCoverage = (posts: Pick<Post, "startTime" | "endTime" | "deletedAt">[], dayStart: number) => {
  const intervals = normalizeIntervalsForDay(posts, dayStart);
  const merged = mergeIntervals(intervals);
  const gaps = findMissingIntervals(merged);
  const coveredMinutes = merged.reduce((sum, interval) => sum + interval.end - interval.start, 0);

  return {
    intervals,
    merged,
    gaps,
    coveredMinutes,
    isComplete: gaps.length === 0 && coveredMinutes === DAY_MINUTES,
  };
};

export const minutesToLabel = (minute: number) => {
  if (minute >= DAY_MINUTES) return "24:00";
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const gapLabel = (gap: TimeGap) => `${minutesToLabel(gap.start)}-${minutesToLabel(gap.end)}`;

export type GapType = "complete" | "continuous" | "non_continuous";

export const classifyGaps = (gaps: TimeGap[]): { type: GapType; gaps: TimeGap[] } => {
  if (gaps.length === 0) return { type: "complete", gaps: [] };
  if (gaps.length === 1) return { type: "continuous", gaps };
  return { type: "non_continuous", gaps };
};

export const unloggedGapsBody = (gaps: TimeGap[]) => {
  const { type } = classifyGaps(gaps);
  if (type === "continuous") return `You have not kept logs for ${gapLabel(gaps[0])}.`;
  return "There are some time slots that you have not kept logs for.";
};

export const isValidPostRange = (startTime: number, endTime: number) =>
  Number.isFinite(startTime) &&
  Number.isFinite(endTime) &&
  endTime > startTime &&
  endTime - startTime >= MIN_POST_DURATION_MINUTES * 60_000;

export const postsInLocalDay = (posts: Post[], userId: string, dayStart: number) => {
  const dayEnd = dayStart + 86_400_000;
  return posts.filter(
    (post) =>
      post.userId === userId &&
      !post.deletedAt &&
      post.startTime < dayEnd &&
      post.endTime > dayStart
  );
};

export const activityStats = (posts: Post[], now = Date.now()) => {
  const today = startOfLocalDay(now);
  const todayPosts = posts.filter((post) => !post.deletedAt && post.startTime >= today);
  const todayCoverage = analyzeDayCoverage(todayPosts, today);
  const total = posts.filter((post) => !post.deletedAt).length;

  return {
    todayCount: todayPosts.length,
    total,
    coveredMinutesToday: todayCoverage.coveredMinutes,
    coveragePercent: Math.round((todayCoverage.coveredMinutes / DAY_MINUTES) * 100),
  };
};
