import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineChips(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, '<span class="chip">$1</span>');
}

function classifyToken(token, index, commandIndex) {
  if (!token) {
    return 'plain';
  }

  if (/^#/.test(token)) {
    return 'comment';
  }

  if (/^'.*'$/.test(token) || /^".*"$/.test(token) || /<<'?EOF'?$/.test(token)) {
    return 'string';
  }

  if (/^\$[A-Z_][A-Z0-9_]*$/i.test(token)) {
    return 'env';
  }

  if (/^[-]{1,2}[\w-]+$/.test(token)) {
    return 'flag';
  }

  if (/^(~\/|\/)[^\s]*$/.test(token) || /^[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/.test(token)) {
    return 'path';
  }

  if (index === commandIndex || (commandIndex === 1 && index === 0 && token === 'sudo')) {
    return 'command';
  }

  if (/^\d+(\.\d+)*$/.test(token)) {
    return 'number';
  }

  return 'plain';
}

function renderCodeLine(line) {
  if (!line.trim()) {
    return '<span class="line empty">&nbsp;</span>';
  }

  if (line.trimStart().startsWith('#')) {
    return `<span class="line"><span class="comment">${escapeHtml(line)}</span></span>`;
  }

  const parts = line.split(/(\s+)/);
  const commandIndex = parts.findIndex((token) => token.trim().length > 0 && !token.includes('='));
  const html = parts.map((token, index) => {
    if (!token.trim()) {
      return escapeHtml(token);
    }

    const klass = classifyToken(token, index, commandIndex);
    return `<span class="${klass}">${escapeHtml(token)}</span>`;
  }).join('');

  return `<span class="line">${html}</span>`;
}

function renderCode(code) {
  return escapeHtml(code)
    .split('\n')
    .map((line, index) => `<span class="gutter">${index + 1}</span>${renderCodeLine(line)}`)
    .join('');
}

function summaryCardHtml(card) {
  const header = card.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const rows = card.rows.map((row) => `
    <tr>
      ${row.map((cell) => `<td>${renderInlineChips(cell)}</td>`).join('')}
    </tr>
  `).join('');

  return `
    <section id="capture" class="summary-card">
      <h1>${escapeHtml(card.title)}</h1>
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${card.footer ? `<p class="footer">${escapeHtml(card.footer)}</p>` : ''}
    </section>
  `;
}

function codeCardHtml(card) {
  return `
    <section id="capture" class="code-card">
      <div class="code-topbar">
        <div class="dots"><span></span><span></span><span></span></div>
        <div class="code-meta">
          ${card.title ? `<span class="code-title">${escapeHtml(card.title)}</span>` : ''}
          <span class="code-label">${escapeHtml(card.label || 'bash')}</span>
        </div>
      </div>
      <pre class="code-block">${renderCode(card.code)}</pre>
    </section>
  `;
}

function buildHtml(card) {
  const body = card.kind === 'summary-table'
    ? summaryCardHtml(card)
    : codeCardHtml(card);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        :root {
          color-scheme: dark;
          --bg: #0d1117;
          --panel: #111827;
          --line: #2b3442;
          --text: #f5f7fb;
          --muted: #9aa6b2;
          --chip: #1a2330;
          --accent: #f59e0b;
          --blue: #7dd3fc;
          --purple: #c4b5fd;
          --green: #86efac;
          --comment: #7f8ea3;
        }

        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: var(--bg);
          font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--text);
        }

        #capture {
          width: ${card.width || 1280}px;
        }

        .summary-card {
          padding: 40px 42px 28px;
        }

        .summary-card h1 {
          margin: 0 0 18px;
          font-size: 30px;
          line-height: 1.12;
          letter-spacing: -0.03em;
        }

        .summary-card table {
          width: 100%;
          border-collapse: collapse;
          font-size: 23px;
          line-height: 1.4;
          overflow: hidden;
          border: 1px solid var(--line);
          background: rgba(17, 24, 39, 0.7);
        }

        .summary-card th,
        .summary-card td {
          border: 1px solid var(--line);
          padding: 18px 20px;
          vertical-align: top;
        }

        .summary-card th {
          font-size: 22px;
          font-weight: 700;
          text-align: center;
        }

        .chip {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 10px;
          background: var(--chip);
          border: 1px solid rgba(255,255,255,0.06);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88em;
        }

        .summary-card .footer {
          margin: 22px 0 0;
          padding-top: 18px;
          border-top: 6px solid #3a4350;
          color: #e8edf5;
          font-style: italic;
          font-size: 22px;
        }

        .code-card {
          padding: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 22px;
          background:
            radial-gradient(circle at top left, rgba(245, 158, 11, 0.14), transparent 28%),
            radial-gradient(circle at top right, rgba(125, 211, 252, 0.10), transparent 30%),
            linear-gradient(180deg, #0f1722 0%, #0b1118 100%);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
        }

        .code-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 22px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }

        .dots {
          display: flex;
          gap: 8px;
        }

        .dots span {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: rgba(255,255,255,0.2);
        }

        .dots span:nth-child(1) { background: #fb7185; }
        .dots span:nth-child(2) { background: #f59e0b; }
        .dots span:nth-child(3) { background: #34d399; }

        .code-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        .code-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        }

        .code-label {
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(245, 158, 11, 0.16);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #ffd08a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .code-block {
          margin: 0;
          padding: 22px 26px 26px;
          display: grid;
          grid-template-columns: 40px 1fr;
          row-gap: 4px;
          column-gap: 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 24px;
          line-height: 1.55;
          white-space: pre-wrap;
        }

        .gutter {
          color: rgba(154, 166, 178, 0.55);
          text-align: right;
          user-select: none;
        }

        .line { display: block; }
        .line.empty { opacity: 0.2; }
        .command { color: #f59e0b; font-weight: 700; }
        .flag { color: var(--purple); }
        .path, .env { color: var(--blue); }
        .string { color: var(--green); }
        .comment { color: var(--comment); font-style: italic; }
        .number { color: #fca5a5; }
        .plain { color: #f5f7fb; }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

async function renderCard(page, card) {
  await page.setViewportSize({
    width: Math.max(1280, card.width || 1280),
    height: Math.max(720, card.height || 720)
  });
  await page.setContent(buildHtml(card), { waitUntil: 'load' });
  const capture = page.locator('#capture');
  await capture.screenshot({ path: card.outputPath });
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Usage: node scripts/render-article-panels.mjs <config.json>');
  }

  const raw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  const cards = Array.isArray(config.cards) ? config.cards : [];
  if (!cards.length) {
    throw new Error('Config file must contain a non-empty cards array.');
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  for (const card of cards) {
    const outputPath = path.resolve(card.outputPath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await renderCard(page, { ...card, outputPath });
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
