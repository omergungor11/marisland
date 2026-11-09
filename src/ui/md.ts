/**
 * Small markdown renderer for the admin window (TASK-585): no dependency, pure, everything
 * HTML-escaped before any markup is added. Blocks: ATX headings, paragraphs, `-` / `*` / `1.`
 * lists (one nesting level), fenced code, `> quote`, pipe tables, `---` rules. Inline: `**bold**`,
 * `*italic*`, `` `code` ``, `[text](url)`, `[[name]]` (→ `a.mar-md-wiki[data-link]`).
 *
 * Every block (and list item / table row) carries `data-line` = its 1-based first line in `text`,
 * so a search hit can scroll to the block that holds its line.
 */

const ESC: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** `href` of a markdown link: web / mail / anchor links only (no `javascript:`); else null. */
function safeUrl(url: string): string | null {
  return /^(https?:\/\/|mailto:|#)/i.test(url) ? url : null;
}

/** Inline markup on one escaped line. Code spans are cut out first so nothing formats inside them. */
export function inlineMd(raw: string): string {
  const codes: string[] = [];
  let s = escHtml(raw).replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\uE000${codes.length - 1}\uE000`;
  });
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, name: string, label?: string) => {
    const n = name.trim();
    return `<a class="mar-md-wiki" data-link="${n}">${(label ?? n).trim()}</a>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'));
    if (href === null) return `<a class="mar-md-ref" data-ref="${url}">${text}</a>`;
    const ext = /^https?:\/\//i.test(href);
    return `<a href="${escHtml(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\uE000(\d+)\uE000/g, (_, i: string) => codes[Number(i)]);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;
const ITEM = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const startsBlock = (line: string, next: string | undefined): boolean =>
  HEADING.test(line) ||
  RULE.test(line) ||
  FENCE.test(line) ||
  ITEM.test(line) ||
  QUOTE.test(line) ||
  (line.includes('|') && next !== undefined && TABLE_SEP.test(next));

export function renderMd(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const at = i + 1;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const fence = (FENCE.exec(line) as RegExpExecArray)[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++; // the closing fence (or the end)
      out.push(`<pre data-line="${at}"><code>${escHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n} data-line="${at}">${inlineMd(h[2])}</h${n}>`);
      i++;
      continue;
    }
    if (RULE.test(line)) {
      out.push(`<hr data-line="${at}">`);
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]))
        body.push((QUOTE.exec(lines[i++]) as RegExpExecArray)[1]);
      out.push(`<blockquote data-line="${at}"><p>${inlineMd(body.join(' '))}</p></blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line);
      let html = `<table data-line="${at}"><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = cells(lines[i]);
        html += `<tr data-line="${i + 1}">${head.map((_, k) => `<td>${inlineMd(row[k] ?? '')}</td>`).join('')}</tr>`;
        i++;
      }
      out.push(`${html}</tbody></table>`);
      continue;
    }
    if (ITEM.test(line)) {
      out.push(list(lines, i, (end) => (i = end)));
      continue;
    }
    // paragraph: until a blank line or another block
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      (!body.length || !startsBlock(lines[i], lines[i + 1]))
    )
      body.push(lines[i++].trim());
    out.push(`<p data-line="${at}">${body.map(inlineMd).join(' ')}</p>`);
  }
  return out.join('\n');
}

/** A list from line `start`: items at its indent; deeper items nest one level under the last item. */
function list(lines: readonly string[], start: number, done: (end: number) => void): string {
  const first = ITEM.exec(lines[start]) as RegExpExecArray;
  const indent = first[1].length;
  const tag = /\d/.test(first[2]) ? 'ol' : 'ul';
  const items: {
    line: number;
    text: string;
    sub: { line: number; text: string; ol: boolean }[];
  }[] = [];
  let i = start;
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (m) {
      if (m[1].length > indent && items.length)
        items[items.length - 1].sub.push({ line: i + 1, text: m[3], ol: /\d/.test(m[2]) });
      else items.push({ line: i + 1, text: m[3], sub: [] });
      i++;
      continue;
    }
    // a continuation line (indented, not blank) joins the last item
    const last = items[items.length - 1];
    if (last && lines[i].trim() && /^\s+/.test(lines[i])) {
      const tail = last.sub.length ? last.sub[last.sub.length - 1] : last;
      tail.text += ` ${lines[i].trim()}`;
      i++;
      continue;
    }
    break;
  }
  done(i);
  const li = items
    .map((it) => {
      const sub = it.sub.length
        ? `<${it.sub[0].ol ? 'ol' : 'ul'}>${it.sub.map((s) => `<li data-line="${s.line}">${inlineMd(s.text)}</li>`).join('')}</${it.sub[0].ol ? 'ol' : 'ul'}>`
        : '';
      return `<li data-line="${it.line}">${inlineMd(it.text)}${sub}</li>`;
    })
    .join('');
  return `<${tag} data-line="${start + 1}">${li}</${tag}>`;
}
