import type { Group, GroupMessage, Post, User } from "@/types";

const weekMs = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyRecap {
  tasksCompleted: number;
  activeGroups: Array<{ name: string; count: number }>;
  productivityTrend: string;
  pendingWork: string[];
  suggestions: string[];
  coveredHours: number;
}

export const generateWeeklyRecap = ({
  user,
  posts,
  groups,
  messages,
}: {
  user: User;
  posts: Post[];
  groups: Group[];
  messages: GroupMessage[];
}): WeeklyRecap => {
  const now = Date.now();
  const weekStart = now - weekMs;
  const priorWeekStart = now - weekMs * 2;
  const myWeekPosts = posts.filter((post) => post.userId === user.id && !post.deletedAt && post.startTime >= weekStart);
  const myPriorPosts = posts.filter((post) => post.userId === user.id && !post.deletedAt && post.startTime >= priorWeekStart && post.startTime < weekStart);
  const coveredMinutes = myWeekPosts.reduce((total, post) => total + Math.max(0, post.endTime - post.startTime) / 60_000, 0);
  const priorMinutes = myPriorPosts.reduce((total, post) => total + Math.max(0, post.endTime - post.startTime) / 60_000, 0);

  const activeGroups = groups
    .map((group) => ({
      name: group.name,
      count: messages.filter((message) => message.groupId === group.id && message.createdAt >= weekStart && message.senderId === user.id).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const trendDelta = coveredMinutes - priorMinutes;
  const productivityTrend =
    Math.abs(trendDelta) < 45
      ? "Steady compared with last week"
      : trendDelta > 0
        ? `Up by ${Math.round(trendDelta / 60)} hours compared with last week`
        : `Down by ${Math.round(Math.abs(trendDelta) / 60)} hours compared with last week`;

  const pendingWork = myWeekPosts
    .filter((post) => /\b(todo|pending|follow up|blocker|later|tomorrow|next)\b/i.test(post.content))
    .slice(0, 4)
    .map((post) => post.content.slice(0, 110));

  const suggestions = [
    coveredMinutes < 18 * 60 ? "Log shorter blocks during the day so your recap has stronger signal." : "Keep the logging rhythm; your week has solid coverage.",
    activeGroups.length === 0 ? "Share one concise group update to keep collaborators aligned." : "Turn your busiest group conversations into clear next steps.",
    pendingWork.length > 0 ? "Review pending items before starting a new work block." : "Add explicit next actions to posts when a task is not finished.",
  ];

  return {
    tasksCompleted: myWeekPosts.length,
    activeGroups,
    productivityTrend,
    pendingWork,
    suggestions,
    coveredHours: Math.round(coveredMinutes / 60),
  };
};

export const recapToText = (recap: WeeklyRecap) => {
  const groups = recap.activeGroups.length
    ? recap.activeGroups.map((group) => `${group.name} (${group.count})`).join(", ")
    : "No group activity yet";
  const pending = recap.pendingWork.length ? recap.pendingWork.join("; ") : "No obvious pending work found";
  return [
    `Weekly recap: ${recap.tasksCompleted} activity posts, about ${recap.coveredHours} logged hours.`,
    `Most active groups: ${groups}.`,
    `Trend: ${recap.productivityTrend}.`,
    `Pending: ${pending}.`,
    `Suggestions: ${recap.suggestions.join(" ")}`,
  ].join("\n");
};
