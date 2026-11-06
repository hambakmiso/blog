'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { render, escapeHtml } = require('./lib/markdown');
const { parseFrontmatter } = require('./lib/frontmatter');

const SITE = {
  title: 'My Blog',
  description: '생각과 배운 것을 기록하는 블로그',
};

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const DIST_DIR = path.join(ROOT, 'dist');
const STATIC_DIRS = ['css', 'js', 'assets'];

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

// {{키}}는 이스케이프하고 {{{키}}}는 그대로 넣는다.
// 한 번에 치환하므로 글 내용에 들어 있는 {{...}}는 다시 해석되지 않는다.
function fill(template, values) {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, escaped) => {
    const key = raw || escaped;
    if (!(key in values)) throw new Error(`템플릿 값이 없습니다: ${key}`);
    return raw ? values[key] : escapeHtml(values[key]);
  });
}

function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const errors = [];
  const posts = [];
  const files = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md')).sort();

  for (const file of files) {
    try {
      const filePath = path.join(POSTS_DIR, file);
      const source = fs.readFileSync(filePath, 'utf8');
      const { meta, body } = parseFrontmatter(source, `posts/${file}`);
      if (!meta.draft) {
        const createdAt = fs.statSync(filePath).birthtimeMs;
        posts.push({ ...meta, body, createdAt, slug: file.slice(0, -'.md'.length) });
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));

  // 날짜가 같으면 나중에 만든 파일이 위로 오고, 생성 시각까지 같으면 파일명순으로 둔다.
  return posts.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt - a.createdAt ||
      a.slug.localeCompare(b.slug),
  );
}

function renderPage(layout, values) {
  return fill(layout, {
    siteTitle: SITE.title,
    year: String(new Date().getFullYear()),
    ...values,
  });
}

function renderPostItem(post) {
  const summary = post.description
    ? `\n<p class="post-summary">${escapeHtml(post.description)}</p>`
    : '';
  return `<li class="post-item">
<h2 class="post-item-title"><a href="posts/${escapeHtml(encodeURIComponent(post.slug))}.html">${escapeHtml(post.title)}</a></h2>
<time class="post-date" datetime="${post.date}">${formatDate(post.date)}</time>${summary}
</li>`;
}

function renderIndex(layout, template, posts) {
  const list = posts.length
    ? `<ul class="post-list">\n${posts.map(renderPostItem).join('\n')}\n</ul>`
    : '<p class="empty">아직 글이 없습니다.</p>';

  return renderPage(layout, {
    root: '',
    pageTitle: SITE.title,
    description: SITE.description,
    content: fill(template, { posts: list }),
  });
}

function renderTags(tags) {
  if (!tags.length) return '';
  const items = tags.map((tag) => `<li>#${escapeHtml(tag)}</li>`).join('');
  return `<ul class="tags" aria-label="태그">${items}</ul>`;
}

function renderPost(layout, template, post) {
  const root = '../';
  const content = fill(template, {
    root,
    title: post.title,
    date: post.date,
    dateText: formatDate(post.date),
    tags: renderTags(post.tags),
    // 페이지의 h1은 글 제목 하나뿐이므로 본문 제목은 h2부터 시작한다.
    body: render(post.body, { minHeading: 2 }),
  });

  return renderPage(layout, {
    root,
    pageTitle: `${post.title} · ${SITE.title}`,
    description: post.description || SITE.description,
    content,
  });
}

function build() {
  // 글에 오류가 있으면 기존 dist/를 지우기 전에 멈춘다.
  const posts = readPosts();
  const layout = readTemplate('layout.html');
  const indexTemplate = readTemplate('index.html');
  const postTemplate = readTemplate('post.html');

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_DIR, 'posts'), { recursive: true });

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), renderIndex(layout, indexTemplate, posts));
  for (const post of posts) {
    fs.writeFileSync(path.join(DIST_DIR, 'posts', `${post.slug}.html`), renderPost(layout, postTemplate, post));
  }

  for (const dir of STATIC_DIRS) {
    const source = path.join(ROOT, dir);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(DIST_DIR, dir), { recursive: true });
  }

  return posts;
}

try {
  const posts = build();
  console.log(`빌드 완료: 글 ${posts.length}개 → dist/`);
} catch (error) {
  console.error(`빌드 실패:\n${error.message}`);
  process.exitCode = 1;
}
