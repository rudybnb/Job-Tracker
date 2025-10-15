import { createRoot } from "react-dom/client";
import "./lib/setupFetch";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
