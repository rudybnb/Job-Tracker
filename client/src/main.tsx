import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { VersionChecker } from "./utils/version-check";

// Check version and refresh if needed (mobile cache fix)
const needsRefresh = VersionChecker.checkVersionAndRefresh();

if (!needsRefresh) {
  console.log('✅ App version check passed:', VersionChecker.getCurrentVersion());
  createRoot(document.getElementById("root")!).render(<App />);
}
