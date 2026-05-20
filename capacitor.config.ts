import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.taskmates.daily",
  appName: "TaskMates",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_taskmates",
      iconColor: "#2563eb",
    },
  },
};

export default config;
