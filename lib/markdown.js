'use strict';

// 블로그에 필요한 범위의 마크다운만 지원하는 파서.
// 블록을 먼저 나눈 뒤, 각 블록 안의 인라인 문법을 처리한다.
// 원본 HTML은 지원하지 않으며 모두 이스케이프한다.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s/;

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function render(markdown, options = {}) {
  const minHeading = options.minHeading || 1;
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines, minHeading).join('\n');
}

// ---------- 블록 ----------

function parseBlocks(lines, minHeading) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = matchFence(line);
    if (fence) {
      const code = parseFence(lines, i, fence);
      blocks.push(code.html);
      i = code.end;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.max(heading[1].length, minHeading);
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(QUOTE, ''));
        i++;
      }
      blocks.push(`<blockquote>\n${parseBlocks(inner, minHeading).join('\n')}\n</blockquote>`);
      continue;
    }

    if (matchListItem(line)) {
      const list = parseList(lines, i, minHeading);
      blocks.push(list.html);
      i = list.end;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      blocks.push(table.html);
      i = table.end;
      continue;
    }

    // 줄 끝 공백 두 칸은 줄바꿈 표시이므로 앞쪽 공백만 지운다.
    const paragraph = [line.replace(/^[ \t]+/, '')];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !interruptsParagraph(lines, i)) {
      paragraph.push(lines[i].replace(/^[ \t]+/, ''));
      i++;
    }
    blocks.push(`<p>${renderInline(paragraph.join('\n').trimEnd())}</p>`);
  }

  return blocks;
}

function interruptsParagraph(lines, i) {
  const line = lines[i];
  if (matchFence(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line)) return true;
  if (isTableStart(lines, i)) return true;
  const item = matchListItem(line);
  // "2024. 올해는"처럼 숫자로 시작하는 문장이 목록으로 바뀌지 않게 1번만 허용한다.
  return Boolean(item && item.content !== '' && (!item.ordered || item.start === 1));
}

function isBlank(line) {
  return line.trim() === '';
}

function matchFence(line) {
  const match = line.match(FENCE);
  if (!match) return null;
  // 백틱 펜스의 정보 문자열에 백틱이 있으면 인라인 코드다.
  if (match[1][0] === '`' && match[2].includes('`')) return null;
  return {
    char: match[1][0],
    length: match[1].length,
    info: match[2].trim(),
    indent: indentOf(line),
  };
}

function parseFence(lines, start, fence) {
  const content = [];
  let i = start + 1;

  while (i < lines.length) {
    const closing = lines[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
    if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
      i++;
      break;
    }
    content.push(stripIndent(lines[i], fence.indent));
    i++;
  }

  const language = fence.info.split(/\s+/)[0].replace(/[^\w+#.-]/g, '');
  const classAttr = language ? ` class="language-${language}"` : '';
  const body = content.length ? `${escapeHtml(content.join('\n'))}\n` : '';
  return { html: `<pre tabindex="0"><code${classAttr}>${body}</code></pre>`, end: i };
}

function indentOf(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4;
    else break;
  }
  return width;
}

function stripIndent(line, amount) {
  let width = 0;
  let i = 0;
  while (i < line.length && width < amount) {
    if (line[i] === ' ') width += 1;
    else if (line[i] === '\t') width += 4;
    else break;
    i++;
  }
  return line.slice(i);
}

function matchListItem(line) {
  if (HR.test(line)) return null;
  const match = line.match(LIST_ITEM);
  if (!match) return null;

  const indent = indentOf(match[1]);
  const marker = match[2];
  const ordered = /\d/.test(marker[0]);
  const gap = indentOf(match[3]);
  return {
    indent,
    ordered,
    kind: ordered ? marker[marker.length - 1] : marker,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    content: match[4],
    contentIndent: indent + marker.length + (gap > 4 ? 1 : gap),
  };
}

function parseList(lines, start, minHeading) {
  const first = matchListItem(lines[start]);
  const items = [];
  let loose = false;
  let i = start;

  while (i < lines.length) {
    const item = matchListItem(lines[i]);
    if (!item || item.indent !== first.indent || item.kind !== first.kind) break;

    const body = [item.content];
    i++;

    while (i < lines.length) {
      if (isBlank(lines[i])) {
        const next = nextFilledLine(lines, i);
        if (next === -1 || indentOf(lines[next]) <= first.indent) break;
        for (let blank = i; blank < next; blank++) body.push('');
        loose = true;
        i = next;
        continue;
      }
      if (indentOf(lines[i]) <= first.indent) break;
      body.push(stripIndent(lines[i], item.contentIndent));
      i++;
    }
    items.push(body);

    if (i < lines.length && isBlank(lines[i])) {
      const next = nextFilledLine(lines, i);
      const sibling = next === -1 ? null : matchListItem(lines[next]);
      if (!sibling || sibling.indent !== first.indent || sibling.kind !== first.kind) break;
      loose = true;
      i = next;
    }
  }

  const tag = first.ordered ? 'ol' : 'ul';
  const startAttr = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
  const html = items.map((body) => {
    const blocks = parseBlocks(body, minHeading).map((block) => (loose ? block : unwrapParagraph(block)));
    return `<li>${blocks.join('\n')}</li>`;
  });
  return { html: `<${tag}${startAttr}>\n${html.join('\n')}\n</${tag}>`, end: i };
}

function nextFilledLine(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (!isBlank(lines[i])) return i;
  }
  return -1;
}

function unwrapParagraph(block) {
  return block.startsWith('<p>') && block.endsWith('</p>') ? block.slice(3, -4) : block;
}

function isTableStart(lines, i) {
  if (i + 1 >= lines.length || !lines[i].includes('|')) return false;
  const delimiter = lines[i + 1];
  if (!delimiter.includes('|') || !TABLE_DELIMITER.test(delimiter)) return false;
  return splitRow(lines[i]).length === splitRow(delimiter).length;
}

function splitRow(line) {
  const text = line.trim();
  const cells = [];
  let current = '';
  let endedWithPipe = false;

  for (let i = text.startsWith('|') ? 1 : 0; i < text.length; i++) {
    endedWithPipe = false;
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i++;
    } else if (text[i] === '|') {
      cells.push(current.trim());
      current = '';
      endedWithPipe = true;
    } else {
      current += text[i];
    }
  }
  if (!endedWithPipe) cells.push(current.trim());
  return cells;
}

function parseTable(lines, start) {
  const header = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return left ? 'left' : '';
  });

  const cell = (tag, text, column) => {
    const style = aligns[column] ? ` style="text-align:${aligns[column]}"` : '';
    return `<${tag}${style}>${renderInline(text)}</${tag}>`;
  };

  const rows = [];
  let i = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && !interruptsParagraph(lines, i)) {
    const values = splitRow(lines[i]);
    rows.push(`<tr>${header.map((_, column) => cell('td', values[column] || '', column)).join('')}</tr>`);
    i++;
  }

  const head = `<thead>\n<tr>${header.map((text, column) => cell('th', text, column)).join('')}</tr>\n</thead>`;
  const body = rows.length ? `\n<tbody>\n${rows.join('\n')}\n</tbody>` : '';
  return {
    html: `<div class="table-wrap" tabindex="0">\n<table>\n${head}${body}\n</table>\n</div>`,
    end: i,
  };
}

// ---------- 인라인 ----------

function renderInline(text, noLinks = false) {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '\n') {
        out += '<br>\n';
        i += 2;
      } else if (next !== undefined && PUNCTUATION.test(next)) {
        out += escapeHtml(next);
        i += 2;
      } else {
        out += '\\';
        i++;
      }
      continue;
    }

    if (ch === '`') {
      const run = runLength(text, i, '`');
      const close = findCodeClose(text, i + run, run);
      if (close === -1) {
        out += text.slice(i, i + run);
        i += run;
      } else {
        out += `<code>${escapeHtml(normalizeCodeSpan(text.slice(i + run, close)))}</code>`;
        i = close + run;
      }
      continue;
    }

    if (ch === '!' && text[i + 1] === '[') {
      const image = parseLinkAt(text, i + 1);
      if (image) {
        out += renderImage(image);
        i = image.end;
        continue;
      }
    }

    if (ch === '[' && !noLinks) {
      const link = parseLinkAt(text, i);
      if (link) {
        out += renderLink(link);
        i = link.end;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      const emphasis = parseEmphasis(text, i, noLinks);
      out += emphasis.html;
      i = emphasis.end;
      continue;
    }

    if (ch === ' ') {
      const run = runLength(text, i, ' ');
      if (text[i + run] === '\n') {
        out += run >= 2 ? '<br>\n' : '\n';
        i += run + 1;
        continue;
      }
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function runLength(text, start, ch) {
  let end = start;
  while (text[end] === ch) end++;
  return end - start;
}

function findCodeClose(text, from, length) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      const run = runLength(text, i, '`');
      if (run === length) return i;
      i += run;
    } else {
      i++;
    }
  }
  return -1;
}

function normalizeCodeSpan(code) {
  const flat = code.replace(/\n/g, ' ');
  const padded = flat.length > 2 && flat.startsWith(' ') && flat.endsWith(' ') && flat.trim() !== '';
  return padded ? flat.slice(1, -1) : flat;
}

// `*`와 `_` 강조. CommonMark의 구두점 규칙은 `**"인용"**은` 같은 한글 문장에서
// 강조가 풀리는 문제가 있어, 안쪽에 공백이 없으면 강조로 인정한다.
// `_`는 snake_case를 보호하기 위해 단어 중간에서는 쓰지 않는다.
function parseEmphasis(text, start, noLinks) {
  const delimiter = text[start];
  const run = runLength(text, start, delimiter);
  const after = text[start + run];
  const before = start > 0 ? text[start - 1] : '';
  const canOpen =
    run <= 3 &&
    after !== undefined &&
    !WHITESPACE.test(after) &&
    (delimiter === '*' || !WORD_CHAR.test(before));

  if (canOpen) {
    for (let size = run; size >= 1; size--) {
      const contentStart = start + size;
      const close = findEmphasisClose(text, contentStart, delimiter, size);
      if (close !== -1) {
        const inner = renderInline(text.slice(contentStart, close), noLinks);
        return { html: wrapEmphasis(inner, size), end: close + size };
      }
    }
  }
  return { html: delimiter.repeat(run), end: start + run };
}

function wrapEmphasis(inner, size) {
  if (size === 3) return `<strong><em>${inner}</em></strong>`;
  return size === 2 ? `<strong>${inner}</strong>` : `<em>${inner}</em>`;
}

function findEmphasisClose(text, from, delimiter, size) {
  let i = from;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\') {
      i += 2;
    } else if (ch === '`') {
      const run = runLength(text, i, '`');
      const close = findCodeClose(text, i + run, run);
      i = close === -1 ? i + run : close + run;
    } else if (ch === ']' && text[i + 1] === '(') {
      // 링크 주소 안의 `_`나 `*`를 닫는 기호로 오해하지 않게 건너뛴다.
      const close = text.indexOf(')', i);
      i = close === -1 ? i + 1 : close + 1;
    } else if (ch === delimiter) {
      const run = runLength(text, i, delimiter);
      const canClose =
        i > from &&
        !WHITESPACE.test(text[i - 1]) &&
        (delimiter === '*' || !WORD_CHAR.test(text[i + run] || ''));
      if (canClose && run === size) return i;
      i += run;
    } else {
      i++;
    }
  }
  return -1;
}

// `[`의 위치를 받아 `[라벨](주소 "제목")`을 해석한다. 형식이 아니면 null.
function parseLinkAt(text, open) {
  const labelEnd = findLabelEnd(text, open);
  if (labelEnd === -1 || text[labelEnd + 1] !== '(') return null;

  let i = labelEnd + 2;
  const skipSpaces = () => {
    while (i < text.length && WHITESPACE.test(text[i])) i++;
  };

  skipSpaces();
  let url = '';
  if (text[i] === '<') {
    const close = text.indexOf('>', i);
    if (close === -1 || text.slice(i, close).includes('\n')) return null;
    url = text.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const urlStart = i;
    while (i < text.length && !WHITESPACE.test(text[i])) {
      if (text[i] === '(') depth++;
      if (text[i] === ')') {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }
    url = text.slice(urlStart, i);
  }

  skipSpaces();
  let title = '';
  if (text[i] === '"' || text[i] === "'") {
    const close = text.indexOf(text[i], i + 1);
    if (close === -1) return null;
    title = text.slice(i + 1, close);
    i = close + 1;
    skipSpaces();
  }

  if (text[i] !== ')') return null;
  return { label: text.slice(open + 1, labelEnd), url, title, end: i + 1 };
}

function findLabelEnd(text, open) {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
    } else if (ch === '`') {
      const run = runLength(text, i, '`');
      const close = findCodeClose(text, i + run, run);
      i = close === -1 ? i + run : close + run;
    } else {
      if (ch === '[') depth++;
      if (ch === ']') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
  }
  return -1;
}

function isSafeUrl(url) {
  // 브라우저가 스킴을 해석할 때 무시하는 제어 문자와 공백을 지운 뒤 검사한다.
  const compact = url.replace(/[\u0000- \u007f-\u009f]/g, '');
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  return !scheme || ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

function renderLink(link) {
  const label = renderInline(link.label, true);
  if (!isSafeUrl(link.url)) return label;
  const title = link.title ? ` title="${escapeHtml(link.title)}"` : '';
  return `<a href="${escapeHtml(link.url)}"${title}>${label}</a>`;
}

function renderImage(image) {
  if (!isSafeUrl(image.url)) return escapeHtml(image.label);
  const title = image.title ? ` title="${escapeHtml(image.title)}"` : '';
  return `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.label)}"${title} loading="lazy">`;
}

module.exports = { render, escapeHtml };
