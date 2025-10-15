import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rudybnb.jobtracker",
  appName: "Job Tracker",
 webDir: "dist/public", // ✅ correct output folder for your Vite build
bundledWebRuntime: false
};

export default config;
