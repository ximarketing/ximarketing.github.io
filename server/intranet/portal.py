#!/usr/bin/env python3
"""Minimal password-only form portal for Xi Li's private site."""

from __future__ import annotations

import crypt
import hashlib
import hmac
import html
import os
import re
import secrets
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit


LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8080
PUBLIC_ORIGIN = os.environ.get(
    "INTRANET_PUBLIC_ORIGIN", "https://intranet.ximarketing.ai"
)
PASSWORD_HASH_FILE = Path(
    os.environ.get(
        "INTRANET_PASSWORD_HASH_FILE",
        "/run/intranet-secrets/password.hash",
    )
)
SESSION_TTL_SECONDS = 12 * 60 * 60
CSRF_TTL_SECONDS = 10 * 60
MAX_SESSIONS = 256
MAX_FORM_BYTES = 1024
MAX_COOKIE_BYTES = 4096
MAX_CONCURRENT_REQUESTS = 32
SESSION_COOKIE = "__Host-intranet_session"
CSRF_COOKIE = "__Host-intranet_csrf"
BCRYPT_RE = re.compile(r"^\$2[aby]\$12\$[./A-Za-z0-9]{53}$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
PROTECTED_ENTRY_RE = re.compile(
    r"^(?:/games/ab-test/host\.html|/games/haggle/host\.html|"
    r"/tools/classroom-picker/host)$"
)

PRIMARY_NAV_ITEMS = (
    ("about", "About", "https://ximarketing.ai/"),
    ("research", "Research", "https://ximarketing.ai/research/"),
    ("teaching", "Teaching", "https://ximarketing.ai/teaching/"),
    ("media", "Media", "https://ximarketing.ai/#media"),
    ("intranet", "Intranet", "/"),
    ("contact", "Contact", "https://ximarketing.ai/contact/"),
)

# Add future games here. The private page renders this list automatically.
GAMES = (
    {
        "id": "negotiation",
        "title": "Negotiation Games",
        "eyebrow": "AI Negotiation Arena",
        "description": "Host or join an interactive negotiation session.",
        "title_zh_hans": "谈判游戏",
        "eyebrow_zh_hans": "AI 谈判竞技场",
        "description_zh_hans": "创建或加入一场互动谈判。",
        "cta_zh_hans": "打开游戏 →",
        "title_zh_hant": "談判遊戲",
        "eyebrow_zh_hant": "AI 談判競技場",
        "description_zh_hant": "建立或加入一場互動談判。",
        "cta_zh_hant": "開啟遊戲 →",
        "url": "/games/negotiation/",
    },
    # XIMARKETING AB TEST FEATURE BEGIN
    {
        "id": "ab-test",
        "title": "A/B Test Showdown",
        "eyebrow": "Experimentation Game",
        "description": (
            "Guess which design performed better, then compare your intuition "
            "with the data."
        ),
        "title_zh_hans": "A/B 测试擂台",
        "eyebrow_zh_hans": "实验与决策",
        "description_zh_hans": "判断哪个设计表现更好，再用数据检验你的直觉。",
        "cta_zh_hans": "打开游戏 →",
        "title_zh_hant": "A/B 測試擂臺",
        "eyebrow_zh_hant": "實驗與決策",
        "description_zh_hant": "判斷哪個設計表現更好，再用數據檢驗你的直覺。",
        "cta_zh_hant": "開啟遊戲 →",
        "url": "/games/ab-test/",
    },
    # XIMARKETING AB TEST FEATURE END
    # XIMARKETING HAGGLE FEATURE BEGIN
    {
        "id": "haggle",
        "title": "Haggle Arena",
        "eyebrow": "AI Haggling Game",
        "description": "Negotiate with an AI seller and compete for the lowest price.",
        "title_zh_hans": "AI 砍价竞技场",
        "eyebrow_zh_hans": "人机谈判游戏",
        "description_zh_hans": "与 AI 卖家谈判，以最低成交价争夺胜利。",
        "cta_zh_hans": "打开游戏 →",
        "title_zh_hant": "AI 議價競技場",
        "eyebrow_zh_hant": "人機談判遊戲",
        "description_zh_hant": "與 AI 賣家議價，以最低成交價爭奪勝利。",
        "cta_zh_hant": "開啟遊戲 →",
        "url": "/games/haggle/host.html",
    },
    # XIMARKETING HAGGLE FEATURE END
)

TOOLS = (
    # XIMARKETING CLASSROOM PICKER FEATURE BEGIN
    {
        "id": "classroom-picker",
        "title": "Classroom Random Picker",
        "eyebrow": "Teaching Tool",
        "description": "Collect names and select participants at random in class.",
        "title_zh_hans": "课堂随机抽选",
        "eyebrow_zh_hans": "教学工具",
        "description_zh_hans": "收集学生姓名，并在课堂上随机抽选参与者。",
        "cta_zh_hans": "打开工具 →",
        "title_zh_hant": "課堂隨機抽選",
        "eyebrow_zh_hant": "教學工具",
        "description_zh_hant": "收集學生姓名，並在課堂上隨機抽選參與者。",
        "cta_zh_hant": "開啟工具 →",
        "url": "/tools/classroom-picker/host",
    },
    # XIMARKETING CLASSROOM PICKER FEATURE END
)


LOGIN_CSS = b"""
:root {
  --xi-primary: #3f6482;
  --xi-primary-strong: #31536d;
  --xi-primary-soft: #e7eef3;
  --xi-ink: #182630;
  --xi-muted: #60727f;
  --xi-bg: #f9fafb;
  --xi-surface: #ffffff;
  --xi-surface-raised: #ffffff;
  --xi-surface-soft: #edf3f7;
  --xi-border: #d9e2e8;
  --xi-input-border: #7d909d;
  --xi-shadow: 0 18px 50px rgba(31, 54, 72, 0.08);
  color-scheme: light;
  font-family: Palatino, "Palatino Linotype", "Book Antiqua", "Noto Serif CJK SC", "Noto Serif CJK TC", "Source Han Serif SC", "Source Han Serif TC", "Songti SC", "Songti TC", STSong, PMingLiU, Georgia, "Times New Roman", serif;
  background: var(--xi-bg);
  color: var(--xi-ink);
}
html[data-theme="dark"] {
  --xi-primary: #8fb4d0;
  --xi-primary-strong: #b2cee1;
  --xi-primary-soft: #203342;
  --xi-ink: #f3f7fa;
  --xi-muted: #b6c1c9;
  --xi-bg: #101820;
  --xi-surface: #17232d;
  --xi-surface-raised: #1c2b36;
  --xi-surface-soft: #22333f;
  --xi-border: #304451;
  --xi-input-border: #607b8c;
  --xi-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--xi-bg); }
html { scroll-padding-top: 88px; }
body {
  min-height: 100svh;
  color: var(--xi-ink);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
button, input { font-family: inherit; }
html[lang="zh-Hans"] body,
html[lang="zh-Hans"] button,
html[lang="zh-Hans"] input {
  font-family: Palatino, "Palatino Linotype", "Book Antiqua", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, serif;
}
html[lang="zh-Hant"] body,
html[lang="zh-Hant"] button,
html[lang="zh-Hant"] input {
  font-family: Palatino, "Palatino Linotype", "Book Antiqua", "Noto Serif CJK TC", "Source Han Serif TC", "Songti TC", PMingLiU, serif;
}
.skip-link {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 1000;
  padding: 9px 13px;
  color: #fff;
  background: var(--xi-primary-strong);
  border-radius: 8px;
  transform: translateY(-150%);
}
.skip-link:focus { transform: translateY(0); }
.masthead {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--xi-border);
  background: var(--xi-bg);
}
.masthead__inner-wrap {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 10px 28px;
}
.masthead__menu {
  display: flex;
  align-items: center;
  gap: 12px;
}
.site-nav {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
}
.site-nav__list {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  height: 52px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.site-nav a {
  position: relative;
  display: inline-block;
  margin: 0 11px;
  padding: 14px 0 12px;
  color: var(--xi-muted);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.site-nav a::after {
  position: absolute;
  right: 0;
  bottom: 5px;
  left: 0;
  height: 2px;
  background: transparent;
  content: "";
}
.site-nav a:hover { color: var(--xi-ink); }
.site-nav a[aria-current="page"] {
  color: var(--xi-ink);
}
.site-nav a[aria-current="page"]::after { background: var(--xi-primary); }
.nav-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-left: auto;
  padding: 0;
  color: #fff;
  background: var(--xi-primary-strong);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.nav-toggle[hidden] { display: none; }
.navicon,
.navicon::before,
.navicon::after {
  display: block;
  width: 18px;
  height: 2px;
  background: currentColor;
  content: "";
}
.navicon { position: relative; }
.navicon::before { position: absolute; top: -6px; }
.navicon::after { position: absolute; top: 6px; }
.hidden-links {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  width: min(210px, calc(100vw - 36px));
  margin: 0;
  padding: 8px;
  background: var(--xi-surface-raised);
  border: 1px solid var(--xi-border);
  border-radius: 14px;
  box-shadow: var(--xi-shadow);
  list-style: none;
}
.hidden-links.hidden { display: none; }
.hidden-links a {
  display: block;
  margin: 0;
  padding: 9px 12px;
  border-radius: 8px;
}
.hidden-links a::after { display: none; }
.hidden-links a:hover { background: var(--xi-surface-soft); }
.site-nav a:focus-visible,
.game-card:focus-visible,
button:focus-visible {
  outline: 3px solid var(--xi-primary);
  outline-offset: 4px;
}
.language-switcher {
  position: relative;
  flex: 0 0 auto;
}
.language-switcher__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 116px;
  height: 42px;
  padding: 0 12px;
  color: var(--xi-muted);
  background: var(--xi-surface);
  border: 1px solid var(--xi-border);
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}
.language-switcher__button:hover,
.language-switcher__button[aria-expanded="true"] {
  color: var(--xi-primary);
  border-color: var(--xi-primary);
}
.language-switcher__current {
  color: var(--xi-primary);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.04em;
}
.language-switcher__chevron { font-size: 13px; transition: transform 160ms ease; }
.language-switcher__button[aria-expanded="true"] .language-switcher__chevron { transform: rotate(180deg); }
.language-switcher__panel {
  position: absolute;
  top: calc(100% + 9px);
  right: 0;
  z-index: 40;
  width: min(178px, calc(100vw - 24px));
  padding: 7px;
  background: var(--xi-surface-raised);
  border: 1px solid var(--xi-border);
  border-radius: 14px;
  box-shadow: var(--xi-shadow);
}
.language-switcher__panel[hidden] { display: none; }
.language-switcher__panel ul { margin: 0; padding: 0; list-style: none; }
.language-switcher__panel a {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 11px;
  color: var(--xi-ink);
  border-radius: 9px;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}
.language-switcher__panel a:hover,
.language-switcher__panel a[aria-current="true"] {
  color: var(--xi-primary-strong);
  background: var(--xi-primary-soft);
}
.language-switcher__panel a[aria-current="true"]::after {
  margin-left: auto;
  font-size: 11px;
  content: "\\2713";
}
.theme-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  color: var(--xi-muted);
  background: var(--xi-surface);
  border: 1px solid var(--xi-border);
  border-radius: 50%;
  cursor: pointer;
}
.theme-toggle:hover { color: var(--xi-primary); border-color: var(--xi-primary); }
.theme-toggle__dark { display: none; }
html[data-theme="dark"] .theme-toggle__light { display: none; }
html[data-theme="dark"] .theme-toggle__dark { display: inline; }
.login-page {
  min-height: calc(100svh - 73px);
  display: grid;
  place-items: center;
  padding: 36px 24px;
}
.login-panel { width: min(100%, 30rem); }
.login-panel h1 {
  margin: 0 0 12px;
  font-size: clamp(2rem, 6vw, 2.8rem);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.025em;
}
.login-intro {
  margin: 0 0 28px;
  color: var(--xi-muted);
  font-size: 1rem;
  line-height: 1.55;
}
.login-panel label {
  display: block;
  margin-bottom: 9px;
  font-size: 0.94rem;
  font-weight: 700;
}
.login-panel input[type="password"] {
  display: block;
  width: 100%;
  min-height: 52px;
  padding: 12px 15px;
  border: 1px solid var(--xi-input-border);
  border-radius: 10px;
  color: var(--xi-ink);
  background: var(--xi-bg);
  font-size: 1rem;
  line-height: 1.25;
  outline: none;
}
.login-panel input[type="password"]:focus {
  border-color: var(--xi-primary);
  box-shadow: 0 0 0 3px rgba(63, 100, 130, 0.18);
}
.login-panel input[aria-invalid="true"] { border-color: #9d3d3d; }
.login-error {
  margin: 10px 0 0;
  color: #8b3030;
  font-size: 0.9rem;
  line-height: 1.45;
}
.login-panel button {
  width: 100%;
  min-height: 52px;
  margin-top: 22px;
  padding: 12px 18px;
  border: 1px solid var(--xi-primary-strong);
  border-radius: 10px;
  color: #fff;
  background: var(--xi-primary-strong);
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
}
.login-panel button:hover { background: var(--xi-primary); }
html[data-theme="dark"] .skip-link,
html[data-theme="dark"] .nav-toggle,
html[data-theme="dark"] .login-panel button,
html[data-theme="dark"] .logout-form button:hover {
  color: var(--xi-bg);
}
html[data-theme="dark"] .login-error { color: #ffb4ab; }
html[data-theme="dark"] .login-panel input[aria-invalid="true"] { border-color: #ffb4ab; }
.private-page { min-height: 100svh; }
.private-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}
.logout-form { margin: 0; }
.logout-form button {
  width: auto;
  min-height: 40px;
  margin: 0;
  padding: 8px 14px;
  color: var(--xi-primary-strong);
  background: transparent;
  border: 1px solid var(--xi-border);
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}
.logout-form button:hover { color: #fff; background: var(--xi-primary-strong); border-color: var(--xi-primary-strong); }
.private-main {
  width: min(calc(100% - 48px), 1120px);
  margin: 0 auto;
  padding: clamp(44px, 6vw, 68px) 0 64px;
}
.private-section + .private-section { margin-top: 52px; }
.private-section__title {
  margin: 0 0 22px;
  color: var(--xi-ink);
  font-size: clamp(1.4rem, 2vw, 1.65rem);
  line-height: 1.12;
  letter-spacing: -0.01em;
}
.private-heading-row .private-section__title { margin: 0; }
.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
  gap: 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.game-card {
  display: flex;
  min-height: 198px;
  height: 100%;
  padding: clamp(21px, 3vw, 27px);
  border: 1px solid var(--xi-border);
  border-radius: 18px;
  color: inherit;
  background: var(--xi-surface);
  text-decoration: none;
  transition: border-color 160ms ease, transform 160ms ease;
}
.game-card:hover {
  border-color: var(--xi-primary);
  transform: translateY(-2px);
}
.game-card article {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.game-card__eyebrow {
  margin: 0 0 18px;
  color: var(--xi-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.game-card h2,
.game-card h3 {
  margin: 0 0 16px;
  color: var(--xi-ink);
  font-size: 18px;
  line-height: 1.2;
}
.game-card__description {
  margin: 0;
  color: var(--xi-muted);
  font-size: 13px;
  line-height: 1.55;
}
.game-card__cta {
  margin-top: auto;
  padding-top: 24px;
  color: var(--xi-primary-strong);
  font-size: 13px;
  font-weight: 700;
}
@media (max-width: 767px) {
  html { scroll-padding-top: 76px; }
  .masthead__inner-wrap { padding: 7px 18px; }
  .site-nav a { margin-right: 7px; margin-left: 7px; }
  .language-switcher__button { min-width: 56px; height: 40px; padding: 0 9px; }
  .language-switcher__label {
    position: absolute;
    overflow: hidden;
    width: 1px;
    height: 1px;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .theme-toggle { width: 40px; height: 40px; }
  .login-page { min-height: calc(100svh - 67px); place-items: start center; padding-top: 12vh; }
  .login-intro { margin-bottom: 26px; }
  .private-main { padding-top: 40px; }
  .game-card { min-height: 186px; }
}
@media (max-width: 480px) {
  .private-main { width: min(calc(100% - 36px), 1120px); }
  .site-nav__list { height: 46px; }
  .private-heading-row { margin-bottom: 22px; }
  .game-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
""".strip()


INTRANET_BOOTSTRAP_JS = """
(function () {
  'use strict';
  var root = document.documentElement;
  var locale;
  var savedLocale;
  var savedTheme;
  try { locale = new URL(window.location.href).searchParams.get('lang'); } catch (error) {}
  try { savedLocale = window.localStorage.getItem('xi-language'); } catch (error) {}
  locale = String(locale || savedLocale || '').toLowerCase();
  if (locale === 'zh-hans' || locale === 'zh-cn' || locale === 'zh-sg') locale = 'zh-Hans';
  else if (locale === 'zh-hant' || locale === 'zh-hk' || locale === 'zh-tw' || locale === 'zh-mo') locale = 'zh-Hant';
  else locale = 'en-US';
  root.setAttribute('lang', locale);
  root.setAttribute('data-language', locale === 'en-US' ? 'en' : locale);
  try { savedTheme = window.localStorage.getItem('xi-theme'); } catch (error) {}
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : (prefersDark ? 'dark' : 'light'));
}());
""".strip().encode("utf-8")


INTRANET_JS = """
(function () {
  'use strict';

  var root = document.documentElement;
  var translations = {
    'zh-Hans': {
      navigation: { primary: '主导航', about: '主页', research: '研究', teaching: '教学', media: '媒体', intranet: '内网', contact: '联系', openMenu: '打开导航菜单', closeMenu: '关闭导航菜单' },
      language: { button: '语言', buttonAria: '选择语言。当前语言：简体中文', selectionAria: '语言选择', current: '简' },
      accessibility: { skip: '跳至主要内容', themeLight: '切换至浅色主题', themeDark: '切换至深色主题' },
      login: { title: '内网', intro: '请输入访问密码以继续。', password: '密码', submit: '继续' },
      errors: { verification: '无法验证此请求，请重试。', expired: '本次请求已过期，请重试。', incorrect: '密码不正确，请重试。', unavailable: '登录服务暂时不可用，请稍后再试。' },
      titles: { login: '内网 · 李曦' }
    },
    'zh-Hant': {
      navigation: { primary: '主導覽', about: '主頁', research: '研究', teaching: '教學', media: '傳媒', intranet: '內網', contact: '聯絡', openMenu: '開啟導覽選單', closeMenu: '關閉導覽選單' },
      language: { button: '語言', buttonAria: '選擇語言。目前語言：繁體中文', selectionAria: '語言選擇', current: '繁' },
      accessibility: { skip: '跳至主要內容', themeLight: '切換至淺色主題', themeDark: '切換至深色主題' },
      login: { title: '內網', intro: '請輸入存取密碼以繼續。', password: '密碼', submit: '繼續' },
      errors: { verification: '無法驗證此請求，請重試。', expired: '本次請求已過期，請重試。', incorrect: '密碼不正確，請重試。', unavailable: '登入服務暫時無法使用，請稍後再試。' },
      titles: { login: '內網 · 李曦' }
    }
  };
  var currentLabels = { en: 'EN', 'zh-Hans': '简', 'zh-Hant': '繁' };
  var picker = document.querySelector('[data-language-switcher]');
  var pickerButton = picker && picker.querySelector('.language-switcher__button');
  var pickerPanel = picker && picker.querySelector('.language-switcher__panel');
  var pickerCurrent = picker && picker.querySelector('[data-language-current]');
  var options = picker ? Array.prototype.slice.call(picker.querySelectorAll('[data-language-option]')) : [];
  var themeToggle = document.getElementById('theme-toggle');
  var siteNav = document.getElementById('site-nav');
  var navToggle = siteNav && siteNav.querySelector('.nav-toggle');
  var visibleLinks = siteNav && siteNav.querySelector('.visible-links');
  var hiddenLinks = siteNav && siteNav.querySelector('.hidden-links');
  var textDefaults = [];
  var ariaDefaults = [];
  var defaultTitle = document.title;
  var currentLocale = 'en';

  function normalizeLocale(value) {
    if (!value) return null;
    var locale = String(value).toLowerCase();
    if (locale === 'en' || locale === 'en-us' || locale === 'en-gb') return 'en';
    if (locale === 'zh-hans' || locale === 'zh-cn' || locale === 'zh-sg') return 'zh-Hans';
    if (locale === 'zh-hant' || locale === 'zh-hk' || locale === 'zh-tw' || locale === 'zh-mo') return 'zh-Hant';
    return null;
  }

  function readPath(source, path) {
    return path.split('.').reduce(function (value, part) {
      return value === undefined || value === null ? undefined : value[part];
    }, source);
  }

  function storedValue(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storeValue(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) {}
  }

  function queryLocale() {
    try { return normalizeLocale(new URL(window.location.href).searchParams.get('lang')); } catch (error) { return null; }
  }

  function captureDefaults() {
    textDefaults = Array.prototype.map.call(document.querySelectorAll('[data-i18n]'), function (element) {
      return {
        element: element,
        value: element.textContent,
        zhHans: element.getAttribute('data-zh-hans'),
        zhHant: element.getAttribute('data-zh-hant')
      };
    });
    ariaDefaults = Array.prototype.map.call(document.querySelectorAll('[data-i18n-aria-label]'), function (element) {
      return { element: element, value: element.getAttribute('aria-label') || '' };
    });
  }

  function updateForwardedLinks(locale) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-language-forward]'), function (link) {
      var base = link.getAttribute('data-base-href') || link.href;
      try {
        var url = new URL(base, window.location.href);
        if (locale === 'en') url.searchParams.delete('lang');
        else url.searchParams.set('lang', locale);
        link.href = url.toString();
      } catch (error) {}
    });
  }

  function updateThemeButton() {
    if (!themeToggle) return;
    var localeData = translations[currentLocale];
    var dark = root.getAttribute('data-theme') === 'dark';
    var fallback = dark ? 'Switch to light theme' : 'Switch to dark theme';
    var translated = localeData && localeData.accessibility ? (dark ? localeData.accessibility.themeLight : localeData.accessibility.themeDark) : fallback;
    themeToggle.setAttribute('aria-label', translated);
    themeToggle.setAttribute('aria-pressed', String(dark));
  }

  function updateNavButton() {
    if (!navToggle || !hiddenLinks) return;
    var expanded = !hiddenLinks.classList.contains('hidden');
    var data = translations[currentLocale];
    var label = expanded ? 'Close navigation menu' : 'Open navigation menu';
    if (data && data.navigation) label = expanded ? data.navigation.closeMenu : data.navigation.openMenu;
    navToggle.setAttribute('aria-expanded', String(expanded));
    navToggle.setAttribute('aria-label', label);
  }

  function measureNavigation() {
    if (!siteNav || !navToggle || !visibleLinks || !hiddenLinks) return;
    while (hiddenLinks.firstElementChild) visibleLinks.appendChild(hiddenLinks.firstElementChild);
    navToggle.hidden = true;
    hiddenLinks.classList.add('hidden');
    var available = siteNav.clientWidth;
    if (visibleLinks.scrollWidth <= available) {
      updateNavButton();
      return;
    }
    navToggle.hidden = false;
    available = Math.max(0, siteNav.clientWidth - navToggle.offsetWidth - 6);
    while (visibleLinks.scrollWidth > available && visibleLinks.children.length > 1) {
      hiddenLinks.insertBefore(visibleLinks.lastElementChild, hiddenLinks.firstElementChild);
    }
    updateNavButton();
  }

  function initNavigation() {
    if (!navToggle || !hiddenLinks) return;
    navToggle.addEventListener('click', function () {
      hiddenLinks.classList.toggle('hidden');
      updateNavButton();
    });
    hiddenLinks.addEventListener('click', function () {
      hiddenLinks.classList.add('hidden');
      updateNavButton();
    });
    document.addEventListener('click', function (event) {
      if (siteNav && !siteNav.contains(event.target)) {
        hiddenLinks.classList.add('hidden');
        updateNavButton();
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !hiddenLinks.classList.contains('hidden')) {
        hiddenLinks.classList.add('hidden');
        updateNavButton();
        navToggle.focus();
      }
    });
    window.addEventListener('resize', measureNavigation);
  }

  function applyLocale(locale, updateUrl) {
    currentLocale = normalizeLocale(locale) || 'en';
    var data = translations[currentLocale];
    textDefaults.forEach(function (entry) {
      var translated = data ? readPath(data, entry.element.getAttribute('data-i18n')) : undefined;
      if (currentLocale === 'zh-Hans' && entry.zhHans !== null) translated = entry.zhHans;
      if (currentLocale === 'zh-Hant' && entry.zhHant !== null) translated = entry.zhHant;
      entry.element.textContent = translated === undefined ? entry.value : translated;
    });
    ariaDefaults.forEach(function (entry) {
      var translated = data ? readPath(data, entry.element.getAttribute('data-i18n-aria-label')) : undefined;
      entry.element.setAttribute('aria-label', translated === undefined ? entry.value : translated);
    });
    root.setAttribute('lang', currentLocale === 'en' ? 'en-US' : currentLocale);
    root.setAttribute('data-language', currentLocale);
    document.body.setAttribute('data-language', currentLocale);
    if (pickerCurrent) pickerCurrent.textContent = data && data.language ? data.language.current : currentLabels[currentLocale];
    options.forEach(function (option) {
      if (option.getAttribute('data-language-option') === currentLocale) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
    });
    var page = document.body.getAttribute('data-page');
    var localizedBodyTitle = currentLocale === 'zh-Hans' ? document.body.getAttribute('data-title-zh-hans') : currentLocale === 'zh-Hant' ? document.body.getAttribute('data-title-zh-hant') : null;
    document.title = localizedBodyTitle || (data && data.titles && data.titles[page] ? data.titles[page] : defaultTitle);
    updateForwardedLinks(currentLocale);
    updateThemeButton();
    updateNavButton();
    window.setTimeout(measureNavigation, 0);
    storeValue('xi-language', currentLocale);
    if (updateUrl !== false && window.history && window.history.replaceState) {
      try {
        var url = new URL(window.location.href);
        if (currentLocale === 'en') url.searchParams.delete('lang');
        else url.searchParams.set('lang', currentLocale);
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (error) {}
    }
  }

  function closePicker(returnFocus) {
    if (!pickerButton || !pickerPanel) return;
    pickerPanel.hidden = true;
    pickerButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) pickerButton.focus();
  }

  function openPicker() {
    if (!pickerButton || !pickerPanel) return;
    pickerPanel.hidden = false;
    pickerButton.setAttribute('aria-expanded', 'true');
  }

  function initPicker() {
    if (!picker || !pickerButton || !pickerPanel) return;
    pickerButton.addEventListener('click', function () {
      if (pickerPanel.hidden) openPicker();
      else closePicker(false);
    });
    pickerButton.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      openPicker();
      var targets = pickerPanel.querySelectorAll('a');
      if (targets.length) targets[event.key === 'ArrowUp' ? targets.length - 1 : 0].focus();
    });
    pickerPanel.addEventListener('keydown', function (event) {
      var targets = Array.prototype.slice.call(pickerPanel.querySelectorAll('a'));
      var index = targets.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var direction = event.key === 'ArrowDown' ? 1 : -1;
        targets[(index + direction + targets.length) % targets.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        targets[event.key === 'Home' ? 0 : targets.length - 1].focus();
      }
    });
    options.forEach(function (option) {
      option.addEventListener('click', function (event) {
        event.preventDefault();
        applyLocale(option.getAttribute('data-language-option'));
        closePicker(true);
      });
    });
    document.addEventListener('click', function (event) {
      if (!picker.contains(event.target)) closePicker(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !pickerPanel.hidden) closePicker(true);
    });
  }

  function initTheme() {
    var saved = storedValue('xi-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light'));
    updateThemeButton();
    if (!themeToggle) return;
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      storeValue('xi-theme', next);
      updateThemeButton();
    });
  }

  function init() {
    captureDefaults();
    initPicker();
    initTheme();
    initNavigation();
    applyLocale(queryLocale() || normalizeLocale(storedValue('xi-language')) || 'en');
    window.setTimeout(measureNavigation, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
""".strip().encode("utf-8")


LOGIN_ERRORS = {
    "verification": "This request could not be verified. Please try again.",
    "expired": "This request expired. Please try again.",
    "incorrect": "The password is incorrect. Please try again.",
    "unavailable": "The login service is temporarily unavailable. Please try again later.",
}


def _site_header_html() -> str:
    items = []
    for key, label, url in PRIMARY_NAV_ITEMS:
        current = ' aria-current="page"' if key == "intranet" else ""
        forward = ""
        if url.startswith("https://ximarketing.ai"):
            escaped_url = html.escape(url, quote=True)
            forward = (
                ' data-language-forward data-base-href="'
                f'{escaped_url}"'
            )
        items.append(
            "<li><a "
            f'href="{html.escape(url, quote=True)}"{current}{forward} '
            f'data-i18n="navigation.{key}">'
            f"{html.escape(label)}</a></li>"
        )

    return f"""
  <header class="masthead">
    <div class="masthead__inner-wrap">
      <div class="masthead__menu">
      <nav class="site-nav" id="site-nav" aria-label="Primary navigation" data-i18n-aria-label="navigation.primary">
        <ul class="site-nav__list visible-links">{''.join(items)}</ul>
        <button class="nav-toggle" type="button" aria-label="Open navigation menu"
                aria-expanded="false" aria-controls="site-nav-hidden-links" hidden>
          <span class="navicon" aria-hidden="true"></span>
        </button>
        <ul class="hidden-links hidden" id="site-nav-hidden-links"></ul>
      </nav>
      <div class="language-switcher" data-language-switcher>
        <button class="language-switcher__button" type="button"
                aria-label="Choose language. Current language: English"
                data-i18n-aria-label="language.buttonAria"
                aria-expanded="false" aria-controls="language-switcher-panel">
          <span class="language-switcher__label" data-i18n="language.button">Language</span>
          <span class="language-switcher__current" data-language-current aria-hidden="true">EN</span>
          <span class="language-switcher__chevron" aria-hidden="true">⌄</span>
        </button>
        <nav class="language-switcher__panel" id="language-switcher-panel"
             aria-label="Language selection" data-i18n-aria-label="language.selectionAria" hidden>
          <ul>
            <li><a href="/?lang=en" lang="en" hreflang="en" data-language-option="en" aria-current="true">English</a></li>
            <li><a href="/?lang=zh-Hans" lang="zh-Hans" hreflang="zh-Hans" data-language-option="zh-Hans">简体中文</a></li>
            <li><a href="/?lang=zh-Hant" lang="zh-Hant" hreflang="zh-Hant" data-language-option="zh-Hant">繁體中文</a></li>
          </ul>
        </nav>
      </div>
      <button class="theme-toggle" id="theme-toggle" type="button"
              aria-label="Switch to dark theme" aria-pressed="false">
        <span class="theme-toggle__light" aria-hidden="true">☼</span>
        <span class="theme-toggle__dark" aria-hidden="true">◐</span>
      </button>
      </div>
    </div>
  </header>"""


def _resource_cards_html(
    resources: tuple[dict[str, str], ...],
    resource_kind: str,
) -> str:
    if resource_kind not in {"games", "tools"}:
        raise ValueError("unknown protected resource type")
    cards = []
    heading_tag = "h2" if resource_kind == "games" else "h3"
    for resource in resources:
        resource_id = resource.get("id", "")
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,31}", resource_id):
            raise ValueError("resource id must be a short lowercase slug")
        parsed = urlsplit(resource["url"])
        expected_path = f"/{resource_kind}/{resource_id}/"
        allowed_paths = {expected_path}
        if resource_kind == "games":
            allowed_paths.add(f"/{resource_kind}/{resource_id}/host.html")
        if resource_kind == "tools":
            allowed_paths.add(f"/{resource_kind}/{resource_id}/host")
        if (
            parsed.scheme
            or parsed.netloc
            or parsed.query
            or parsed.path not in allowed_paths
            or parsed.fragment
        ):
            raise ValueError("resource URL must match its protected resource slug")
        localized = {}
        for key in (
            "title_zh_hans",
            "eyebrow_zh_hans",
            "description_zh_hans",
            "cta_zh_hans",
            "title_zh_hant",
            "eyebrow_zh_hant",
            "description_zh_hant",
            "cta_zh_hant",
        ):
            value = resource.get(key)
            if value is not None:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("localized game copy must be non-empty text")
                localized[key] = html.escape(value, quote=True)

        def locale_attributes(field: str) -> str:
            attributes = []
            for suffix, attribute in (
                ("zh_hans", "data-zh-hans"),
                ("zh_hant", "data-zh-hant"),
            ):
                value = localized.get(f"{field}_{suffix}")
                if value is not None:
                    attributes.append(f' {attribute}="{value}"')
            return "".join(attributes)

        cards.append(
            '<li><a class="game-card" '
            f'href="{html.escape(resource["url"], quote=True)}">'
            '<article>'
            f'<p class="game-card__eyebrow" data-i18n="{resource_kind}.{resource_id}.eyebrow"'
            f'{locale_attributes("eyebrow")}>{html.escape(resource["eyebrow"])}</p>'
            f'<{heading_tag} data-i18n="{resource_kind}.{resource_id}.title"'
            f'{locale_attributes("title")}>{html.escape(resource["title"])}</{heading_tag}>'
            f'<p class="game-card__description" data-i18n="{resource_kind}.{resource_id}.description"'
            f'{locale_attributes("description")}>'
            f'{html.escape(resource["description"])}</p>'
            f'<span class="game-card__cta" data-i18n="{resource_kind}.{resource_id}.cta"'
            f'{locale_attributes("cta")}>'
            f'{"Open game →" if resource_kind == "games" else "Open tool →"}</span>'
            '</article></a></li>'
        )
    return f'<ul class="game-grid">{"".join(cards)}</ul>'


def _games_html(games: tuple[dict[str, str], ...] = GAMES) -> str:
    return _resource_cards_html(games, "games")


def _tools_html(tools: tuple[dict[str, str], ...] = TOOLS) -> str:
    return _resource_cards_html(tools, "tools")


def _safe_protected_entry_path(value: str | None) -> str:
    """Return a protected content entry path, never an arbitrary redirect."""
    if not value or len(value) > 160 or not PROTECTED_ENTRY_RE.fullmatch(value):
        return ""
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        return ""
    return parsed.path


# Compatibility name retained for existing tests and deployment scripts.
_safe_game_entry_path = _safe_protected_entry_path


def _login_html(
    csrf_token: str,
    error_key: str | None = None,
    next_path: str = "",
) -> bytes:
    error_markup = ""
    invalid = "false"
    described_by = ""
    if error_key:
        error = LOGIN_ERRORS.get(error_key)
        if error is None:
            raise ValueError("unknown login error key")
        invalid = "true"
        described_by = ' aria-describedby="password-error"'
        error_markup = (
            '<p class="login-error" id="password-error" role="alert" '
            f'data-i18n="errors.{html.escape(error_key, quote=True)}">'
            f"{html.escape(error)}"
            "</p>"
        )

    safe_next = _safe_game_entry_path(next_path)
    next_input = (
        '<input type="hidden" name="next" '
        f'value="{html.escape(safe_next, quote=True)}">'
        if safe_next
        else ""
    )

    document = f"""<!doctype html>
<html lang="en-US" data-default-language="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Intranet · Xi Li</title>
  <script src="/intranet-bootstrap.js"></script>
  <link rel="stylesheet" href="/login.css">
  <script src="/intranet.js" defer></script>
</head>
<body data-page="login" data-intranet-language-root>
  <a class="skip-link" href="#main-content" data-i18n="accessibility.skip">Skip to main content</a>
  {_site_header_html()}
  <main class="login-page" id="main-content">
    <section class="login-panel" aria-labelledby="login-title">
      <h1 id="login-title" data-i18n="login.title">Intranet</h1>
      <p class="login-intro" data-i18n="login.intro">Enter the access password to continue.</p>
      <form action="/login" method="post">
        <input type="hidden" name="csrf_token" value="{html.escape(csrf_token)}">
        {next_input}
        <label for="password" data-i18n="login.password">Password</label>
        <input id="password" name="password" type="password" required
               maxlength="72" autocomplete="current-password"
               autocapitalize="none" spellcheck="false" enterkeyhint="go"
               aria-invalid="{invalid}"{described_by}>
        {error_markup}
        <button type="submit" data-i18n="login.submit">Continue</button>
      </form>
    </section>
  </main>
</body>
</html>"""
    return document.encode("utf-8")


def _private_html(csrf_token: str) -> bytes:
    tools_section = (
        '<section class="private-section" aria-labelledby="tools-title">'
        '<h2 class="private-section__title" id="tools-title" data-i18n="private.tools" '
        'data-zh-hans="工具" data-zh-hant="工具">Tools</h2>'
        f'{_tools_html()}</section>'
        if TOOLS
        else ""
    )
    document = f"""<!doctype html>
<html lang="en-US" data-default-language="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Intranet · Xi Li</title>
  <script src="/intranet-bootstrap.js"></script>
  <link rel="stylesheet" href="/login.css">
  <script src="/intranet.js" defer></script>
</head>
<body class="private-page" data-page="private" data-intranet-language-root
      data-title-zh-hans="内网 · 李曦" data-title-zh-hant="內網 · 李曦">
  <a class="skip-link" href="#main-content" data-i18n="accessibility.skip">Skip to main content</a>
  {_site_header_html()}
  <main class="private-main" id="main-content">
    <div class="private-heading-row">
        <h1 class="private-section__title" id="games-title" data-i18n="private.games"
            data-zh-hans="游戏" data-zh-hant="遊戲">Games</h1>
        <form class="logout-form" action="/logout" method="post">
          <input type="hidden" name="csrf_token" value="{html.escape(csrf_token)}">
          <button type="submit" data-i18n="private.logout"
                  data-zh-hans="退出登录" data-zh-hant="登出">Log out</button>
        </form>
    </div>
    <section class="private-section" aria-labelledby="games-title">
      {_games_html()}
    </section>
    {tools_section}
  </main>
</body>
</html>"""
    return document.encode("utf-8")


class PasswordState:
    """Reads the bcrypt hash and exposes a stable revocation fingerprint."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._signature: tuple[int, int, int] | None = None
        self._hash = ""
        self._fingerprint = ""

    def current(self) -> tuple[str, str]:
        stat = self.path.stat()
        signature = (stat.st_ino, stat.st_mtime_ns, stat.st_size)
        with self._lock:
            if signature != self._signature:
                value = self.path.read_text(encoding="ascii").strip()
                if not BCRYPT_RE.fullmatch(value):
                    raise ValueError("invalid bcrypt hash file")
                self._hash = value
                self._fingerprint = hashlib.sha256(value.encode("ascii")).hexdigest()
                self._signature = signature
            return self._hash, self._fingerprint


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, tuple[float, str]] = {}

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("ascii", "strict")).hexdigest()

    def create(self, password_fingerprint: str) -> str:
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            if len(self._sessions) >= MAX_SESSIONS:
                oldest = min(self._sessions, key=lambda key: self._sessions[key][0])
                del self._sessions[oldest]
            self._sessions[self._digest(token)] = (
                now + SESSION_TTL_SECONDS,
                password_fingerprint,
            )
        return token

    def valid(self, token: str, password_fingerprint: str) -> bool:
        if not token or len(token) > 128:
            return False
        try:
            digest = self._digest(token)
        except (UnicodeError, ValueError):
            return False
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            record = self._sessions.get(digest)
            if record is None:
                return False
            expiry, recorded_fingerprint = record
            if expiry <= now or not hmac.compare_digest(
                recorded_fingerprint, password_fingerprint
            ):
                self._sessions.pop(digest, None)
                return False
            return True

    def delete(self, token: str) -> None:
        if not token or len(token) > 128:
            return
        try:
            digest = self._digest(token)
        except (UnicodeError, ValueError):
            return
        with self._lock:
            self._sessions.pop(digest, None)

    def _prune_locked(self, now: float) -> None:
        expired = [key for key, (expiry, _) in self._sessions.items() if expiry <= now]
        for key in expired:
            del self._sessions[key]


PASSWORD_STATE = PasswordState(PASSWORD_HASH_FILE)
SESSIONS = SessionStore()
AUTH_SLOTS = threading.BoundedSemaphore(2)


def _cookie_value(raw_cookie: str | None, name: str) -> str:
    if not raw_cookie or len(raw_cookie) > MAX_COOKIE_BYTES:
        return ""
    cookie = SimpleCookie()
    try:
        cookie.load(raw_cookie)
    except Exception:
        return ""
    morsel = cookie.get(name)
    return morsel.value if morsel else ""


def _url_origin(value: str | None) -> str:
    """Return a normalized HTTP(S) origin without retaining path data."""
    if not value or len(value) > 2048:
        return ""
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    default_port = 443 if parsed.scheme == "https" else 80
    port_suffix = "" if port in {None, default_port} else f":{port}"
    return f"{parsed.scheme}://{parsed.hostname.lower()}{port_suffix}"


def _is_same_origin_submission(headers: object) -> bool:
    """Accept browser form submissions while rejecting cross-site requests."""
    origin = headers.get("Origin")
    if origin:
        if origin != PUBLIC_ORIGIN:
            return False
    elif _url_origin(headers.get("Referer")) != PUBLIC_ORIGIN:
        return False

    # Some embedded browsers mark a user-initiated form navigation as `none`.
    # Exact Origin/Referer validation plus the double-submit CSRF token remains
    # authoritative; explicit cross-site Fetch Metadata is still rejected.
    fetch_site = headers.get("Sec-Fetch-Site")
    return not fetch_site or fetch_site in {"same-origin", "none"}


def _log_rejected_submission_metadata(headers: object) -> None:
    """Log only coarse request-source categories, never values or client data."""
    origin = headers.get("Origin")
    if origin == PUBLIC_ORIGIN:
        origin_state = "same"
    elif not origin:
        origin_state = "missing"
    elif origin == "null":
        origin_state = "null"
    else:
        origin_state = "other"

    referer_origin = _url_origin(headers.get("Referer"))
    if referer_origin == PUBLIC_ORIGIN:
        referer_state = "same"
    elif not referer_origin:
        referer_state = "missing"
    else:
        referer_state = "other"

    fetch_site = headers.get("Sec-Fetch-Site")
    fetch_state = (
        fetch_site
        if fetch_site in {"same-origin", "same-site", "cross-site", "none"}
        else "missing-or-other"
    )
    print(
        "submission_metadata_rejected "
        f"origin={origin_state} referer={referer_state} fetch={fetch_state}",
        file=sys.stderr,
        flush=True,
    )


class PortalHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        self._handle_get(head_only=False)

    def do_HEAD(self) -> None:
        self._handle_get(head_only=True)

    def do_POST(self) -> None:
        if self.path == "/login":
            self._handle_login()
        elif self.path == "/logout":
            self._handle_logout()
        else:
            self._plain(HTTPStatus.NOT_FOUND, b"Not found\n")

    def do_PUT(self) -> None:
        self._method_not_allowed()

    do_DELETE = do_PUT
    do_PATCH = do_PUT
    do_OPTIONS = do_PUT
    do_TRACE = do_PUT

    def _handle_get(self, head_only: bool) -> None:
        request_url = urlsplit(self.path)
        request_path = request_url.path
        next_path = ""
        if request_path == "/login" and request_url.query:
            try:
                next_values = parse_qs(
                    request_url.query,
                    keep_blank_values=False,
                    strict_parsing=True,
                    max_num_fields=2,
                ).get("next", [])
            except ValueError:
                next_values = []
            if len(next_values) == 1:
                next_path = _safe_game_entry_path(next_values[0])
        if request_path == "/healthz":
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self._plain(HTTPStatus.NOT_FOUND, b"Not found\n", head_only)
                return
            try:
                PASSWORD_STATE.current()
            except (OSError, ValueError, UnicodeError):
                self._plain(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    b"Unavailable\n",
                    head_only,
                )
                return
            self._send(HTTPStatus.NO_CONTENT, b"", "text/plain", head_only)
            return

        if request_path == "/__auth/check":
            if self.headers.get("X-Intranet-Auth-Check") != "gateway":
                self._plain(HTTPStatus.NOT_FOUND, b"Not found\n", head_only)
                return
            if self._valid_session_token():
                self._send(
                    HTTPStatus.NO_CONTENT,
                    b"",
                    "text/plain",
                    head_only,
                )
                return
            forwarded_method = self.headers.get("X-Forwarded-Method", "")
            forwarded_path = urlsplit(
                self.headers.get("X-Forwarded-Uri", "")
            ).path
            safe_entry = _safe_game_entry_path(forwarded_path)
            if forwarded_method in {"GET", "HEAD"} and safe_entry:
                self._redirect(f"/login?next={quote(safe_entry, safe='/')}")
                return
            self._send(
                HTTPStatus.UNAUTHORIZED,
                b"",
                "text/plain",
                head_only,
            )
            return

        if request_path == "/login.css":
            self._send(HTTPStatus.OK, LOGIN_CSS, "text/css; charset=utf-8", head_only)
            return

        if request_path == "/intranet-bootstrap.js":
            self._send(
                HTTPStatus.OK,
                INTRANET_BOOTSTRAP_JS,
                "application/javascript; charset=utf-8",
                head_only,
            )
            return

        if request_path == "/intranet.js":
            self._send(
                HTTPStatus.OK,
                INTRANET_JS,
                "application/javascript; charset=utf-8",
                head_only,
            )
            return

        if request_path not in {"/", "/login"}:
            self._plain(HTTPStatus.NOT_FOUND, b"Not found\n", head_only)
            return

        if self._valid_session_token():
            if request_path == "/login":
                self._redirect(next_path or "/")
            else:
                self._render_private(head_only)
            return

        self._render_login(head_only=head_only, next_path=next_path)

    def _handle_login(self) -> None:
        if not _is_same_origin_submission(self.headers):
            _log_rejected_submission_metadata(self.headers)
            self._render_login(
                "verification",
                HTTPStatus.BAD_REQUEST,
            )
            return
        if self.headers.get("Transfer-Encoding"):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/x-www-form-urlencoded":
            self._plain(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, b"Unsupported request\n")
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._plain(HTTPStatus.LENGTH_REQUIRED, b"Length required\n")
            return
        if content_length < 1 or content_length > MAX_FORM_BYTES:
            self._plain(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b"Request too large\n")
            return

        body = self.rfile.read(content_length)
        try:
            fields = parse_qs(
                body.decode("utf-8", "strict"),
                keep_blank_values=True,
                strict_parsing=True,
                max_num_fields=4,
            )
        except (UnicodeError, ValueError):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        expected_fields = {"password", "csrf_token"}
        if "next" in fields:
            expected_fields.add("next")
        if set(fields) != expected_fields or any(
            len(values) != 1 for values in fields.values()
        ):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return

        next_path = _safe_game_entry_path(fields.get("next", [""])[0])
        if "next" in fields and not next_path:
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return

        csrf_form = fields["csrf_token"][0]
        csrf_cookie = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        if (
            not TOKEN_RE.fullmatch(csrf_form)
            or not TOKEN_RE.fullmatch(csrf_cookie)
            or not hmac.compare_digest(csrf_form, csrf_cookie)
        ):
            self._render_login(
                "expired",
                HTTPStatus.BAD_REQUEST,
                next_path=next_path,
            )
            return

        password = fields["password"][0]
        password_bytes = password.encode("utf-8", "strict")
        # bcrypt considers at most 72 bytes. Reject longer input instead of
        # silently accepting a different password with the same 72-byte prefix.
        if not password_bytes or len(password_bytes) > 72 or b"\x00" in password_bytes:
            self._render_login(
                "incorrect",
                HTTPStatus.UNAUTHORIZED,
                next_path=next_path,
            )
            return

        try:
            bcrypt_hash, fingerprint = PASSWORD_STATE.current()
        except (OSError, ValueError, UnicodeError):
            self._render_login(
                "unavailable",
                HTTPStatus.SERVICE_UNAVAILABLE,
                next_path=next_path,
            )
            return

        verified = False
        if AUTH_SLOTS.acquire(timeout=3):
            try:
                candidate = crypt.crypt(password, bcrypt_hash)
                verified = bool(candidate) and hmac.compare_digest(candidate, bcrypt_hash)
            except (OSError, ValueError):
                verified = False
            finally:
                AUTH_SLOTS.release()

        if not verified:
            self._render_login(
                "incorrect",
                HTTPStatus.UNAUTHORIZED,
                next_path=next_path,
            )
            return

        token = SESSIONS.create(fingerprint)
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", next_path or "/")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _handle_logout(self) -> None:
        if not _is_same_origin_submission(self.headers):
            _log_rejected_submission_metadata(self.headers)
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        if self.headers.get("Transfer-Encoding"):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/x-www-form-urlencoded":
            self._plain(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, b"Unsupported request\n")
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._plain(HTTPStatus.LENGTH_REQUIRED, b"Length required\n")
            return
        if content_length < 1 or content_length > MAX_FORM_BYTES:
            self._plain(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b"Request too large\n")
            return
        try:
            fields = parse_qs(
                self.rfile.read(content_length).decode("utf-8", "strict"),
                keep_blank_values=True,
                strict_parsing=True,
                max_num_fields=2,
            )
        except (UnicodeError, ValueError):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        if set(fields) != {"csrf_token"} or len(fields["csrf_token"]) != 1:
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        csrf_form = fields["csrf_token"][0]
        csrf_cookie = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        if (
            not TOKEN_RE.fullmatch(csrf_form)
            or not TOKEN_RE.fullmatch(csrf_cookie)
            or not hmac.compare_digest(csrf_form, csrf_cookie)
        ):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return

        token = _cookie_value(self.headers.get("Cookie"), SESSION_COOKIE)
        SESSIONS.delete(token)
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/login")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _valid_session_token(self) -> str:
        token = _cookie_value(self.headers.get("Cookie"), SESSION_COOKIE)
        if not token:
            return ""
        try:
            _, fingerprint = PASSWORD_STATE.current()
        except (OSError, ValueError, UnicodeError):
            return ""
        return token if SESSIONS.valid(token, fingerprint) else ""

    def _render_private(self, head_only: bool = False) -> None:
        csrf_token = self._csrf_token()
        body = _private_html(csrf_token)
        self.send_response_only(HTTPStatus.OK)
        self._common_headers("text/html; charset=utf-8", len(body))
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}={csrf_token}; Path=/; Max-Age={CSRF_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.end_headers()
        if not head_only:
            self.wfile.write(body)
        self.close_connection = True

    def _render_login(
        self,
        error_key: str | None = None,
        status: HTTPStatus = HTTPStatus.OK,
        head_only: bool = False,
        next_path: str = "",
    ) -> None:
        csrf_token = self._csrf_token()
        body = _login_html(csrf_token, error_key, next_path)
        self.send_response_only(status)
        self._common_headers("text/html; charset=utf-8", len(body))
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}={csrf_token}; Path=/; Max-Age={CSRF_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.end_headers()
        if not head_only:
            self.wfile.write(body)
        self.close_connection = True

    def _csrf_token(self) -> str:
        current = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        return current if TOKEN_RE.fullmatch(current) else secrets.token_urlsafe(32)

    def _send(
        self,
        status: HTTPStatus,
        body: bytes,
        content_type: str,
        head_only: bool = False,
    ) -> None:
        self.send_response_only(status)
        self._common_headers(content_type, len(body))
        self.end_headers()
        if not head_only and body:
            self.wfile.write(body)
        self.close_connection = True

    def _plain(
        self,
        status: HTTPStatus,
        body: bytes,
        head_only: bool = False,
    ) -> None:
        self._send(status, body, "text/plain; charset=utf-8", head_only)

    def _redirect(self, location: str) -> None:
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _method_not_allowed(self) -> None:
        self.send_response_only(HTTPStatus.METHOD_NOT_ALLOWED)
        self.send_header("Allow", "GET, HEAD, POST")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _common_headers(self, content_type: str, content_length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header("Connection", "close")


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 512

    def __init__(self, server_address: tuple[str, int], handler: type[PortalHandler]):
        self._request_slots = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)
        super().__init__(server_address, handler)

    def process_request(self, request: object, client_address: object) -> None:
        self._request_slots.acquire()
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request: object, client_address: object) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def main() -> None:
    PASSWORD_STATE.current()
    server = BoundedHTTPServer((LISTEN_HOST, LISTEN_PORT), PortalHandler)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
