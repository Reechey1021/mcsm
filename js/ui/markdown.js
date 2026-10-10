// ui/markdown.js
// A deliberately small Markdown subset for admin-written pages (the rules page):
// # / ## / ### headings, paragraphs, - and 1. lists, **bold**, *italic*, [links](https://…), > notes.
// Built as DOM nodes, never innerHTML, so nothing typed can inject markup.
import { h } from '../core/dom.js';

function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(h('strong', null, tok.slice(2, -2)));
    else if (tok.startsWith('*')) out.push(h('em', null, tok.slice(1, -1)));
    else { const mm = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(tok); out.push(h('a', { href: mm[2], target: '_blank', rel: 'noopener', style: 'color:var(--accent-text);font-weight:650' }, mm[1])); }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(src) {
  const root = h('div', { class: 'md' });
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let para = [], list = null, listType = null;
  const flushPara = () => { if (para.length) { root.append(h('p', null, inline(para.join(' ')))); para = []; } };
  const flushList = () => { if (list) { root.append(list); list = null; listType = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); flushList(); root.append(h(['h2', 'h3', 'h4'][m[1].length - 1], null, inline(m[2]))); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); root.append(h('blockquote', null, inline(m[1]))); continue; }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      const type = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || listType !== type) { flushList(); list = h(type); listType = type; }
      list.append(h('li', null, inline(m[1])));
      continue;
    }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return root;
}
