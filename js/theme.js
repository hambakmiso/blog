(function () {
  'use strict';

  var STORAGE_KEY = 'theme';
  var root = document.documentElement;
  var button = document.querySelector('.theme-toggle');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  // 시크릿 모드 등에서 저장소 접근이 막혀도 현재 페이지의 전환은 동작해야 한다.
  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function store(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // 저장하지 못하면 이번 페이지에만 적용한다.
    }
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    if (button) {
      button.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    }
  }

  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  if (button) {
    button.hidden = false;
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      store(next);
    });
  }

  // 직접 고른 적이 없으면 시스템 설정 변경을 바로 따른다.
  systemDark.addEventListener('change', function (event) {
    var stored = readStored();
    if (stored !== 'light' && stored !== 'dark') {
      apply(event.matches ? 'dark' : 'light');
    }
  });
})();
