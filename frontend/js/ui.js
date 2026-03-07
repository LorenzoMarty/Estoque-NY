let tooltipInstances = [];
let closeDrawerFn = null;
let restoreFocusElement = null;

function cleanupTooltips() {
  tooltipInstances.forEach((instance) => instance.destroy());
  tooltipInstances = [];
}

function getFocusableElements(scope) {
  if (!scope) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(scope.querySelectorAll(selector)).filter((node) => !node.hidden);
}

function copyToClipboard(value) {
  if (!value) return Promise.reject(new Error("empty"));
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }

  return new Promise((resolve, reject) => {
    try {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) {
        reject(new Error("copy_failed"));
        return;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

export { copyToClipboard };

export function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

export function initTooltips(scope = document) {
  cleanupTooltips();

  if (!window.tippy) {
    return;
  }

  const elements = scope.querySelectorAll("[data-tippy-content]");
  if (!elements.length) {
    return;
  }

  tooltipInstances = window.tippy(elements, {
    theme: "estoque",
    duration: [120, 100],
    delay: [120, 20],
    maxWidth: 260,
    appendTo: document.body,
  });
}

export function applyReveal(scope = document) {
  const nodes = Array.from(scope.querySelectorAll(".reveal"));
  if (!nodes.length) return;
  nodes.forEach((node) => {
    node.style.transitionDelay = "0ms";
    node.classList.add("is-visible");
  });
}

export function showToast({ title, message, type = "success" }) {
  const region = document.getElementById("toastRegion");
  if (!region) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `<strong>${title}</strong><small>${message}</small>`;

  region.prepend(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

export function closeDrawer() {
  if (closeDrawerFn) {
    closeDrawerFn();
    closeDrawerFn = null;
  }
}

export function openDrawer({
  title,
  subtitle = "",
  bodyHtml,
  submitLabel,
  cancelLabel,
  onSubmit,
  onOpen,
  footerHtml,
  initialFocusSelector,
}) {
  closeDrawer();

  const root = document.getElementById("modalRoot");
  if (!root) {
    return;
  }

  restoreFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const footerMarkup =
    footerHtml ||
    `<div class="drawer-footer">
      ${
        cancelLabel
          ? `<button class="btn ghost" type="button" data-close-drawer>${cancelLabel}</button>`
          : ""
      }
      ${
        submitLabel
          ? `<button class="btn primary" type="submit">${submitLabel}</button>`
          : ""
      }
    </div>`;

  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  overlay.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${title}">
      <form id="drawerForm" novalidate>
        <header class="drawer-header">
          <div>
            <h3>${title}</h3>
            <p>${subtitle}</p>
          </div>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Fechar">✕</button>
        </header>
        <div class="drawer-body">
          <div id="drawerError" hidden></div>
          ${bodyHtml}
        </div>
        ${footerMarkup}
      </form>
    </aside>
  `;

  const form = overlay.querySelector("#drawerForm");
  const drawer = overlay.querySelector(".drawer");
  const errorBox = overlay.querySelector("#drawerError");
  const submitButton = form.querySelector("button[type='submit']");
  let customCleanup = null;

  function setError(message) {
    if (!errorBox) return;
    errorBox.hidden = false;
    errorBox.className = "form-error";
    errorBox.textContent = message;
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function setSubmitting(isSubmitting) {
    const nextValue = Boolean(isSubmitting);
    form.setAttribute("aria-busy", String(nextValue));
    form
      .querySelectorAll("button, input, select, textarea")
      .forEach((element) => {
        element.disabled = nextValue;
      });

    if (submitButton) {
      if (!submitButton.dataset.defaultLabel) {
        submitButton.dataset.defaultLabel = submitButton.textContent || "";
      }
      submitButton.textContent = nextValue
        ? "Processando..."
        : submitButton.dataset.defaultLabel || submitButton.textContent || "";
    }
  }

  function close() {
    document.removeEventListener("keydown", onKeydown, true);
    if (typeof customCleanup === "function") {
      customCleanup();
    }
    overlay.remove();
    document.body.style.overflow = "";
    if (restoreFocusElement) {
      restoreFocusElement.focus();
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusables = getFocusableElements(overlay);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", close);
  });

  if (onSubmit) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();
      setSubmitting(true);

      const formData = new FormData(form);

      try {
        const result = await onSubmit(formData, {
          close,
          setError,
          clearError,
          setSubmitting,
          form,
          overlay,
        });

        setSubmitting(false);
        if (result !== false) {
          close();
        }
      } catch {
        setSubmitting(false);
        setError("Erro inesperado ao processar a ação.");
      }
    });
  } else {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }

  root.innerHTML = "";
  root.appendChild(overlay);

  document.addEventListener("keydown", onKeydown, true);
  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
    const focusTarget =
      (initialFocusSelector && overlay.querySelector(initialFocusSelector)) ||
      overlay.querySelector("input, select, textarea, button");
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus();
    }
  });

  if (onOpen) {
    const maybeCleanup = onOpen(overlay, {
      close,
      setError,
      clearError,
      form,
    });
    if (typeof maybeCleanup === "function") {
      customCleanup = maybeCleanup;
    }
  }

  closeDrawerFn = close;
}
