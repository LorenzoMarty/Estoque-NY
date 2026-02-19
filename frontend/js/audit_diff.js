import { escapeHtml } from "./utils.js";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function flattenObject(value, prefix = "", output = {}) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    const key = prefix || "(valor)";
    output[key] = value;
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenObject(entry, nextPrefix, output);
    });
    return output;
  }

  Object.entries(value).forEach(([key, entry]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(entry) || Array.isArray(entry)) {
      flattenObject(entry, nextPrefix, output);
      return;
    }
    output[nextPrefix] = entry;
  });
  return output;
}

function serializeValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildDiffRows(beforeData, afterData) {
  const beforeFlat = flattenObject(beforeData || {});
  const afterFlat = flattenObject(afterData || {});
  const keys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);

  return Array.from(keys)
    .map((path) => {
      const beforeValue = beforeFlat[path];
      const afterValue = afterFlat[path];
      const beforeText = serializeValue(beforeValue);
      const afterText = serializeValue(afterValue);
      const changed = beforeText !== afterText;
      return {
        path,
        beforeText,
        afterText,
        changed,
      };
    })
    .filter((row) => row.changed)
    .slice(0, 120);
}

function prettyJson(value) {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderDiffRows(rows) {
  if (!rows.length) {
    return `
      <div class="empty-state">
        <i data-lucide="file-search"></i>
        <span>Nenhuma diferenca detectada para este evento.</span>
      </div>
    `;
  }

  return `
    <div class="table-wrap audit-diff-table-wrap">
      <table class="audit-diff-table">
        <thead>
          <tr>
            <th>Campo</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><code>${escapeHtml(row.path)}</code></td>
                  <td>${escapeHtml(row.beforeText)}</td>
                  <td>${escapeHtml(row.afterText)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderJsonCard(title, data, blockId) {
  return `
    <article class="drawer-section">
      <h4>${title}</h4>
      <div class="audit-json-wrap">
        <pre class="audit-json-block"><code id="${blockId}" class="language-json">${escapeHtml(
          prettyJson(data)
        )}</code></pre>
      </div>
    </article>
  `;
}

export function renderAuditDiffSection(log) {
  const diffRows = buildDiffRows(log.before_data, log.after_data);

  return `
    <section class="drawer-section">
      <h4>Alteracoes realizadas</h4>
      ${renderDiffRows(diffRows)}
    </section>

    <div class="audit-json-grid">
      ${renderJsonCard("Antes", log.before_data || {}, `auditBeforeJson-${log.id}`)}
      ${renderJsonCard("Depois", log.after_data || {}, `auditAfterJson-${log.id}`)}
    </div>
  `;
}

export function buildAuditDetailJson(log) {
  return JSON.stringify(
    {
      id: log.id,
      occurred_at: log.occurred_at,
      user_id: log.user_id,
      user_name: log.user_name,
      action: log.action,
      action_detail: log.action_detail,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      severity: log.severity,
      origin_ip: log.origin_ip,
      origin_device: log.origin_device,
      reason: log.reason,
      reference_id: log.reference_id,
      notes: log.notes,
      before_data: log.before_data,
      after_data: log.after_data,
      message: log.message,
    },
    null,
    2
  );
}

export function enhanceAuditDiffHighlight(scope = document) {
  if (!scope || !window.Prism || typeof window.Prism.highlightElement !== "function") {
    return;
  }

  scope.querySelectorAll("code.language-json").forEach((node) => {
    window.Prism.highlightElement(node);
  });
}
