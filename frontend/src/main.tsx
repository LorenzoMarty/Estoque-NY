import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import "../css/app.css";
import "../css/responsive.css";
import "../css/redesign.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initErrorReporting } from "./shared/errorReporting";

void initErrorReporting();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento #root nao encontrado em index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
