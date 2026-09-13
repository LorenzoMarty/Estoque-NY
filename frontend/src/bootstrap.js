const REQUIRED_GLOBALS = [
  { key: "Chart", src: "/vendor/chart.umd.min.js" },
  { key: "luxon", src: "/vendor/luxon.min.js" },
  { key: "Popper", src: "/vendor/popper.min.js" },
  { key: "tippy", src: "/vendor/tippy-bundle.umd.min.js" },
  { key: "lucide", src: "/vendor/lucide.min.js" },
];

function getBootstrapTarget() {
  return document.getElementById("pageContent");
}

function stringifyError(error) {
  if (typeof error === "string") {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  return JSON.stringify(error || "Erro desconhecido");
}

export function renderBootstrapError(error) {
  const target = getBootstrapTarget();

  if (!target) {
    return;
  }

  target.innerHTML = `
    <section class="bootstrap-error">
      <h2>Falha ao iniciar a interface</h2>
      <p>Abra o console do navegador para detalhes tecnicos.</p>
      <code>${stringifyError(error)}</code>
    </section>
  `;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

export async function ensureLegacyVendors() {
  for (const entry of REQUIRED_GLOBALS) {
    if (!window[entry.key]) {
      await loadScript(entry.src);
    }

    if (!window[entry.key]) {
      throw new Error(`Dependencia global indisponivel: ${entry.key}`);
    }
  }
}
