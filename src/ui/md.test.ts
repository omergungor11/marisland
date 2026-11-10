import { describe, expect, it } from 'vitest';
import { inlineMd, renderMd } from './md.ts';

describe('renderMd (TASK-585)', () => {
  it('escapes HTML before any markup', () => {
    const html = renderMd('<script>alert("x")</script>\n\n# <b>hi</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('<h1 data-line="3">&lt;b&gt;hi&lt;/b&gt;</h1>');
  });

  it('renders ATX headings with their source line', () => {
    const html = renderMd('# Bir\n\n## İki ##\n###### Altı');
    expect(html).toContain('<h1 data-line="1">Bir</h1>');
    expect(html).toContain('<h2 data-line="3">İki</h2>');
    expect(html).toContain('<h6 data-line="4">Altı</h6>');
  });

  it('joins paragraph lines and maps the first line', () => {
    const html = renderMd('ilk satır\nikinci satır\n\nyeni paragraf');
    expect(html).toContain('<p data-line="1">ilk satır ikinci satır</p>');
    expect(html).toContain('<p data-line="4">yeni paragraf</p>');
  });

  it('inline: bold, italic, code (no formatting inside code)', () => {
    expect(inlineMd('**kalın** ve *eğik*')).toBe('<strong>kalın</strong> ve <em>eğik</em>');
    expect(inlineMd('`a **b** <c>`')).toBe('<code>a **b** &lt;c&gt;</code>');
    expect(inlineMd('2 * 3 * 4')).toBe('2 * 3 * 4');
  });

  it('links: external opens a new tab, javascript: is not a link', () => {
    expect(inlineMd('[three](https://threejs.org)')).toBe(
      '<a href="https://threejs.org" target="_blank" rel="noopener">three</a>',
    );
    expect(inlineMd('[x](javascript:alert(1))')).not.toContain('href=');
    expect(inlineMd('[doc](mar-docs/MEMORY.md)')).toBe(
      '<a class="mar-md-ref" data-ref="mar-docs/MEMORY.md">doc</a>',
    );
  });

  it('wiki links carry the target name', () => {
    expect(inlineMd('bkz. [[gölge acne]]')).toBe(
      'bkz. <a class="mar-md-wiki" data-link="gölge acne">gölge acne</a>',
    );
    expect(inlineMd('[[a-b|etiket]]')).toBe('<a class="mar-md-wiki" data-link="a-b">etiket</a>');
  });

  it('lists: unordered, ordered, one nesting level', () => {
    const html = renderMd('- bir\n- iki\n  - alt\n* üç\n\n1. a\n2. b');
    expect(html).toContain(
      '<ul data-line="1"><li data-line="1">bir</li><li data-line="2">iki<ul><li data-line="3">alt</li></ul></li><li data-line="4">üç</li></ul>',
    );
    expect(html).toContain(
      '<ol data-line="6"><li data-line="6">a</li><li data-line="7">b</li></ol>',
    );
  });

  it('fenced code is escaped and not formatted', () => {
    const html = renderMd('metin\n```ts\nconst a = 1 < 2; // **x**\n```\nsonra');
    expect(html).toContain('<pre data-line="2"><code>const a = 1 &lt; 2; // **x**</code></pre>');
    expect(html).toContain('<p data-line="5">sonra</p>');
  });

  it('quotes, rules and tables', () => {
    const html = renderMd('> alıntı\n> devam\n\n---\n\n| A | B |\n|---|:-:|\n| 1 | **2** |');
    expect(html).toContain('<blockquote data-line="1"><p>alıntı devam</p></blockquote>');
    expect(html).toContain('<hr data-line="4">');
    expect(html).toContain(
      '<table data-line="6"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr data-line="8"><td>1</td><td><strong>2</strong></td></tr></tbody></table>',
    );
  });

  it('a heading right after a paragraph line starts its own block', () => {
    expect(renderMd('para\n# Başlık')).toBe(
      '<p data-line="1">para</p>\n<h1 data-line="2">Başlık</h1>',
    );
  });
});
