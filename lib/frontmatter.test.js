'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontmatter } = require('./frontmatter');

const parse = (source) => parseFrontmatter(source, 'a.md');

test('모든 필드를 읽는다', () => {
  const { meta, body } = parse(
    '---\ntitle: "제목: 부제"\ndate: 2026-11-05\ndescription: 요약\ntags: [일상, "개발"]\ndraft: true\n---\n\n본문\n',
  );
  assert.deepEqual(meta, {
    title: '제목: 부제',
    date: '2026-11-05',
    description: '요약',
    tags: ['일상', '개발'],
    draft: true,
  });
  assert.equal(body, '\n본문\n');
});

test('선택 필드의 기본값', () => {
  const { meta } = parse('---\ntitle: 제목\ndate: 2026-11-05\n---\n');
  assert.equal(meta.description, '');
  assert.deepEqual(meta.tags, []);
  assert.equal(meta.draft, false);
});

test('BOM과 CRLF를 처리한다', () => {
  const { meta, body } = parse('﻿---\r\ntitle: 제목\r\ndate: 2026-11-05\r\n---\r\n본문\r\n');
  assert.equal(meta.title, '제목');
  assert.equal(body, '본문\n');
});

test('본문의 구분선을 메타데이터 끝으로 오해하지 않는다', () => {
  const { body } = parse('---\ntitle: 제목\ndate: 2026-11-05\n---\n위\n\n---\n\n아래');
  assert.equal(body, '위\n\n---\n\n아래');
});

test('잘못된 메타데이터는 파일명과 함께 오류를 낸다', () => {
  const cases = [
    ['본문만 있음', /a\.md: .*시작 구분선/],
    ['---\ntitle: 제목\n', /a\.md: .*끝 구분선/],
    ['---\ndate: 2026-11-05\n---\n', /a\.md: title이 없습니다/],
    ['---\ntitle: 제목\n---\n', /a\.md: date가 없습니다/],
    ['---\ntitle: 제목\ndate: 2026/11/05\n---\n', /a\.md: date 형식/],
    ['---\ntitle: 제목\ndate: 2026-02-30\n---\n', /a\.md: date 형식/],
    ['---\ntitle: 제목\ndate: 2026-11-05\ndraft: 네\n---\n', /a\.md: draft는/],
    ['---\ntitle: 제목\ndate: 2026-11-05\n- 태그\n---\n', /a\.md: .*해석할 수 없습니다/],
  ];
  for (const [source, expected] of cases) {
    assert.throws(() => parse(source), expected);
  }
});
