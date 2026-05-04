import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const LS_KEY = "taskmates_activity_state_v1";

const applyInitialTheme = () => {
    let theme: "light" | "dark" = "dark";
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { settings?: { theme?: "light" | "dark" } };
            theme = parsed.settings?.theme ?? "dark";
        }
    } catch {
        theme = "dark";
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
};

applyInitialTheme();

createRoot(document.getElementById("root")!).render(<App />);
