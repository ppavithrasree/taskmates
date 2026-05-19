import type { AppContextValue } from "@/context/AppContext";

export type AppContextValueForAi = Pick<
  AppContextValue,
  | "currentUser"
  | "posts"
  | "groupMessages"
  | "settings"
  | "visibleGroups"
  | "addPost"
  | "updatePost"
  | "addGroupMessage"
  | "updateTheme"
  | "updateUserSettings"
  | "runRetentionCleanup"
>;
