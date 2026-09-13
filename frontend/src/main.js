import "../vendor/tippy.css";
import "../css/app.css";
import "../css/responsive.css";
import { ensureLegacyVendors, renderBootstrapError } from "./bootstrap.js";

window.addEventListener("error", (event) => {
  renderBootstrapError(event.error || event.message || "Erro em tempo de execucao");
});

window.addEventListener("unhandledrejection", (event) => {
  renderBootstrapError(event.reason || "Promessa rejeitada sem tratamento");
});

async function bootstrap() {
  await ensureLegacyVendors();
  await import("../js/main.js");
}

bootstrap().catch((error) => {
  renderBootstrapError(error);
  console.error("Bootstrap error:", error);
});
