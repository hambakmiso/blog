'use strict';

// 글 상단의 `---` 블록을 읽는다. 이 프로젝트에서 쓰는 형식만 지원하며
// 범용 YAML 파서가 아니다. 이해할 수 없는 값은 조용히 넘기지 않고 오류로 알린다.

function parseFrontmatter(source, filename) {
  const fail = (message) => new Error(`${filename}: ${message}`);
  const text = String(source).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  if (lines[0].trim() !== '---') {
    throw fail('파일 첫 줄에 메타데이터 시작 구분선(---)이 없습니다.');
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) {
    throw fail('메타데이터 끝 구분선(---)이 없습니다.');
  }

  const fields = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) {
      throw fail(`메타데이터 줄을 해석할 수 없습니다: "${line.trim()}" (키: 값 형식으로 쓰세요)`);
    }
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  const title = unquote(fields.title || '');
  if (!title) throw fail('title이 없습니다.');

  const date = unquote(fields.date || '');
  if (!date) throw fail('date가 없습니다.');
  if (!isValidDate(date)) throw fail(`date 형식이 잘못되었습니다: "${date}" (YYYY-MM-DD)`);

  const draft = (fields.draft || 'false').toLowerCase();
  if (draft !== 'true' && draft !== 'false') {
    throw fail(`draft는 true 또는 false여야 합니다: "${fields.draft}"`);
  }

  return {
    meta: {
      title,
      date,
      description: unquote(fields.description || ''),
      tags: parseTags(fields.tags || ''),
      draft: draft === 'true',
    },
    body: lines.slice(end + 1).join('\n'),
  };
}

function unquote(value) {
  const match = value.match(/^(["'])(.*)\1$/);
  return match ? match[2] : value;
}

function parseTags(value) {
  const inner = value.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((tag) => unquote(tag.trim()))
    .filter(Boolean);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 2026-02-30처럼 달력에 없는 날짜는 Date가 다른 날로 넘기므로 되돌려 비교한다.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

module.exports = { parseFrontmatter };
