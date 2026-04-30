import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorTelemetry } from "./lib/error-telemetry";
import { initActionTrail } from "./lib/action-trail";

initErrorTelemetry();
initActionTrail();

createRoot(document.getElementById("root")!).render(<App />);
