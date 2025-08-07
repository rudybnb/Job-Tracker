import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { VersionChecker } from "./utils/version-check";

// TEMPORARILY DISABLE version checking to stop refresh loop
console.log('✅ App version check disabled (2.0.2-nuclear-refresh active)');
createRoot(document.getElementById("root")!).render(<App />);

// Manual version check available through /nuclear-refresh
