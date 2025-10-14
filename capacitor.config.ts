import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rudybnb.jobtracker", // unique ID
  appName: "Job Tracker",
  webDir: "dist", // or "dist/public" if that’s where vite outputs
  bundledWebRuntime: false
};

export default config;
