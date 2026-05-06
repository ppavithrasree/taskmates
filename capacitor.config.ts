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
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0f9aa2",
      sound: "default",
    },
  },
};

export default config;
