'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('./markdown');

test('제목과 문단', () => {
  assert.equal(render('# 제목\n\n문단입니다.'), '<h1>제목</h1>\n<p>문단입니다.</p>');
  assert.equal(render('###### 작은 제목 ##'), '<h6>작은 제목</h6>');
  assert.equal(render('#해시태그'), '<p>#해시태그</p>');
});

test('minHeading은 본문 제목이 페이지 h1과 겹치지 않게 한다', () => {
  assert.equal(render('# 큰 제목\n\n### 소제목', { minHeading: 2 }), '<h2>큰 제목</h2>\n<h3>소제목</h3>');
});

test('굵게와 기울임', () => {
  assert.equal(render('**굵게** *기울임* ***둘 다***'), '<p><strong>굵게</strong> <em>기울임</em> <strong><em>둘 다</em></strong></p>');
  assert.equal(render('__굵게__ _기울임_'), '<p><strong>굵게</strong> <em>기울임</em></p>');
  assert.equal(render('*바깥 **안쪽** 끝*'), '<p><em>바깥 <strong>안쪽</strong> 끝</em></p>');
});

test('구두점으로 끝나는 강조 뒤에 한글 조사가 붙어도 강조된다', () => {
  assert.equal(render('**"인용"**은 좋다'), '<p><strong>&quot;인용&quot;</strong>은 좋다</p>');
});

test('강조로 해석하면 안 되는 경우', () => {
  assert.equal(render('snake_case_name'), '<p>snake_case_name</p>');
  assert.equal(render('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(render('**닫히지 않음'), '<p>**닫히지 않음</p>');
  assert.equal(render('\\*별표\\*'), '<p>*별표*</p>');
});

test('인라인 코드 안의 문법은 해석하지 않고 이스케이프한다', () => {
  assert.equal(render('`**a** <b> [c](d)`'), '<p><code>**a** &lt;b&gt; [c](d)</code></p>');
  assert.equal(render('`` a`b ``'), '<p><code>a`b</code></p>');
});

test('코드 블록 안의 문법은 해석하지 않고 이스케이프한다', () => {
  const html = render('```js\n# 제목 아님\n**굵게 아님** <script>\n\n- 목록 아님\n```');
  assert.equal(
    html,
    '<pre tabindex="0"><code class="language-js"># 제목 아님\n**굵게 아님** &lt;script&gt;\n\n- 목록 아님\n</code></pre>',
  );
});

test('코드 블록은 같은 길이 이상의 펜스로 닫히고 닫히지 않으면 끝까지 이어진다', () => {
  assert.equal(render('````\n```\n````'), '<pre tabindex="0"><code>```\n</code></pre>');
  assert.equal(render('```\n끝'), '<pre tabindex="0"><code>끝\n</code></pre>');
});

test('링크와 이미지', () => {
  assert.equal(render('[글](https://a.com/b_c_d "설명")'), '<p><a href="https://a.com/b_c_d" title="설명">글</a></p>');
  assert.equal(render('[**굵게**](/a)'), '<p><a href="/a"><strong>굵게</strong></a></p>');
  assert.equal(render('[위키](https://a.com/x_(y))'), '<p><a href="https://a.com/x_(y)">위키</a></p>');
  assert.equal(render('![고양이](../assets/c.png)'), '<p><img src="../assets/c.png" alt="고양이" loading="lazy"></p>');
  assert.equal(
    render('[![그림](a.png)](/b)'),
    '<p><a href="/b"><img src="a.png" alt="그림" loading="lazy"></a></p>',
  );
  assert.equal(render('[그냥 대괄호]와 (괄호)'), '<p>[그냥 대괄호]와 (괄호)</p>');
});

test('위험한 링크 스킴은 막고 라벨만 남긴다', () => {
  assert.equal(render('[x](javascript:alert(1))'), '<p>x</p>');
  assert.equal(render('[x](JaVaScRiPt:alert(1))'), '<p>x</p>');
  assert.equal(render('[x](<java\tscript:alert(1)>)'), '<p>x</p>');
  assert.equal(render('![x](data:text/html,a)'), '<p>x</p>');
  assert.equal(render('[x](mailto:a@b.com)'), '<p><a href="mailto:a@b.com">x</a></p>');
});

test('본문의 HTML과 속성값을 이스케이프한다', () => {
  assert.equal(render('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(render('[x](a"onclick="b)'), '<p><a href="a&quot;onclick=&quot;b">x</a></p>');
  assert.equal(render('![a"b](c.png)'), '<p><img src="c.png" alt="a&quot;b" loading="lazy"></p>');
});

test('목록', () => {
  assert.equal(render('- 하나\n- 둘'), '<ul>\n<li>하나</li>\n<li>둘</li>\n</ul>');
  assert.equal(render('1. 하나\n2. 둘'), '<ol>\n<li>하나</li>\n<li>둘</li>\n</ol>');
  assert.equal(render('3. 셋\n4. 넷'), '<ol start="3">\n<li>셋</li>\n<li>넷</li>\n</ol>');
});

test('중첩 목록', () => {
  const expected = '<ul>\n<li>가\n<ul>\n<li>나\n<ul>\n<li>다</li>\n</ul></li>\n</ul></li>\n<li>라</li>\n</ul>';
  assert.equal(render('- 가\n  - 나\n    - 다\n- 라'), expected);
  assert.equal(render('- 가\n\t- 나\n\t\t- 다\n- 라'), expected);
  assert.equal(render('1. 가\n  - 나'), '<ol>\n<li>가\n<ul>\n<li>나</li>\n</ul></li>\n</ol>');
});

test('항목 사이가 띄어진 목록은 문단으로 감싸고 다음 문단과 분리한다', () => {
  assert.equal(render('- 가\n\n- 나\n\n끝'), '<ul>\n<li><p>가</p></li>\n<li><p>나</p></li>\n</ul>\n<p>끝</p>');
  assert.equal(render('- 가\n- 나\n\n끝'), '<ul>\n<li>가</li>\n<li>나</li>\n</ul>\n<p>끝</p>');
});

test('목록 안의 코드 블록', () => {
  assert.equal(
    render('- 가\n  ```\n  - 코드\n  ```'),
    '<ul>\n<li>가\n<pre tabindex="0"><code>- 코드\n</code></pre></li>\n</ul>',
  );
});

test('숫자로 시작하는 문장이 문단 중간에서 목록이 되지 않는다', () => {
  assert.equal(render('올해는\n2026. 좋은 해'), '<p>올해는\n2026. 좋은 해</p>');
});

test('인용문', () => {
  assert.equal(render('> 인용\n> **이어짐**'), '<blockquote>\n<p>인용\n<strong>이어짐</strong></p>\n</blockquote>');
  assert.equal(
    render('> 바깥\n>\n> > 안쪽'),
    '<blockquote>\n<p>바깥</p>\n<blockquote>\n<p>안쪽</p>\n</blockquote>\n</blockquote>',
  );
});

test('표', () => {
  const html = render('| 이름 | 값 |\n| :--- | --: |\n| `a\\|b` | **c** |\n| d |');
  assert.equal(
    html,
    '<div class="table-wrap" tabindex="0">\n<table>\n<thead>\n' +
      '<tr><th style="text-align:left">이름</th><th style="text-align:right">값</th></tr>\n</thead>\n<tbody>\n' +
      '<tr><td style="text-align:left"><code>a|b</code></td><td style="text-align:right"><strong>c</strong></td></tr>\n' +
      '<tr><td style="text-align:left">d</td><td style="text-align:right"></td></tr>\n' +
      '</tbody>\n</table>\n</div>',
  );
});

test('표 형식이 아니면 문단으로 둔다', () => {
  assert.equal(render('a | b\n더 쓰기'), '<p>a | b\n더 쓰기</p>');
  assert.equal(render('a | b\n---'), '<p>a | b</p>\n<hr>');
});

test('구분선', () => {
  assert.equal(render('---'), '<hr>');
  assert.equal(render('* * *'), '<hr>');
  assert.equal(render('글\n___\n글'), '<p>글</p>\n<hr>\n<p>글</p>');
});

test('줄바꿈', () => {
  assert.equal(render('첫 줄  \n둘째 줄'), '<p>첫 줄<br>\n둘째 줄</p>');
  assert.equal(render('첫 줄\\\n둘째 줄'), '<p>첫 줄<br>\n둘째 줄</p>');
  assert.equal(render('첫 줄\n둘째 줄'), '<p>첫 줄\n둘째 줄</p>');
});

test('CRLF로 쓴 글도 결과가 같다', () => {
  const source = '# 제목\n\n- 가\n  - 나\n\n```\n코드\n```\n\n| a |\n| - |\n| b |\n';
  assert.equal(render(source.replace(/\n/g, '\r\n')), render(source));
});
