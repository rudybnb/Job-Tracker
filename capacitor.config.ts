// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rudybnb.jobtracker',
  appName: 'Job Tracker',
  webDir: 'dist/public',
  bundledWebRuntime: false,
};

export default config;
