const SUPABASE_URL = "https://pxmkzyhayxsvbbftncwy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_J0LQJ-qjr5ISX1jRKaQ7-A_GwABw8XP";
let supabaseClient = null;
const ADMIN_EMAILS = ["aftrdry@outlook.kr", "aftrdry@outlook.com", "sharpmson774@gmail.com"];
let currentUser = null;
let currentUserDaw = "Logic Pro";
let rawCommunityPosts = [];
let dealViewMode = 'card';
let currentOpenDealId = null;
let currentOpenPostId = null;
let editingPostId = null;
let originalNickname = "";
let isNicknameVerified = true;
let currentReportTarget = null;
let savedEditorRange = null;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '#';
  const trimmed = String(url).trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '#';
}

function extractYoutubeId(input) {
  if (!input) return "";
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}

function renderSafeContent(rawText) {
  let safe = escapeHtml(rawText);
  safe = safe.replace(/\*\*([\s\S]+?)\*\*/g, '<b style="font-weight:800;">$1</b>');
  safe = safe.replace(/\[밑줄\]([\s\S]+?)\[\/밑줄\]/g, '<u style="text-underline-offset:4px;">$1</u>');
  safe = safe.replace(/\[색상:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\]([\s\S]+?)\[\/색상\]/g, '<span class="comm-custom-color" style="color:$1;">$2</span>');
  safe = safe.replace(/\[색상\]([\s\S]+?)\[\/색상\]/g, '<span class="comm-custom-color" style="color:#c6ae82;">$1</span>');
  safe = safe.replace(/\[형광펜:(#[0-9a-fA-F]{3,8}|rgba?\([^\)]+\))\]([\s\S]+?)\[\/형광펜\]/g, '<mark class="comm-custom-hl" style="background:$1; color:inherit; padding:0.08rem 0.28rem; border-radius:4px;">$2</mark>');
  safe = safe.replace(/\[형광펜\]([\s\S]+?)\[\/형광펜\]/g, '<mark class="comm-custom-hl" style="background:rgba(198,174,130,0.25); color:inherit; padding:0.08rem 0.28rem; border-radius:4px;">$1</mark>');

  safe = safe.replace(/\*{4}([^\n]+)/g, '<b style="font-weight:800;">$1</b>');
  safe = safe.replace(/\[밑줄\]\[\/밑줄\]([^\n]+)/g, '<u style="text-underline-offset:4px;">$1</u>');
  safe = safe.replace(/\*{4}/g, '').replace(/\[밑줄\]\[\/밑줄\]/g, '');

  safe = safe.replace(/!\[이미지첨부\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$1" alt="첨부 이미지" referrerpolicy="no-referrer" style="max-width:100%; border-radius:8px; margin:0.8rem 0; display:block;">');
  safe = safe.replace(/\[(동영상링크|오디오링크|링크)\]\((https?:\/\/[^\s)]+)\)/g, function(match, label, url) {
    const ytId = extractYoutubeId(url);
    if (ytId) {
      return `<div class="youtube-video-container" style="margin:1rem 0;"><iframe src="https://www.youtube.com/embed/${ytId}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (/soundcloud\.com\//i.test(url)) {
      const scUrl = encodeURIComponent(url);
      return `<div class="inline-media-box"><iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${scUrl}&color=%23c2a878&auto_play=false&show_comments=true"></iframe></div>`;
    }
    if (/\.(mp3|wav|ogg|flac|m4a)(\?.*)?$/i.test(url)) {
      return `<div class="inline-media-box"><div style="font-size:0.76rem; color:var(--accent-gold); font-weight:600;">오디오 트랙 미리듣기</div><audio controls preload="metadata" src="${url}"></audio></div>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-gold); text-decoration:underline; font-weight:600;">[${label} 열기]</a>`;
  });
  return safe;
}

function rgbToHexOrRgba(colorStr) {
  if (!colorStr) return '';
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('rgba')) return trimmed;
  const m = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) {
    const r = Number(m[1]).toString(16).padStart(2, '0');
    const g = Number(m[2]).toString(16).padStart(2, '0');
    const b = Number(m[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return trimmed;
}

function serializeWysiwygEditor(rootEl) {
  if (!rootEl) return '';
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    let inner = '';
    node.childNodes.forEach(child => { inner += walk(child); });
    if (!inner) return '';

    if (tag === 'b' || tag === 'strong') return `**${inner}**`;
    if (tag === 'u') return `[밑줄]${inner}[/밑줄]`;
    if (tag === 'mark') {
      const bg = rgbToHexOrRgba(node.getAttribute('data-hl') || node.style?.backgroundColor || 'rgba(198,174,130,0.25)');
      return `[형광펜:${bg}]${inner}[/형광펜]`;
    }
    if (tag === 'span' || tag === 'font') {
      const dataCol = node.getAttribute('data-color') || rgbToHexOrRgba(node.style?.color || node.getAttribute('color') || '');
      const dataHl = node.getAttribute('data-hl') || rgbToHexOrRgba(node.style?.backgroundColor || '');
      let res = inner;
      if (dataCol && dataCol !== 'inherit') res = `[색상:${dataCol}]${res}[/색상]`;
      if (dataHl && dataHl !== 'transparent' && dataHl !== 'rgba(0, 0, 0, 0)') res = `[형광펜:${dataHl}]${res}[/형광펜]`;
      return res;
    }
    if (tag === 'div' || tag === 'p') {
      const prev = node.previousSibling;
      const prefix = (prev && prev.nodeName.toLowerCase() !== 'br') ? '\n' : '';
      return prefix + inner;
    }
    return inner;
  }
  return walk(rootEl).replace(/\u200B/g, '').replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function storedTextToWysiwygHtml(rawText) {
  if (!rawText) return '';
  let html = escapeHtml(rawText);
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\[밑줄\]([\s\S]+?)\[\/밑줄\]/g, '<u>$1</u>');
  html = html.replace(/\[색상:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\]([\s\S]+?)\[\/색상\]/g, '<span class="comm-custom-color" data-color="$1" style="color:$1;">$2</span>');
  html = html.replace(/\[색상\]([\s\S]+?)\[\/색상\]/g, '<span class="comm-custom-color" data-color="#c6ae82" style="color:#c6ae82;">$1</span>');
  html = html.replace(/\[형광펜:(#[0-9a-fA-F]{3,8}|rgba?\([^\)]+\))\]([\s\S]+?)\[\/형광펜\]/g, '<mark class="comm-custom-hl" data-hl="$1" style="background:$1; color:inherit; padding:0.08rem 0.28rem; border-radius:4px;">$2</mark>');
  html = html.replace(/\[형광펜\]([\s\S]+?)\[\/형광펜\]/g, '<mark class="comm-custom-hl" data-hl="rgba(198,174,130,0.25)" style="background:rgba(198,174,130,0.25); color:inherit; padding:0.08rem 0.28rem; border-radius:4px;">$1</mark>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

const activeLocks = new Set();
async function withSubmitLock(lockKey, btnEl, asyncFn) {
  if (activeLocks.has(lockKey)) return;
  activeLocks.add(lockKey);
  const origText = btnEl ? btnEl.innerText : '';
  if (btnEl) { btnEl.disabled = true; btnEl.innerText = '처리 중...'; }
  try { await asyncFn(); }
  finally {
    activeLocks.delete(lockKey);
    if (btnEl) { btnEl.disabled = false; btnEl.innerText = origText; }
  }
}

const DELETED_POSTS_STORAGE_KEY = 'plugazit_deleted_post_ids_v1';
const DELETED_DEALS_STORAGE_KEY = 'plugazit_deleted_deal_ids_v1';
const SAVED_DEALS_STORAGE_KEY = 'plugazit_saved_deal_ids_v1';
const SCRAPPED_POSTS_STORAGE_KEY = 'plugazit_scrapped_post_ids_v1';
const POST_META_STORAGE_KEY = 'plugazit_post_meta_v1';
const LOCAL_COMMENTS_STORAGE_KEY = 'plugazit_local_comments_v1';
const LOCAL_REPORTS_STORAGE_KEY = 'plugazit_local_reports_v1';
const LOCAL_INQUIRIES_STORAGE_KEY = 'plugazit_local_inquiries_v1';

function getDeletedIds(storageKey) {
  try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function markIdAsDeleted(storageKey, id) {
  try {
    const list = getDeletedIds(storageKey);
    const strId = String(id);
    if (!list.includes(strId)) { list.push(strId); localStorage.setItem(storageKey, JSON.stringify(list)); }
  } catch (e) {}
}
function getSavedDealIds() { return getDeletedIds(SAVED_DEALS_STORAGE_KEY); }
function toggleSaveDeal(dealId, event) {
  if (event) event.stopPropagation();
  try {
    const list = getSavedDealIds();
    const strId = String(dealId);
    const idx = list.indexOf(strId);
    if (idx >= 0) list.splice(idx, 1); else list.push(strId);
    localStorage.setItem(SAVED_DEALS_STORAGE_KEY, JSON.stringify(list));
    updateSavedDealCountBadge();
    renderDeals();
  } catch (e) {}
}
function updateSavedDealCountBadge() {
  const el = document.getElementById('savedDealCount');
  if (!el) return;
  const deletedDealIds = getDeletedIds(DELETED_DEALS_STORAGE_KEY);
  const validSaved = getSavedDealIds().filter(id => !deletedDealIds.includes(String(id)) && dealsData.some(d => String(d.id) === String(id)));
  el.innerText = validSaved.length;
}
function getScrappedPostIds() { return getDeletedIds(SCRAPPED_POSTS_STORAGE_KEY); }
function toggleScrapPost(postId, event) {
  if (event) event.stopPropagation();
  try {
    const list = getScrappedPostIds();
    const strId = String(postId);
    const idx = list.indexOf(strId);
    if (idx >= 0) list.splice(idx, 1); else list.push(strId);
    localStorage.setItem(SCRAPPED_POSTS_STORAGE_KEY, JSON.stringify(list));
    updateScrappedPostCountBadge();
    const btn = document.getElementById('btnPostScrap');
    if (btn) {
      const nowScrapped = list.includes(strId);
      btn.classList.toggle('voted', nowScrapped);
      btn.innerText = nowScrapped ? '스크랩됨' : '+ 스크랩';
    }
    if (currentCommCat === 'scrapped') renderCommunityPosts();
  } catch (e) {}
}
function updateScrappedPostCountBadge() {
  const el = document.getElementById('scrappedPostCount');
  if (!el) return;
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  const valid = getScrappedPostIds().filter(id => !deletedIds.includes(String(id)));
  el.innerText = valid.length;
}
function getLocalReportsList() {
  try { const raw = localStorage.getItem(LOCAL_REPORTS_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function saveLocalReportsList(list) {
  try { localStorage.setItem(LOCAL_REPORTS_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}
function getLocalInquiriesList() {
  try { const raw = localStorage.getItem(LOCAL_INQUIRIES_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function saveLocalInquiriesList(list) {
  try { localStorage.setItem(LOCAL_INQUIRIES_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}
function getPostMetaMap() {
  try { const raw = localStorage.getItem(POST_META_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}
function savePostMetaMap(map) {
  try { localStorage.setItem(POST_META_STORAGE_KEY, JSON.stringify(map)); } catch (e) {}
}
function getPostStats(post) {
  const map = getPostMetaMap();
  const meta = map[String(post.id)] || {};
  const views = (Number(post.views) || 0) + (Number(meta.extraViews) || 0);
  const likes = (Number(post.likes_count) || 0) + (Number(meta.extraLikes) || 0);
  const voted = Boolean(meta.voted);
  const daw = post.author_daw || meta.daw || '';
  const pluginTag = post.plugin_tag || meta.pluginTag || '';
  return { views, likes, voted, daw, pluginTag, editedTitle: meta.editedTitle, editedContent: meta.editedContent, editedCategory: meta.editedCategory };
}
function getLocalCommentsMap() {
  try { const raw = localStorage.getItem(LOCAL_COMMENTS_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}
function saveLocalCommentsMap(map) {
  try { localStorage.setItem(LOCAL_COMMENTS_STORAGE_KEY, JSON.stringify(map)); } catch (e) {}
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text'; btnEl.innerText = '숨기기'; }
  else { input.type = 'password'; btnEl.innerText = '보기'; }
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('plugazit_theme', next); } catch (e) {}
}
function resetToHome() {
  currentMainCat = 'all';
  currentSubCat = '전체';
  document.getElementById('dealSearchKeyword').value = '';
  document.getElementById('dealSortOption').value = 'recommended';
  const allBtn = document.getElementById('btnMainCatAll');
  if (allBtn) {
    document.querySelectorAll('#dealsView .main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
    allBtn.classList.add('active');
  }
  renderSubCategories();
  renderDeals();
  showPage('deals');
}
function isUserAdmin(user) {
  return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
}
function showPage(page) {
  if (page === 'admin' && !isUserAdmin(currentUser)) {
    alert('관리자 권한이 필요한 페이지입니다.');
    return;
  }
  document.getElementById('dealsView').style.display = page === 'deals' ? 'block' : 'none';
  document.getElementById('communityView').style.display = page === 'community' ? 'block' : 'none';
  document.getElementById('adminView').style.display = page === 'admin' ? 'block' : 'none';
  document.getElementById('myPageView').style.display = page === 'mypage' ? 'block' : 'none';
  document.getElementById('postWriteView').style.display = page === 'postWrite' ? 'block' : 'none';
  document.getElementById('postDetailView').style.display = page === 'postDetail' ? 'block' : 'none';
  document.getElementById('navDealsBtn').classList.toggle('active', page === 'deals');
  document.getElementById('navCommBtn').classList.toggle('active', page === 'community' || page === 'postWrite' || page === 'postDetail');
  const adminBtn = document.getElementById('navAdminBtn');
  if (adminBtn) adminBtn.classList.toggle('active', page === 'admin');
  if (page === 'community') fetchCommunityPosts();
  else if (page === 'mypage') initMyPageData();
  else if (page === 'admin') renderAdminDashboard();
}
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('active');
  if (id === 'dealDetailModal') {
    currentOpenDealId = null;
    const iframe = modal.querySelector('iframe');
    if (iframe) iframe.src = '';
  }
}
function checkModalBackdropClose(event, modalId) {
  if (event.target.id === modalId || event.target.classList.contains('modal-overlay')) {
    closeModal(modalId);
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => closeModal(modal.id));
  }
});
function openLegalModal(tabType) { switchLegalTab(tabType || 'terms'); openModal('termsModal'); }
function switchLegalTab(tabType) {
  const isTerms = tabType === 'terms';
  document.getElementById('tabBtnTerms')?.classList.toggle('active', isTerms);
  document.getElementById('tabBtnPrivacy')?.classList.toggle('active', !isTerms);
  const termsEl = document.getElementById('legalTermsContent');
  const privEl = document.getElementById('legalPrivacyContent');
  if (termsEl) termsEl.style.display = isTerms ? 'block' : 'none';
  if (privEl) privEl.style.display = isTerms ? 'none' : 'block';
}
function setDealViewMode(mode) {
  dealViewMode = mode;
  document.getElementById('btnCardView').classList.toggle('active', mode === 'card');
  document.getElementById('btnListView').classList.toggle('active', mode === 'list');
  const container = document.getElementById('dealsContainer');
  if (mode === 'list') container.classList.add('list-mode');
  else container.classList.remove('list-mode');
  renderDeals();
}

const USD_TO_KRW = 1380;
const subCategories = {
  all: ["전체 보기"],
  saved: ["전체 보기"],
  mixing: ["전체", "EQ", "Compressor/Limiter", "Reverb/Delay", "De-Esser/Dynamic", "Saturation/Tape", "Mastering Chain"],
  synth: ["전체", "Analog/Synth", "Sample Library", "Cinematic/Orchestral", "Drum/Percussion"],
  fx: ["전체", "Pitch/Vocal", "Utility/Analyzer", "Modulation"],
  free: ["전체", "Free Synths", "Free FX"]
};

const dealsData = [
  {
    id: 1, brand: "FabFilter", title: "Pro-Q 3 Equalizer", cat: "mixing", sub: "EQ",
    desc: "다이나믹 EQ, 리니어 페이즈 및 트랙 간 주파수 마스킹 확인 기능을 갖춘 업계 표준 이퀄라이저입니다.",
    original: 179, discountPrice: 134, discountRateNum: 25, discountRate: "25% OFF",
    storeUrl: "https://www.fabfilter.com/products/pro-q-3-equalizer-plug-in", daysLeft: 5,
    imgUrl: "https://i.ytimg.com/vi/d9W2j2_y4v8/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/d9W2j2_y4v8/hqdefault.jpg",
    youtubeId: "d9W2j2_y4v8", ytQuery: "FabFilter Pro-Q 3 Equalizer Official Introduction", bestSeasonLabel: "Summer (7월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "정가 유지" },
      { name: "Summer (7~8월)", avgOff: 25, note: "연례 정기 세일" },
      { name: "Black Friday (11월)", avgOff: 25, note: "최대 할인 시즌" },
      { name: "Year-End (12월)", avgOff: 0, note: "정가 유지" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular", price: 179 }, { date: "2023.07", season: "Summer", price: 134 },
      { date: "2023.11", season: "Black Friday", price: 134 }, { date: "2024.04", season: "Anniversary", price: 125 },
      { date: "2024.08", season: "Regular", price: 179 }, { date: "2024.11", season: "Black Friday", price: 134 },
      { date: "2025.03", season: "Regular", price: 179 }, { date: "2025.07", season: "Summer", price: 134 },
      { date: "2025.11", season: "Black Friday", price: 134 }, { date: "2026.02", season: "Regular", price: 179 },
      { date: "2026.11", season: "Current Deal", price: 134 }
    ]
  },
  {
    id: 2, brand: "oeksound", title: "soothe2 Resonance Suppressor", cat: "mixing", sub: "De-Esser/Dynamic",
    desc: "보컬과 악기 트랙의 거친 공명(Resonance) 및 치찰음을 실시간으로 자동 감지해 부드럽게 억제하는 프로세서입니다.",
    original: 219, discountPrice: 149, discountRateNum: 32, discountRate: "32% OFF",
    storeUrl: "https://oeksound.com/plugins/soothe2/", daysLeft: 2,
    imgUrl: "https://i.ytimg.com/vi/7_M2jbM_L1k/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/7_M2jbM_L1k/hqdefault.jpg",
    youtubeId: "7_M2jbM_L1k", ytQuery: "oeksound soothe2 resonance suppressor walkthrough", bestSeasonLabel: "Easter (4월) / Black Friday (11월)",
    seasonality: [
      { name: "Easter (3~4월)", avgOff: 27, note: "$159 프로모션" },
      { name: "Summer (6~8월)", avgOff: 0, note: "정가 유지" },
      { name: "Black Friday (11월)", avgOff: 32, note: "연중 최저가 ($139~$149)" },
      { name: "Year-End (12월)", avgOff: 0, note: "정가 유지" }
    ],
    priceHistory: [
      { date: "2023.04", season: "Easter Sale", price: 159 }, { date: "2023.08", season: "Regular", price: 219 },
      { date: "2023.11", season: "Black Friday", price: 139 }, { date: "2024.03", season: "Easter Sale", price: 159 },
      { date: "2024.07", season: "Regular", price: 219 }, { date: "2024.11", season: "Black Friday", price: 139 },
      { date: "2025.04", season: "Spring Sale", price: 159 }, { date: "2025.08", season: "Regular", price: 219 },
      { date: "2025.11", season: "Black Friday", price: 149 }, { date: "2026.04", season: "Easter Sale", price: 159 },
      { date: "2026.11", season: "Current Deal", price: 149 }
    ]
  },
  {
    id: 3, brand: "Soundtoys", title: "Soundtoys 5.4 Bundle", cat: "fx", sub: "Modulation",
    desc: "Decapitator, EchoBoy, Little AlterBoy 등 아날로그 질감의 핵심 이펙터 22종과 Effect Rack을 모두 포함한 통합 번들입니다.",
    original: 499, discountPrice: 249, discountRateNum: 50, discountRate: "50% OFF",
    storeUrl: "https://www.soundtoys.com/product/soundtoys-5/", daysLeft: 12,
    imgUrl: "https://i.ytimg.com/vi/M6T7obN3aB0/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/M6T7obN3aB0/hqdefault.jpg",
    youtubeId: "M6T7obN3aB0", ytQuery: "Soundtoys 5 Bundle Effect Rack Demo", bestSeasonLabel: "Black Friday (11월) / Holiday (12월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 40, note: "$299 세일" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$249 세일" },
      { name: "Black Friday (11월)", avgOff: 54, note: "최저가 구간 ($229~$249)" },
      { name: "Year-End (12월)", avgOff: 50, note: "$249 홀리데이 딜" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Spring", price: 299 }, { date: "2023.07", season: "Summer", price: 249 },
      { date: "2023.11", season: "Black Friday", price: 229 }, { date: "2024.04", season: "Spring", price: 299 },
      { date: "2024.08", season: "Regular", price: 499 }, { date: "2024.11", season: "Black Friday", price: 229 },
      { date: "2025.03", season: "Spring", price: 269 }, { date: "2025.07", season: "Summer", price: 249 },
      { date: "2025.11", season: "Black Friday", price: 229 }, { date: "2026.05", season: "Regular", price: 499 },
      { date: "2026.11", season: "Current Deal", price: 249 }
    ]
  },
  {
    id: 4, brand: "Universal Audio", title: "UAD Spark 1 Year Pass", cat: "mixing", sub: "Compressor/Limiter",
    desc: "별도 DSP 하드웨어 없이 LA-2A, 1176, Neve 1073 등 UA의 대표적인 아날로그 복각 플러그인을 네이티브로 사용하는 연간 패스입니다.",
    original: 199, discountPrice: 99, discountRateNum: 50, discountRate: "50% OFF",
    storeUrl: "https://spark.uaudio.com/", daysLeft: 1,
    imgUrl: "https://i.ytimg.com/vi/bN2N9M1B8iE/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/bN2N9M1B8iE/hqdefault.jpg",
    youtubeId: "bN2N9M1B8iE", ytQuery: "Universal Audio UAD Spark Native Plugins Demo", bestSeasonLabel: "Half-Year (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 30, note: "$139 프로모션" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$99 반값 세일" },
      { name: "Black Friday (11월)", avgOff: 50, note: "$99 연간권 최저가" },
      { name: "Year-End (12월)", avgOff: 50, note: "$99 연장 세일" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular", price: 199 }, { date: "2023.06", season: "Half-Yearly", price: 99 },
      { date: "2023.11", season: "Black Friday", price: 99 }, { date: "2024.03", season: "Spring", price: 139 },
      { date: "2024.07", season: "Summer", price: 99 }, { date: "2024.11", season: "Black Friday", price: 99 },
      { date: "2025.04", season: "Regular", price: 199 }, { date: "2025.06", season: "Summer", price: 99 },
      { date: "2025.11", season: "Black Friday", price: 99 }, { date: "2026.04", season: "Spring", price: 129 },
      { date: "2026.11", season: "Current Deal", price: 99 }
    ]
  },
  {
    id: 5, brand: "Arturia", title: "Analog Lab Play", cat: "free", sub: "Free Synths",
    desc: "Arturia V Collection과 Pigments에서 엄선된 100가지 빈티지 신스 및 건반 프리셋을 무료로 제공하는 가상악기입니다.",
    original: 99, discountPrice: 0, discountRateNum: 100, discountRate: "100% FREE",
    storeUrl: "https://www.arturia.com/products/software-instruments/analoglab-v/overview", daysLeft: 99,
    imgUrl: "https://i.ytimg.com/vi/k_fM1v2t-64/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/k_fM1v2t-64/hqdefault.jpg",
    youtubeId: "k_fM1v2t-64", ytQuery: "Arturia Analog Lab Play Overview Tutorial", bestSeasonLabel: "상시 무료 배포 (Perpetual Free)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 100, note: "상시 무료" },
      { name: "Summer (6~7월)", avgOff: 100, note: "상시 무료" },
      { name: "Black Friday (11월)", avgOff: 100, note: "상시 무료" },
      { name: "Year-End (12월)", avgOff: 100, note: "상시 무료" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Intro", price: 99 }, { date: "2023.07", season: "Summer", price: 49 },
      { date: "2023.11", season: "Free Launch", price: 0 }, { date: "2024.11", season: "Free", price: 0 },
      { date: "2025.11", season: "Free", price: 0 }, { date: "2026.11", season: "Current Deal", price: 0 }
    ]
  },
  {
    id: 6, brand: "Native Instruments", title: "Komplete 14 Standard", cat: "synth", sub: "Sample Library",
    desc: "Kontakt 7, Massive X 등 80여 종의 가상악기·이펙트와 Expansion 사운드 팩이 수록된 올라운드 프로덕션 번들입니다.",
    original: 599, discountPrice: 299, discountRateNum: 50, discountRate: "50% OFF",
    storeUrl: "https://www.native-instruments.com/en/catalog/komplete/", daysLeft: 4,
    imgUrl: "https://i.ytimg.com/vi/B7B5mK1eR7c/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/B7B5mK1eR7c/hqdefault.jpg",
    youtubeId: "B7B5mK1eR7c", ytQuery: "Native Instruments Komplete 14 Standard Overview", bestSeasonLabel: "Summer of Sound (6월) / Cyber Season (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "정가 유지" },
      { name: "Summer of Sound (6월)", avgOff: 50, note: "$299 반값 세일" },
      { name: "Cyber Season (11월)", avgOff: 50, note: "$299 반값 세일" },
      { name: "Year-End (12월)", avgOff: 50, note: "연말 연장 프로모션" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular", price: 599 }, { date: "2023.06", season: "Summer of Sound", price: 299 },
      { date: "2023.11", season: "Cyber Season", price: 299 }, { date: "2024.06", season: "Summer of Sound", price: 299 },
      { date: "2024.11", season: "Cyber Season", price: 299 }, { date: "2025.06", season: "Summer of Sound", price: 299 },
      { date: "2025.11", season: "Cyber Season", price: 299 }, { date: "2026.04", season: "Regular", price: 599 },
      { date: "2026.11", season: "Current Deal", price: 299 }
    ]
  },
  {
    id: 7, brand: "iZotope", title: "Ozone 11 Advanced", cat: "mixing", sub: "Mastering Chain",
    desc: "Clarity 모듈, Stem Focus 및 AI Master Assistant를 통해 음압 확보와 톤 밸런스를 완성하는 통합 마스터링 스위트입니다.",
    original: 399, discountPrice: 199, discountRateNum: 50, discountRate: "50% OFF",
    storeUrl: "https://www.izotope.com/en/products/ozone.html", daysLeft: 7,
    imgUrl: "https://i.ytimg.com/vi/wG7gV6tP4pA/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/wG7gV6tP4pA/hqdefault.jpg",
    youtubeId: "wG7gV6tP4pA", ytQuery: "iZotope Ozone 11 Mastering Overview", bestSeasonLabel: "Summer (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 30, note: "$279 세일" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$199 반값 세일" },
      { name: "Black Friday (11월)", avgOff: 55, note: "$179~$199 최저가" },
      { name: "Year-End (12월)", avgOff: 50, note: "$199 홀리데이 세일" }
    ],
    priceHistory: [
      { date: "2023.09", season: "Launch", price: 299 }, { date: "2023.11", season: "Black Friday", price: 199 },
      { date: "2024.06", season: "Summer", price: 199 }, { date: "2024.11", season: "Black Friday", price: 179 },
      { date: "2025.03", season: "Regular", price: 399 }, { date: "2025.11", season: "Black Friday", price: 199 },
      { date: "2026.05", season: "Regular", price: 399 }, { date: "2026.11", season: "Current Deal", price: 199 }
    ]
  },
  {
    id: 8, brand: "Xfer Records", title: "Serum VST Synth", cat: "synth", sub: "Analog/Synth",
    desc: "직관적인 파형 편집과 드래그 앤 드롭 모듈레이션 워크플로우를 갖춘 대표적인 웨이브테이블 신디사이저입니다.",
    original: 189, discountPrice: 149, discountRateNum: 21, discountRate: "21% OFF",
    storeUrl: "https://xferrecords.com/products/serum", daysLeft: 15,
    imgUrl: "https://i.ytimg.com/vi/5Sa3wa_doG0/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/5Sa3wa_doG0/hqdefault.jpg",
    youtubeId: "5Sa3wa_doG0", ytQuery: "Xfer Records Serum Synth Walkthrough", bestSeasonLabel: "제휴 바우처 / 번들 프로모션 시점",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "공식 노세일 정책" },
      { name: "Summer (6~7월)", avgOff: 0, note: "공식 노세일 정책" },
      { name: "Black Friday (11월)", avgOff: 15, note: "리셀러 쿠폰/제휴 할인" },
      { name: "Year-End (12월)", avgOff: 21, note: "특별 프로모션 딜" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular", price: 189 }, { date: "2024.06", season: "Regular", price: 189 },
      { date: "2024.11", season: "Voucher", price: 169 }, { date: "2025.04", season: "Regular", price: 189 },
      { date: "2025.11", season: "Partner Promo", price: 159 }, { date: "2026.05", season: "Regular", price: 189 },
      { date: "2026.11", season: "Current Deal", price: 149 }
    ]
  },
  {
    id: 9, brand: "Celemony", title: "Melodyne 5 assistant", cat: "fx", sub: "Pitch/Vocal",
    desc: "보컬의 음정, 박자, 비브라토 및 치찰음을 음질 저하 없이 자연스럽게 다듬는 업계 표준 피치 보정 툴입니다.",
    original: 249, discountPrice: 149, discountRateNum: 40, discountRate: "40% OFF",
    storeUrl: "https://www.celemony.com/en/melodyne/what-is-melodyne", daysLeft: 3,
    imgUrl: "https://i.ytimg.com/vi/P2tK3P3qB2c/maxresdefault.jpg", backupImgUrl: "https://i.ytimg.com/vi/P2tK3P3qB2c/hqdefault.jpg",
    youtubeId: "P2tK3P3qB2c", ytQuery: "Celemony Melodyne 5 Vocal Pitch Editing", bestSeasonLabel: "Summer (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 20, note: "$199 세일" },
      { name: "Summer (6~7월)", avgOff: 40, note: "$149 정기 할인" },
      { name: "Black Friday (11월)", avgOff: 60, note: "$99~$149 최저가 구간" },
      { name: "Year-End (12월)", avgOff: 40, note: "$149 연말 프로모션" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular", price: 249 }, { date: "2023.07", season: "Summer", price: 149 },
      { date: "2023.11", season: "Black Friday", price: 99 }, { date: "2024.08", season: "Regular", price: 249 },
      { date: "2024.11", season: "Black Friday", price: 99 }, { date: "2025.07", season: "Summer", price: 149 },
      { date: "2025.11", season: "Black Friday", price: 129 }, { date: "2026.04", season: "Regular", price: 249 },
      { date: "2026.11", season: "Current Deal", price: 149 }
    ]
  }
];

function buildDefaultSeasonalityAndHistory(orig, disc, rateNum) {
  return {
    bestSeasonLabel: "Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: Math.round(rateNum * 0.5), note: "시즌 프로모션" },
      { name: "Summer (6~7월)", avgOff: rateNum, note: "정기 세일" },
      { name: "Black Friday (11월)", avgOff: rateNum, note: "최대 할인 시즌" },
      { name: "Year-End (12월)", avgOff: rateNum, note: "연말 세일" }
    ],
    priceHistory: [
      { date: "2024.11", season: "Black Friday", price: disc },
      { date: "2025.05", season: "Regular", price: orig || disc },
      { date: "2025.11", season: "Black Friday", price: disc },
      { date: "2026.05", season: "Regular", price: orig || disc },
      { date: "2026.11", season: "Current Deal", price: disc }
    ]
  };
}

async function fetchDealsFromSupabase() {
  if (!supabaseClient) return;
  const deletedDealIds = getDeletedIds(DELETED_DEALS_STORAGE_KEY);
  try {
    const { data, error } = await supabaseClient.from('deals').select('*').order('created_at', { ascending: false });
    if (error || !data) return;
    data.forEach(row => {
      const dbDealId = `db_${row.id}`;
      if (deletedDealIds.includes(dbDealId) || dealsData.some(d => String(d.id) === dbDealId)) return;
      const orig = Number(row.original_price) || 0;
      const disc = Number(row.discount_price) || 0;
      const rateNum = orig > 0 ? Math.round(((orig - disc) / orig) * 100) : (disc === 0 ? 100 : 0);
      const rateStr = disc === 0 ? "100% FREE" : `${rateNum}% OFF`;
      const ytId = row.youtube_id || "d9W2j2_y4v8";
      const defaults = buildDefaultSeasonalityAndHistory(orig, disc, rateNum);
      const mappedDeal = {
        id: dbDealId, dbRowId: row.id, brand: row.brand || "Brand", title: row.title || "Plugin Deal",
        cat: row.cat || "mixing", sub: row.sub || "전체", desc: row.description || "",
        original: orig, discountPrice: disc, discountRateNum: rateNum, discountRate: rateStr,
        storeUrl: row.store_url || "https://plugazit.com", daysLeft: row.days_left || 7,
        imgUrl: row.img_url || `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
        backupImgUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        youtubeId: ytId, ytQuery: `${row.brand || ''} ${row.title || ''} official demo`,
        bestSeasonLabel: defaults.bestSeasonLabel,
        seasonality: row.seasonality || defaults.seasonality,
        priceHistory: row.price_history || defaults.priceHistory
      };
      dealsData.unshift(mappedDeal);
      resolveLiveYoutubeAndOfficialImage(mappedDeal);
    });
    updateSavedDealCountBadge();
    renderDeals();
  } catch (err) { console.error(err); }
}

const PIPED_SEARCH_ENDPOINTS = [
  "https://pipedapi.kavin.rocks/search?filter=videos&q=",
  "https://api.piped.private.coffee/search?filter=videos&q=",
  "https://pipedapi.tokhmi.xyz/search?filter=videos&q="
];

async function resolveLiveYoutubeAndOfficialImage(deal) {
  const query = encodeURIComponent(deal.ytQuery || `${deal.brand} ${deal.title}`);
  for (const endpoint of PIPED_SEARCH_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}${query}`);
      if (!res.ok) continue;
      const data = await res.json();
      const firstValid = (data?.items || []).find(item => item.url && item.url.includes('v='));
      if (firstValid) {
        const vidMatch = firstValid.url.match(/v=([a-zA-Z0-9_-]{11})/);
        if (vidMatch && vidMatch[1]) {
          deal.youtubeId = vidMatch[1];
          const hdThumb = `https://i.ytimg.com/vi/${deal.youtubeId}/maxresdefault.jpg`;
          deal.imgUrl = hdThumb;
          deal.backupImgUrl = `https://i.ytimg.com/vi/${deal.youtubeId}/hqdefault.jpg`;
          updateDealDomImages(deal.id, hdThumb);
          if (String(currentOpenDealId) === String(deal.id)) {
            const iframe = document.getElementById('dealModalYoutubeIframe');
            if (iframe) iframe.src = `https://www.youtube.com/embed/${deal.youtubeId}?rel=0&modestbranding=1`;
          }
          break;
        }
      }
    } catch (e) {}
  }
}

function updateDealDomImages(dealId, newSrc) {
  document.querySelectorAll(`img[data-deal-img-id="${dealId}"]`).forEach(img => {
    if (img.src !== newSrc) {
      img.dataset.fallbackStep = '0';
      img.style.display = 'block';
      img.src = newSrc;
      const fb = img.parentElement?.querySelector('.plugin-ui-fallback');
      if (fb) fb.style.display = 'none';
    }
  });
}

let currentMainCat = 'all';
let currentSubCat = '전체';

function setMainCategory(cat, el) {
  document.querySelectorAll('#dealsView .main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentMainCat = cat;
  currentSubCat = '전체';
  renderSubCategories();
  renderDeals();
}

function renderSubCategories() {
  const subBar = document.getElementById('subCatBar');
  const subs = subCategories[currentMainCat] || ["전체"];
  subBar.innerHTML = subs.map(s => `<button type="button" class="sub-chip ${s === currentSubCat ? 'active' : ''}" onclick="setSubCategory('${s}', this)">${escapeHtml(s)}</button>`).join('');
}

function setSubCategory(sub, el) {
  document.querySelectorAll('.sub-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentSubCat = sub;
  renderDeals();
}

function onDealFilterChange() { renderDeals(); }

function verifyImageNotDummy(imgEl, dealId) {
  if (imgEl.naturalWidth > 0 && imgEl.naturalWidth <= 120) handleImgError(imgEl, dealId);
}

function handleImgError(imgEl, dealId) {
  const deal = dealsData.find(d => String(d.id) === String(dealId));
  const step = parseInt(imgEl.dataset.fallbackStep || '0', 10);
  if (deal && step === 0 && deal.backupImgUrl && imgEl.src !== deal.backupImgUrl) {
    imgEl.dataset.fallbackStep = '1'; imgEl.src = deal.backupImgUrl; return;
  }
  if (deal && step <= 1 && deal.youtubeId) {
    imgEl.dataset.fallbackStep = '2'; imgEl.src = `https://i.ytimg.com/vi/${deal.youtubeId}/hqdefault.jpg`; return;
  }
  imgEl.style.display = 'none';
  const fallback = imgEl.parentElement?.querySelector('.plugin-ui-fallback');
  if (fallback) fallback.style.display = 'flex';
}

function renderDeals() {
  const container = document.getElementById('dealsContainer');
  const searchKeyword = document.getElementById('dealSearchKeyword').value.trim().toLowerCase();
  const sortOption = document.getElementById('dealSortOption').value;
  const deletedDealIds = getDeletedIds(DELETED_DEALS_STORAGE_KEY);
  const savedDealIds = getSavedDealIds();

  let filtered = dealsData.filter(d => !deletedDealIds.includes(String(d.id)));
  if (currentMainCat !== 'all') {
    if (currentMainCat === 'free') filtered = filtered.filter(d => d.discountPrice === 0);
    else if (currentMainCat === 'saved') filtered = filtered.filter(d => savedDealIds.includes(String(d.id)));
    else filtered = filtered.filter(d => d.cat === currentMainCat);
  }
  if (currentSubCat !== '전체' && currentSubCat !== '전체 보기') {
    filtered = filtered.filter(d => d.sub === currentSubCat);
  }
  if (searchKeyword !== '') {
    filtered = filtered.filter(d => d.brand.toLowerCase().includes(searchKeyword) || d.title.toLowerCase().includes(searchKeyword) || d.desc.toLowerCase().includes(searchKeyword));
  }
  if (sortOption === 'priceLow') filtered.sort((a, b) => a.discountPrice - b.discountPrice);
  else if (sortOption === 'priceHigh') filtered.sort((a, b) => b.discountPrice - a.discountPrice);
  else if (sortOption === 'discountHigh') filtered.sort((a, b) => b.discountRateNum - a.discountRateNum);
  else if (sortOption === 'endingSoon') filtered.sort((a, b) => a.daysLeft - b.daysLeft);

  if (filtered.length === 0) {
    const emptyMsg = currentMainCat === 'saved' ? '관심 딜로 저장한 플러그인이 없습니다.' : '검색 조건에 해당되는 VST 딜 정보가 없습니다.';
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">${emptyMsg}</div>`;
    return;
  }

  container.innerHTML = filtered.map(d => {
    const krw = d.discountPrice === 0 ? "0원 (무료)" : `약 ${(d.discountPrice * USD_TO_KRW).toLocaleString()}원`;
    const origKrw = d.original ? `$${escapeHtml(d.original)}` : '';
    const tagClass = d.discountPrice === 0 ? 'tag-free' : 'tag-discount';
    const safeDealId = typeof d.id === 'string' ? `'${d.id}'` : d.id;
    const safeStoreUrl = sanitizeUrl(d.storeUrl);
    const isSaved = savedDealIds.includes(String(d.id));
    return `
      <div class="deal-card" onclick="openDealDetailModal(${safeDealId})">
        <button type="button" class="bookmark-toggle-btn ${isSaved ? 'saved' : ''}" onclick="toggleSaveDeal(${safeDealId}, event)">
          ${isSaved ? '관심 저장됨' : '+ 관심 등록'}
        </button>
        <div class="plugin-img-wrapper">
          <div class="plugin-ui-fallback" style="display:none;">${escapeHtml(d.brand)}<span>${escapeHtml(d.title)}</span></div>
          <img data-deal-img-id="${escapeHtml(d.id)}" src="${escapeHtml(d.imgUrl)}" alt="${escapeHtml(d.title)}" referrerpolicy="no-referrer" loading="lazy" onload="verifyImageNotDummy(this, ${safeDealId})" onerror="handleImgError(this, ${safeDealId})">
        </div>
        <div class="deal-card-body">
          <div>
            <div class="card-header">
              <span class="brand-name">${escapeHtml(d.brand)}</span>
              <span class="tag-badge ${tagClass}">${escapeHtml(d.discountRate)}</span>
            </div>
            <div class="deal-title">${escapeHtml(d.title)}</div>
            <div class="sub-cat-tag"># ${escapeHtml(d.sub)}</div>
            <div class="description-text">${escapeHtml(d.desc)}</div>
          </div>
          <div>
            <div class="price-box">
              <div>
                <span class="original-price">${origKrw}</span>
                <span class="discount-price">$${escapeHtml(d.discountPrice)}</span>
              </div>
              <div class="krw-price">${krw}</div>
            </div>
            <button type="button" class="btn-buy" onclick="event.stopPropagation(); window.open('${escapeHtml(safeStoreUrl)}', '_blank', 'noopener,noreferrer')">공식 스토어 딜 바로가기</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function buildPriceChartSvg(deal, rangeMode = 'all') {
  const fullHistory = deal.priceHistory || [
    { date: "2024.11", season: "Black Friday", price: deal.discountPrice },
    { date: "2025.06", season: "Regular", price: deal.original || deal.discountPrice },
    { date: "2025.11", season: "Black Friday", price: deal.discountPrice },
    { date: "2026.11", season: "Current Deal", price: deal.discountPrice }
  ];
  const pointsData = rangeMode === '1y' ? fullHistory.slice(-5) : fullHistory;
  const svgW = 740, svgH = 200, padL = 46, padR = 22, padT = 20, padB = 34;
  const plotW = svgW - padL - padR, plotH = svgH - padT - padB;
  const prices = pointsData.map(p => p.price);
  const maxVal = Math.max(deal.original || 100, ...prices);
  const topBound = maxVal === 0 ? 100 : Math.ceil(maxVal * 1.1);
  const valSpan = Math.max(1, topBound);
  const getX = (idx) => pointsData.length <= 1 ? padL + plotW / 2 : padL + (idx / (pointsData.length - 1)) * plotW;
  const getY = (val) => padT + plotH - (val / valSpan) * plotH;

  let gridLinesHtml = '';
  for (let i = 0; i <= 3; i++) {
    const gVal = Math.round((valSpan * i) / 3);
    const gy = getY(gVal).toFixed(1);
    gridLinesHtml += `<line x1="${padL}" y1="${gy}" x2="${svgW - padR}" y2="${gy}" stroke="var(--border-color)" stroke-width="1" /><text x="${padL - 8}" y="${Number(gy) + 4}" fill="var(--text-secondary)" font-size="10.5" text-anchor="end">$${gVal}</text>`;
  }

  const coords = pointsData.map((pt, idx) => ({ x: Number(getX(idx).toFixed(1)), y: Number(getY(pt.price).toFixed(1)), ...pt }));
  const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');
  const areaPath = coords.length > 1 ? `M ${coords[0].x} ${padT + plotH} L ` + coords.map(c => `${c.x} ${c.y}`).join(' L ') + ` L ${coords[coords.length - 1].x} ${padT + plotH} Z` : '';
  const minPriceVal = Math.min(...prices);
  const safeDealId = typeof deal.id === 'string' ? `'${deal.id}'` : deal.id;

  const nodesHtml = coords.map((c, idx) => {
    const isCurrent = idx === coords.length - 1;
    const isLowest = c.price === minPriceVal;
    const dotColor = isCurrent ? 'var(--accent-gold)' : (isLowest ? '#8fa874' : 'var(--text-primary)');
    const offRate = deal.original > 0 ? Math.round(((deal.original - c.price) / deal.original) * 100) : 0;
    const showLabel = pointsData.length <= 6 || idx % 2 === 0 || isCurrent;
    return `<g>${showLabel ? `<text x="${c.x}" y="${svgH - 8}" fill="var(--text-secondary)" font-size="10" text-anchor="middle">${escapeHtml(c.date)}</text>` : ''}<circle class="ph-node-point" cx="${c.x}" cy="${c.y}" r="${isCurrent ? 5 : 4}" fill="${dotColor}" stroke="var(--card-bg)" stroke-width="2" onmouseenter="updatePriceChartTooltip(${safeDealId}, '${escapeHtml(c.date)}', '${escapeHtml(c.season)}', ${Number(c.price)}, ${offRate})" onclick="updatePriceChartTooltip(${safeDealId}, '${escapeHtml(c.date)}', '${escapeHtml(c.season)}', ${Number(c.price)}, ${offRate})" /></g>`;
  }).join('');

  return `<svg class="ph-svg-chart" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none"><defs><linearGradient id="phAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent-gold)" stop-opacity="0.2" /><stop offset="100%" stop-color="var(--accent-gold)" stop-opacity="0.0" /></linearGradient></defs>${gridLinesHtml}<path d="${areaPath}" fill="url(#phAreaGrad)" /><polyline fill="none" stroke="var(--accent-gold)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${polylinePoints}" />${nodesHtml}</svg>`;
}

function switchPriceChartRange(dealId, rangeMode, btnEl) {
  const deal = dealsData.find(d => String(d.id) === String(dealId));
  if (!deal) return;
  document.querySelectorAll('.ph-range-tabs .ph-range-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const container = document.getElementById('phSvgChartContainer');
  if (container) container.innerHTML = buildPriceChartSvg(deal, rangeMode);
}

function updatePriceChartTooltip(dealId, dateStr, seasonStr, priceVal, offRate) {
  const box = document.getElementById('phInteractiveTooltip');
  if (!box) return;
  const krwStr = priceVal === 0 ? "무료" : `약 ${(priceVal * USD_TO_KRW).toLocaleString()}원`;
  const rateBadge = offRate > 0 ? `-${offRate}%` : '정가';
  box.innerHTML = `<div><span class="ph-tooltip-date">${escapeHtml(dateStr)}</span><span class="ph-tooltip-season">${escapeHtml(seasonStr)}</span></div><div class="ph-tooltip-price">$${escapeHtml(priceVal)} <span style="color:var(--accent-gold); margin-left:0.35rem;">(${rateBadge} · ${krwStr})</span></div>`;
}

function openDealDetailModal(id) {
  const deal = dealsData.find(d => String(d.id) === String(id));
  if (!deal) return;
  currentOpenDealId = deal.id;
  const detailContent = document.getElementById('dealDetailContent');
  const krw = deal.discountPrice === 0 ? "0원 (무료)" : `약 ${(deal.discountPrice * USD_TO_KRW).toLocaleString()}원`;
  const searchEncoded = encodeURIComponent(deal.ytQuery || `${deal.brand} ${deal.title} official demo`);
  const validVideoId = (deal.youtubeId && deal.youtubeId.length === 11) ? deal.youtubeId : "d9W2j2_y4v8";
  const safeDealId = typeof deal.id === 'string' ? `'${deal.id}'` : deal.id;
  const safeStoreUrl = sanitizeUrl(deal.storeUrl);

  const historyArr = deal.priceHistory || [{ date: "2026.11", season: "Current Deal", price: deal.discountPrice }];
  const allTimeLow = Math.min(...historyArr.map(h => h.price));
  const allTimeLowEntry = historyArr.find(h => h.price === allTimeLow) || historyArr[historyArr.length - 1];
  const maxDiscountPct = deal.original > 0 ? Math.round(((deal.original - allTimeLow) / deal.original) * 100) : 100;
  const timingEvaluation = deal.discountPrice <= allTimeLow ? "역대 최저가 도달" : (deal.discountPrice <= allTimeLow * 1.1 ? `최저가 근접 (차이 $${deal.discountPrice - allTimeLow})` : "평균 할인가");
  const latestPoint = historyArr[historyArr.length - 1];
  const latestOffRate = deal.original > 0 ? Math.round(((deal.original - latestPoint.price) / deal.original) * 100) : 0;
  const latestKrw = latestPoint.price === 0 ? "무료" : `약 ${(latestPoint.price * USD_TO_KRW).toLocaleString()}원`;

  const seasonalityList = deal.seasonality || [];
  const seasonalityHtml = seasonalityList.map(s => `
    <div class="ph-season-item">
      <div class="ph-season-name">${escapeHtml(s.name)}</div>
      <div class="ph-season-rate">${s.avgOff > 0 ? `${escapeHtml(s.avgOff)}% OFF` : '정가 유지'}</div>
      <div class="ph-season-bar-track"><div class="ph-season-bar-fill" style="width:${Math.min(100, Number(s.avgOff) || 0)}%;"></div></div>
    </div>
  `).join('');

  const adminDeleteBtnHtml = isUserAdmin(currentUser)
    ? `<button type="button" class="nav-btn danger-outline-btn" style="padding:0.32rem 0.7rem; font-size:0.76rem;" onclick="deleteDealItem(${safeDealId})">딜 삭제</button>`
    : '';

  detailContent.innerHTML = `
    <div class="detail-top-header">
      <div>
        <div class="detail-brand-tag">${escapeHtml(deal.brand)} · ${escapeHtml(deal.sub)}</div>
        <h2 class="detail-main-title">${escapeHtml(deal.title)}</h2>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        ${adminDeleteBtnHtml}
        <span class="tag-badge tag-discount" style="font-size:0.84rem; padding:0.35rem 0.75rem;">${escapeHtml(deal.discountRate)}</span>
      </div>
    </div>

    <div class="detail-hero-grid">
      <div class="plugin-img-wrapper detail-hero-img">
        <div class="plugin-ui-fallback" style="display:none;">${escapeHtml(deal.brand)}<span>${escapeHtml(deal.title)}</span></div>
        <img data-deal-img-id="${escapeHtml(deal.id)}" src="${escapeHtml(deal.imgUrl)}" alt="${escapeHtml(deal.title)}" referrerpolicy="no-referrer" style="object-fit:contain;" onload="verifyImageNotDummy(this, ${safeDealId})" onerror="handleImgError(this, ${safeDealId})">
      </div>
      <div class="detail-summary-panel">
        <p class="detail-desc-body">${escapeHtml(deal.desc)}</p>
        <div>
          <div class="detail-price-strip">
            <div>
              <span class="original-price" style="font-size:0.9rem;">정가 $${escapeHtml(deal.original)}</span>
              <span class="discount-price" style="font-size:1.75rem; margin-left:0.35rem;">$${escapeHtml(deal.discountPrice)}</span>
            </div>
            <div class="krw-price" style="font-size:0.92rem;">${krw}</div>
          </div>
          <a href="${escapeHtml(safeStoreUrl)}" target="_blank" rel="noopener noreferrer" class="btn-buy" style="margin-top:0.9rem; padding:0.88rem; font-size:0.92rem;">공식 스토어 구매 페이지 이동</a>
        </div>
      </div>
    </div>

    <div class="price-history-section">
      <div class="ph-header-bar">
        <div class="ph-title-group">
          <h4>Price Intelligence (2023 — 2026)</h4>
          <p>시즌별 가격 변곡점 및 최저가 지표</p>
        </div>
        <div class="ph-range-tabs">
          <button type="button" class="ph-range-btn active" onclick="switchPriceChartRange(${safeDealId}, 'all', this)">전체 기간</button>
          <button type="button" class="ph-range-btn" onclick="switchPriceChartRange(${safeDealId}, '1y', this)">최근 1년</button>
        </div>
      </div>

      <div class="ph-metrics-grid">
        <div class="ph-metric-card">
          <div class="ph-metric-label">정가 (MSRP)</div>
          <div class="ph-metric-value">$${escapeHtml(deal.original)}</div>
          <div class="ph-metric-sub">약 ${(deal.original * USD_TO_KRW).toLocaleString()}원</div>
        </div>
        <div class="ph-metric-card">
          <div class="ph-metric-label">역대 최저가</div>
          <div class="ph-metric-value">$${escapeHtml(allTimeLow)}</div>
          <div class="ph-metric-sub">최대 ${maxDiscountPct}% (${escapeHtml(allTimeLowEntry.date)})</div>
        </div>
        <div class="ph-metric-card">
          <div class="ph-metric-label">현재 가격 판정</div>
          <div class="ph-metric-value">$${escapeHtml(deal.discountPrice)}</div>
          <div class="ph-metric-sub">${escapeHtml(timingEvaluation)}</div>
        </div>
        <div class="ph-metric-card">
          <div class="ph-metric-label">주요 세일 시즌</div>
          <div class="ph-metric-value" style="font-size:0.88rem; line-height:1.35;">${escapeHtml(deal.bestSeasonLabel || 'Black Friday')}</div>
          <div class="ph-metric-sub">정기 프로모션 기준</div>
        </div>
      </div>

      <div class="ph-chart-wrapper">
        <div id="phSvgChartContainer">${buildPriceChartSvg(deal, 'all')}</div>
        <div class="ph-tooltip-box" id="phInteractiveTooltip">
          <div><span class="ph-tooltip-date">${escapeHtml(latestPoint.date)}</span><span class="ph-tooltip-season">${escapeHtml(latestPoint.season)}</span></div>
          <div class="ph-tooltip-price">$${escapeHtml(latestPoint.price)} <span style="color:var(--accent-gold); margin-left:0.35rem;">(-${latestOffRate}% · ${latestKrw})</span></div>
        </div>
      </div>

      <div class="ph-seasonality-grid">${seasonalityHtml}</div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.45rem;">
      <h4 style="font-weight:600; font-size:0.95rem; color:var(--text-primary);">공식 데모 & 사운드 리뷰</h4>
      <a href="https://www.youtube.com/results?search_query=${searchEncoded}" target="_blank" rel="noopener noreferrer" style="font-size:0.78rem; color:var(--accent-gold); text-decoration:none;">YouTube 더보기 →</a>
    </div>
    <div class="youtube-video-container" style="margin-bottom:0.4rem;">
      <iframe id="dealModalYoutubeIframe" src="https://www.youtube.com/embed/${escapeHtml(validVideoId)}?rel=0&modestbranding=1" title="${escapeHtml(deal.title)} Official Demo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
    </div>
  `;
  openModal('dealDetailModal');
}

async function deleteDealItem(dealId) {
  if (!isUserAdmin(currentUser)) { alert('관리자 권한이 없습니다.'); return; }
  if (!confirm('이 딜 상품을 목록에서 삭제하시겠습니까?')) return;
  const target = dealsData.find(d => String(d.id) === String(dealId));
  markIdAsDeleted(DELETED_DEALS_STORAGE_KEY, dealId);
  if (target && target.dbRowId && supabaseClient) {
    try { await supabaseClient.from('deals').delete().eq('id', target.dbRowId); } catch (e) {}
  }
  closeModal('dealDetailModal');
  updateSavedDealCountBadge();
  renderDeals();
  alert('해당 딜이 삭제되었습니다.');
}

function filterCategory(cat) {
  if (cat === 'affiliate') openInquiryModal('브랜드 제휴 및 광고 문의');
}

let currentCommCat = 'all';
let postCommentsCache = {};

function setCommunityCategory(cat, el) {
  document.querySelectorAll('#communityView .main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentCommCat = cat;
  renderCommunityPosts();
}

function getCommentCountForPost(postId) {
  const strId = String(postId);
  const dbComments = postCommentsCache[strId] || [];
  const localComments = (getLocalCommentsMap())[strId] || [];
  const combinedIds = new Set();
  let count = 0;
  dbComments.concat(localComments).forEach(c => {
    const key = String(c.id || c.created_at);
    if (!combinedIds.has(key)) { combinedIds.add(key); count++; }
  });
  return count;
}

async function fetchAllCommentsSummary() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('comments').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      const grouped = {};
      data.forEach(c => {
        const pid = String(c.post_id);
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(c);
      });
      postCommentsCache = grouped;
    }
  } catch (e) {}
}

async function fetchCommunityPosts() {
  const listEl = document.getElementById('communityList');
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  await fetchAllCommentsSummary();
  if (!supabaseClient) {
    if (rawCommunityPosts.length === 0) {
      rawCommunityPosts = [
        { id: 1, category: "공지사항", author_nickname: "@aftrdry", author_daw: "Logic Pro", plugin_tag: "PlugAzit", title: "PlugAzit 공식 아지트 개설 및 커뮤니티 이용 안내", content: "프로듀서들을 위한 VST 딜 큐레이션 및 사운드 커뮤니티 공간에 오신 것을 환영합니다.", views: 42, likes_count: 12, created_at: new Date().toISOString() },
        { id: 2, category: "믹싱/마스터링", author_nickname: "@aftrdry", author_daw: "Ableton Live", plugin_tag: "Pro-Q 3", title: "FabFilter Pro-Q 3 Dynamic EQ로 보컬-악기 마스킹 잡는 실전 팁", content: "보컬 핵심 대역인 2.5kHz와 중저역 250Hz 영역에 Sidechain 연동 후 Dynamic EQ를 걸어주면 보컬이 선명하게 앞으로 나옵니다.", views: 28, likes_count: 9, created_at: new Date().toISOString() }
      ];
    }
    rawCommunityPosts = rawCommunityPosts.filter(p => !deletedIds.includes(String(p.id)));
    updateScrappedPostCountBadge();
    renderCommunityPosts();
    return;
  }
  try {
    const { data, error } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    if (error) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">게시글 목록을 불러오지 못했습니다.</div>`;
    } else {
      rawCommunityPosts = (data || []).filter(p => !deletedIds.includes(String(p.id)));
      updateScrappedPostCountBadge();
      renderCommunityPosts();
    }
  } catch (err) { console.error(err); }
}

function renderCommunityPosts() {
  const listEl = document.getElementById('communityList');
  const keyword = document.getElementById('commSearchKeyword').value.trim().toLowerCase();
  const sortBy = document.getElementById('commSortOption')?.value || 'latest';
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  const scrappedIds = getScrappedPostIds();

  let enriched = rawCommunityPosts.filter(p => !deletedIds.includes(String(p.id))).map(p => {
    const stats = getPostStats(p);
    return {
      ...p,
      title: stats.editedTitle || p.title,
      content: stats.editedContent || p.content,
      category: stats.editedCategory || p.category,
      _views: stats.views, _likes: stats.likes, _daw: stats.daw, _pluginTag: stats.pluginTag,
      _comments: getCommentCountForPost(p.id)
    };
  });

  if (currentCommCat !== 'all') {
    if (currentCommCat === 'scrapped') enriched = enriched.filter(p => scrappedIds.includes(String(p.id)));
    else enriched = enriched.filter(p => p.category === currentCommCat);
  }
  if (keyword !== '') {
    enriched = enriched.filter(p => (p.title && p.title.toLowerCase().includes(keyword)) || (p.content && p.content.toLowerCase().includes(keyword)) || (p.author_nickname && p.author_nickname.toLowerCase().includes(keyword)) || (p._daw && p._daw.toLowerCase().includes(keyword)) || (p._pluginTag && p._pluginTag.toLowerCase().includes(keyword)));
  }
  enriched.sort((a, b) => {
    const aNotice = a.category === '공지사항' ? 1 : 0;
    const bNotice = b.category === '공지사항' ? 1 : 0;
    if (aNotice !== bNotice) return bNotice - aNotice;
    if (sortBy === 'popular') return b._likes - a._likes;
    if (sortBy === 'comments') return b._comments - a._comments;
    if (sortBy === 'views') return b._views - a._views;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  if (enriched.length === 0) {
    const emptyMsg = currentCommCat === 'scrapped' ? '스크랩한 커뮤니티 게시글이 없습니다.' : '조건에 해당하는 게시글이 없습니다.';
    listEl.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary); background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color);">${emptyMsg}</div>`;
    return;
  }

  listEl.innerHTML = enriched.map(p => {
    const isNotice = p.category === '공지사항';
    const cardClass = isNotice ? 'comm-card notice-card' : 'comm-card';
    const badgeClass = isNotice ? 'comm-category-badge notice' : 'comm-category-badge';
    const dateStr = new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
    const plainPreview = String(p.content || '').replace(/\[밑줄\]|\[\/밑줄\]|\[색상[^\]]*\]|\[\/색상\]|\[형광펜[^\]]*\]|\[\/형광펜\]|\*\*/g, '');
    const isScrapped = scrappedIds.includes(String(p.id));
    return `
      <div class="${cardClass}" onclick="openPostDetail(${safeId})">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.4rem;">
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.2rem;">
            <span class="${badgeClass}">${escapeHtml(p.category || '자유수다')}</span>
            <span class="comm-author">${escapeHtml(p.author_nickname)}</span>
            ${p._daw ? `<span class="comm-daw-badge">${escapeHtml(p._daw)}</span>` : ''}
            ${p._pluginTag ? `<span class="comm-plugin-tag"># ${escapeHtml(p._pluginTag)}</span>` : ''}
          </div>
          <span style="font-size:0.76rem; color:var(--text-secondary);">${escapeHtml(dateStr)}</span>
        </div>
        <h4 style="margin:0.4rem 0 0.35rem 0; font-size:1.06rem; color:var(--text-primary); font-weight:600;">${escapeHtml(p.title)}</h4>
        <p style="font-size:0.86rem; color:var(--text-secondary); font-weight:400; line-height:1.55; white-space: pre-wrap; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(plainPreview)}</p>
        <div class="comm-card-footer">
          <div class="comm-stats-group">
            <span>추천 ${p._likes}</span>
            <span>댓글 ${p._comments}</span>
            <span>조회 ${p._views}</span>
            ${isScrapped ? `<span style="color:var(--accent-gold);">스크랩됨</span>` : ''}
          </div>
          <span style="color:var(--accent-gold);">상세 보기</span>
        </div>
      </div>
    `;
  }).join('');
}

/* 에디터 선택 영역 보존 및 다중 글자색 / 형광펜 옵션 적용 */
function saveCurrentEditorSelection() {
  const editorEl = document.getElementById('writeContentEditor');
  const sel = window.getSelection();
  if (editorEl && sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (editorEl.contains(range.commonAncestorContainer)) {
      savedEditorRange = range.cloneRange();
    }
  }
}

function restoreEditorSelection() {
  const editorEl = document.getElementById('writeContentEditor');
  if (!editorEl) return;
  editorEl.focus();
  if (savedEditorRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedEditorRange);
  }
}

function setupEnhancedEditorAndEffects() {
  // 1) 상세 모달 여백 및 빛나는 스크롤바/파티클 CSS 자동 주입 (기존 파일 수정이 덜 되었더라도 100% 작동 보장)
  if (!document.getElementById('plugazitDynamicEnhanceStyle')) {
    const st = document.createElement('style');
    st.id = 'plugazitDynamicEnhanceStyle';
    st.textContent = `
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: var(--bg-color); }
      ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(198,174,130,0.32), rgba(74,90,58,0.48));
        border-radius: 999px;
        box-shadow: 0 0 8px rgba(198,174,130,0.22);
      }
      ::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active {
        background: linear-gradient(180deg, rgba(198,174,130,0.65), rgba(92,112,72,0.75));
        box-shadow: 0 0 14px rgba(198,174,130,0.45);
      }
      .scroll-glow-particle {
        position: fixed; right: 6px; border-radius: 50%; pointer-events: none; z-index: 9999;
        background: radial-gradient(circle, rgba(198,174,130,0.75) 0%, rgba(198,174,130,0) 72%);
        animation: plugazitParticleFade 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes plugazitParticleFade {
        0% { opacity: 0.75; transform: translate(0, 0) scale(1); }
        100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.15); }
      }
      .editor-select-tool {
        height: 30px !important; padding: 0 1.8rem 0 0.6rem !important; font-size: 0.78rem !important;
        border-radius: 6px !important; background-position: right 0.5rem center !important;
      }
      .detail-top-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; padding-right:2.2rem; margin-bottom:1.2rem; }
      .detail-brand-tag { font-size:0.75rem; font-weight:600; color:var(--accent-gold); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:0.2rem; }
      .detail-main-title { font-size:1.65rem; font-weight:700; color:var(--text-primary); letter-spacing:-0.02em; line-height:1.3; }
      .detail-hero-grid { display:grid; grid-template-columns:1.15fr 1fr; gap:1.4rem; align-items:stretch; margin-bottom:1.5rem; }
      .detail-hero-img { height:230px !important; border-radius:10px; border:1px solid var(--border-color); background:#0b0d0c; }
      .detail-summary-panel { background:var(--bg-color); border:1px solid var(--border-color); border-radius:10px; padding:1.3rem; display:flex; flex-direction:column; justify-content:space-between; }
      .detail-desc-body { font-size:0.9rem; color:var(--text-secondary); line-height:1.65; margin-bottom:1rem; }
      .detail-price-strip { display:flex; justify-content:space-between; align-items:baseline; padding-top:0.9rem; border-top:1px solid var(--border-color); }
      @media (max-width: 768px) {
        .modal-overlay { padding: 1.2rem 7vw !important; }
        .modal-box, .modal-box.large-detail-modal { width: 86vw !important; max-width: 86vw !important; max-height: 82vh !important; padding: 1.25rem 1rem !important; margin: 0 auto !important; }
        .detail-hero-grid { grid-template-columns: 1fr !important; gap: 1rem !important; }
        .detail-hero-img { height: 185px !important; }
      }
    `;
    document.head.appendChild(st);
  }

  // 2) 에디터 툴바에 이모티콘 없는 깔끔한 글자색/형광펜 선택 드롭다운 구성
  const toolbar = document.querySelector('.editor-toolbar');
  if (toolbar && !document.getElementById('editorTextColorSelect')) {
    const oldColorBtn = document.getElementById('btnToolColor');
    const oldHlBtn = document.getElementById('btnToolHighlight');
    if (oldColorBtn) oldColorBtn.remove();
    if (oldHlBtn) oldHlBtn.remove();

    const colorSelect = document.createElement('select');
    colorSelect.id = 'editorTextColorSelect';
    colorSelect.className = 'editor-select-tool';
    colorSelect.setAttribute('aria-label', '글자색 선택');
    colorSelect.innerHTML = `
      <option value="">글자색 선택</option>
      <option value="#c6ae82">샴페인 골드</option>
      <option value="#8fa874">올리브 그린</option>
      <option value="#e07a5f">코랄 레드</option>
      <option value="#7ea8be">스카이 블루</option>
      <option value="inherit">기본 글자색</option>
    `;
    colorSelect.addEventListener('mousedown', saveCurrentEditorSelection);
    colorSelect.addEventListener('change', function() {
      applyEditorTextColor(this.value);
    });

    const hlSelect = document.createElement('select');
    hlSelect.id = 'editorHighlightSelect';
    hlSelect.className = 'editor-select-tool';
    hlSelect.setAttribute('aria-label', '형광펜 선택');
    hlSelect.innerHTML = `
      <option value="">형광펜 선택</option>
      <option value="rgba(198,174,130,0.28)">골드 형광펜</option>
      <option value="rgba(143,168,116,0.28)">올리브 형광펜</option>
      <option value="rgba(224,122,95,0.26)">코랄 형광펜</option>
      <option value="none">형광펜 해제</option>
    `;
    hlSelect.addEventListener('mousedown', saveCurrentEditorSelection);
    hlSelect.addEventListener('change', function() {
      applyEditorHighlight(this.value);
    });

    const underlineBtn = document.getElementById('btnToolUnderline');
    if (underlineBtn && underlineBtn.nextSibling) {
      toolbar.insertBefore(hlSelect, underlineBtn.nextSibling);
      toolbar.insertBefore(colorSelect, hlSelect);
    } else {
      toolbar.appendChild(colorSelect);
      toolbar.appendChild(hlSelect);
    }
  }

  // 3) 에디터 및 입력창 키보드 홀드(꾹 누르기: ㅇㅇㅇㅇㅇㅇ) 연속 타이핑 보장 엔진
  const editorEl = document.getElementById('writeContentEditor');
  if (editorEl) {
    ['keyup', 'mouseup', 'touchend'].forEach(ev => editorEl.addEventListener(ev, saveCurrentEditorSelection));
  }

  let holdRepeatTimer = null;
  let holdLastKey = '';
  let holdNativeRepeatFired = false;

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target) return;
    const isEditable = target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
    if (!isEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.repeat) {
      holdNativeRepeatFired = true;
      return;
    }

    if (e.key && e.key.length === 1) {
      holdLastKey = e.key;
      holdNativeRepeatFired = false;
      clearInterval(holdRepeatTimer);
      const startTime = Date.now();
      holdRepeatTimer = setInterval(() => {
        if (holdNativeRepeatFired) {
          clearInterval(holdRepeatTimer);
          return;
        }
        if (Date.now() - startTime < 360) return;
        if (document.activeElement !== target) {
          clearInterval(holdRepeatTimer);
          return;
        }
        if (target.isContentEditable) {
          document.execCommand('insertText', false, holdLastKey);
          handleEditorTyping();
        } else if (typeof target.selectionStart === 'number') {
          const st = target.selectionStart;
          const en = target.selectionEnd;
          target.value = target.value.slice(0, st) + holdLastKey + target.value.slice(en);
          target.selectionStart = target.selectionEnd = st + holdLastKey.length;
        }
      }, 45);
    }
  });

  ['keyup', 'blur'].forEach(ev => {
    window.addEventListener(ev, () => {
      clearInterval(holdRepeatTimer);
      holdRepeatTimer = null;
    });
  });

  // 4) 스크롤바 드래그 및 이동 시 은은하게 퍼지는 빛 입자(Subtle Glow Particle) 효과
  let lastScrollParticleAt = 0;
  function emitSubtleScrollParticle(intensity = 1) {
    const now = Date.now();
    if (now - lastScrollParticleAt < 65) return;
    lastScrollParticleAt = now;

    const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / docH));
    const thumbY = 70 + ratio * (window.innerHeight - 140);

    const count = intensity > 1 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'scroll-glow-particle';
      const size = (3.5 + Math.random() * 4).toFixed(1);
      const dx = (-8 - Math.random() * 18).toFixed(1) + 'px';
      const dy = ((Math.random() - 0.5) * 26).toFixed(1) + 'px';
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.top = `${thumbY + (Math.random() - 0.5) * 24}px`;
      p.style.setProperty('--dx', dx);
      p.style.setProperty('--dy', dy);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  window.addEventListener('scroll', () => emitSubtleScrollParticle(1), { passive: true });
  window.addEventListener('mouseup', (e) => {
    if (window.innerWidth - e.clientX <= 24) emitSubtleScrollParticle(2);
  });
}

function showPostWritePage(editPostObj = null) {
  if (!currentUser && supabaseClient) {
    alert('로그인이 필요한 기능입니다.');
    openModal('loginModal');
    return;
  }
  const form = document.getElementById('standalonePostForm');
  form.reset();
  document.getElementById('writeOptNotice').style.display = isUserAdmin(currentUser) ? 'block' : 'none';
  const headingEl = document.getElementById('postWriteHeading');
  const submitBtn = document.getElementById('btnSubmitPost');
  const editorEl = document.getElementById('writeContentEditor');

  if (editPostObj) {
    editingPostId = editPostObj.id;
    const stats = getPostStats(editPostObj);
    if (headingEl) headingEl.innerText = '커뮤니티 게시글 수정';
    if (submitBtn) submitBtn.innerText = '수정 내용 저장';
    document.getElementById('writeCategorySelect').value = stats.editedCategory || editPostObj.category || '자유수다';
    if (document.getElementById('writePluginTag')) document.getElementById('writePluginTag').value = stats.pluginTag || '';
    document.getElementById('writeTitle').value = stats.editedTitle || editPostObj.title || '';
    const rawBody = stats.editedContent || editPostObj.content || '';
    if (editorEl) editorEl.innerHTML = storedTextToWysiwygHtml(rawBody);
    document.getElementById('editorGuideOverlay').style.opacity = '0';
  } else {
    editingPostId = null;
    if (headingEl) headingEl.innerText = '프로듀서 커뮤니티 글 작성';
    if (submitBtn) submitBtn.innerText = '작성 완료 및 등록';
    if (editorEl) editorEl.innerHTML = '';
    document.getElementById('editorGuideOverlay').style.opacity = '0.8';
  }
  updateToolbarActiveState();
  showPage('postWrite');
}

function cancelPostWrite() { editingPostId = null; showPage('community'); }

function handleEditorTyping() {
  const editorEl = document.getElementById('writeContentEditor');
  const overlay = document.getElementById('editorGuideOverlay');
  if (!editorEl || !overlay) return;
  const textLen = (editorEl.innerText || '').replace(/\u200B/g, '').trim().length;
  overlay.style.opacity = textLen > 0 ? '0' : '0.8';
  updateToolbarActiveState();
}

function updateToolbarActiveState() {
  try {
    const boldBtn = document.getElementById('btnToolBold');
    const underBtn = document.getElementById('btnToolUnderline');
    if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    if (underBtn) underBtn.classList.toggle('active', document.queryCommandState('underline'));
  } catch (e) {}
}

function applyInlineStyleToSelection(type, value) {
  restoreEditorSelection();
  const editorEl = document.getElementById('writeContentEditor');
  if (!editorEl) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  if (value === 'inherit' || value === 'none') {
    const parentEl = sel.anchorNode?.parentElement;
    const targetTag = type === 'hl' ? 'mark' : 'span';
    if (parentEl && parentEl.tagName?.toLowerCase() === targetTag) {
      const txt = document.createTextNode(parentEl.textContent);
      parentEl.parentNode.replaceChild(txt, parentEl);
    }
    handleEditorTyping();
    return;
  }

  const wrapper = document.createElement(type === 'hl' ? 'mark' : 'span');
  if (type === 'hl') {
    wrapper.className = 'comm-custom-hl';
    wrapper.setAttribute('data-hl', value);
    wrapper.style.backgroundColor = value;
    wrapper.style.color = 'inherit';
    wrapper.style.padding = '0.08rem 0.28rem';
    wrapper.style.borderRadius = '4px';
  } else {
    wrapper.className = 'comm-custom-color';
    wrapper.setAttribute('data-color', value);
    wrapper.style.color = value;
  }

  if (!range.collapsed) {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
    savedEditorRange = newRange.cloneRange();
  } else {
    wrapper.innerHTML = '​';
    range.insertNode(wrapper);
    const newRange = document.createRange();
    newRange.setStart(wrapper.firstChild, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedEditorRange = newRange.cloneRange();
  }
  handleEditorTyping();
}

function applyEditorTextColor(colorVal) {
  if (!colorVal) return;
  applyInlineStyleToSelection('color', colorVal);
  const selEl = document.getElementById('editorTextColorSelect');
  if (selEl) selEl.value = '';
}

function applyEditorHighlight(hlVal) {
  if (!hlVal) return;
  applyInlineStyleToSelection('hl', hlVal);
  const selEl = document.getElementById('editorHighlightSelect');
  if (selEl) selEl.value = '';
}

function formatEditorText(command) {
  const editorEl = document.getElementById('writeContentEditor');
  if (!editorEl) return;
  editorEl.focus();
  if (command === 'bold' || command === 'underline') {
    document.execCommand(command, false, null);
  } else if (command === 'color') {
    applyInlineStyleToSelection('color', '#c6ae82');
  } else if (command === 'highlight') {
    applyInlineStyleToSelection('hl', 'rgba(198,174,130,0.28)');
  }
  saveCurrentEditorSelection();
  handleEditorTyping();
}

function insertTextAtEditorCursor(text) {
  restoreEditorSelection();
  const editorEl = document.getElementById('writeContentEditor');
  if (!editorEl) return;
  if (!document.execCommand('insertText', false, text)) {
    editorEl.innerHTML += escapeHtml(text).replace(/\n/g, '<br>');
  }
  saveCurrentEditorSelection();
  handleEditorTyping();
}

function insertEditorLink() {
  saveCurrentEditorSelection();
  const url = prompt('삽입할 웹 링크 URL을 입력하세요 (https:// 포함):', 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  insertTextAtEditorCursor(` [링크](${url.trim()}) `);
}

function insertEditorMedia(type) {
  saveCurrentEditorSelection();
  let label = '이미지 URL';
  if (type === 'video') label = '유튜브 영상 URL';
  if (type === 'audio') label = 'SoundCloud 링크 또는 오디오(.mp3/.wav) URL';
  const url = prompt(`첨부할 ${label}을 입력하세요 (https:// 포함):`, 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  if (type === 'image') insertTextAtEditorCursor(`\n![이미지첨부](${url.trim()})\n`);
  else if (type === 'audio') insertTextAtEditorCursor(`\n[오디오링크](${url.trim()})\n`);
  else insertTextAtEditorCursor(`\n[동영상링크](${url.trim()})\n`);
}

async function handleStandalonePostSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitPost');
  await withSubmitLock('postSubmit', btn, async () => {
    const category = document.getElementById('writeCategorySelect').value;
    const pluginTag = document.getElementById('writePluginTag')?.value.trim() || '';
    const title = document.getElementById('writeTitle').value.trim();
    const editorEl = document.getElementById('writeContentEditor');
    const content = serializeWysiwygEditor(editorEl);

    if (!content) { alert('본문 내용을 입력해 주세요.'); editorEl?.focus(); return; }
    if (category === '공지사항' && !isUserAdmin(currentUser)) { alert('공지사항은 관리자만 작성할 수 있습니다.'); return; }

    if (editingPostId !== null) {
      const metaMap = getPostMetaMap();
      const key = String(editingPostId);
      metaMap[key] = { ...(metaMap[key] || {}), editedCategory: category, editedTitle: title, editedContent: content, pluginTag, daw: currentUserDaw };
      savePostMetaMap(metaMap);
      if (supabaseClient) {
        try {
          const numId = !isNaN(Number(editingPostId)) ? Number(editingPostId) : editingPostId;
          await supabaseClient.from('posts').update({ category, title, content }).eq('id', numId);
        } catch (err) {}
      }
      const target = rawCommunityPosts.find(p => String(p.id) === String(editingPostId));
      if (target) { target.category = category; target.title = title; target.content = content; }
      const finishedId = editingPostId;
      editingPostId = null;
      alert('게시글이 수정되었습니다.');
      openPostDetail(finishedId);
      return;
    }

    if (!supabaseClient) {
      rawCommunityPosts.unshift({
        id: Date.now(), category, author_nickname: originalNickname || '@aftrdry',
        author_daw: currentUserDaw, plugin_tag: pluginTag, title, content,
        views: 1, likes_count: 0, created_at: new Date().toISOString()
      });
      alert('게시글이 등록되었습니다.');
      showPage('community');
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { alert('로그인이 만료되었습니다.'); openModal('loginModal'); return; }
    const user = session.user;
    const nickname = originalNickname || user.user_metadata?.nickname || '@' + user.email.split('@')[0];
    const { data: insertedData, error } = await supabaseClient.from('posts').insert([{ user_id: user.id, author_nickname: nickname, category, title, content }]).select().maybeSingle();
    if (error) {
      alert('게시글 작성 실패: ' + error.message);
    } else {
      if (insertedData && insertedData.id) {
        const metaMap = getPostMetaMap();
        metaMap[String(insertedData.id)] = { daw: currentUserDaw, pluginTag, extraViews: 1, extraLikes: 0 };
        savePostMetaMap(metaMap);
      }
      alert('게시글이 등록되었습니다.');
      showPage('community');
      await fetchCommunityPosts();
    }
  });
}

function isUserOwnerOfPost(post) {
  if (!currentUser || !post) return false;
  const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : '';
  const userNick = originalNickname || currentUser.user_metadata?.nickname || (emailPrefix ? '@' + emailPrefix : '');
  if (isUserAdmin(currentUser)) return true;
  if (post.user_id && String(currentUser.id) === String(post.user_id)) return true;
  if (post.author_nickname) {
    const cleanAuthor = post.author_nickname.replace(/^@/, '');
    const cleanUser = userNick.replace(/^@/, '');
    if (cleanAuthor === cleanUser || cleanAuthor === emailPrefix) return true;
  }
  return false;
}

function openPostDetail(id) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(id));
  if (!post) return;
  currentOpenPostId = post.id;
  const metaMap = getPostMetaMap();
  const strId = String(post.id);
  metaMap[strId] = { ...(metaMap[strId] || {}), extraViews: ((metaMap[strId] && metaMap[strId].extraViews) || 0) + 1 };
  savePostMetaMap(metaMap);

  const stats = getPostStats(post);
  const displayCategory = stats.editedCategory || post.category;
  const displayTitle = stats.editedTitle || post.title;
  const displayContent = stats.editedContent || post.content;
  const container = document.getElementById('postDetailContainer');
  const actionBtns = document.getElementById('postDetailActionBtns');
  const dateStr = new Date(post.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const isMyPost = isUserOwnerOfPost(post);
  const safeId = typeof post.id === 'string' ? `'${post.id}'` : post.id;
  const isScrapped = getScrappedPostIds().includes(strId);

  actionBtns.innerHTML = `
    <button type="button" class="nav-btn" onclick="openReportModal('post', ${safeId}, '${escapeHtml(displayTitle)}')">신고하기</button>
    ${isMyPost ? `<button type="button" class="nav-btn" onclick="triggerEditCurrentPost(${safeId})">수정하기</button>` : ''}
    ${isMyPost ? `<button type="button" class="nav-btn danger-outline-btn" onclick="deletePost(${safeId})">삭제하기</button>` : ''}
  `;
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.1rem;">
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.35rem;">
        <span class="comm-category-badge ${displayCategory === '공지사항' ? 'notice' : ''}">${escapeHtml(displayCategory)}</span>
        <span class="comm-author" style="font-size:0.95rem;">${escapeHtml(post.author_nickname)}</span>
        ${stats.daw ? `<span class="comm-daw-badge">${escapeHtml(stats.daw)}</span>` : ''}
        ${stats.pluginTag ? `<span class="comm-plugin-tag"># ${escapeHtml(stats.pluginTag)}</span>` : ''}
      </div>
      <div style="font-size:0.8rem; color:var(--text-secondary);">
        <span>조회 ${stats.views}</span> · <span>${escapeHtml(dateStr)}</span>
      </div>
    </div>
    <h2 style="font-size:1.6rem; font-weight:700; margin-bottom:1.1rem; color:var(--text-primary); line-height:1.4;">${escapeHtml(displayTitle)}</h2>
    <div style="font-size:0.96rem; color:var(--text-primary); font-weight:400; line-height:1.85; white-space: pre-wrap; padding: 1.4rem 0; border-top:1px solid var(--border-color);">${renderSafeContent(displayContent)}</div>
    <div class="post-upvote-bar">
      <div style="display:flex; gap:0.55rem; flex-wrap:wrap;">
        <button type="button" id="btnPostUpvote" class="upvote-action-btn ${stats.voted ? 'voted' : ''}" onclick="togglePostUpvote(${safeId})">
          <span>유익한 글 추천</span>
          <span id="postUpvoteCountText" style="color:var(--accent-gold);">${stats.likes}</span>
        </button>
        <button type="button" id="btnPostScrap" class="upvote-action-btn ${isScrapped ? 'voted' : ''}" onclick="toggleScrapPost(${safeId}, event)">
          ${isScrapped ? '스크랩됨' : '+ 스크랩'}
        </button>
      </div>
      <span style="font-size:0.8rem; color:var(--text-secondary);">도움이 되었다면 추천 또는 스크랩해 두세요.</span>
    </div>
  `;
  renderPostComments(post.id);
  showPage('postDetail');
}

function triggerEditCurrentPost(id) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(id));
  if (post) showPostWritePage(post);
}

function togglePostUpvote(postId) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(postId));
  if (!post) return;
  const map = getPostMetaMap();
  const key = String(post.id);
  const current = map[key] || {};
  const nextVoted = !current.voted;
  map[key] = { ...current, voted: nextVoted, extraLikes: Math.max(0, (Number(current.extraLikes) || 0) + (nextVoted ? 1 : -1)) };
  savePostMetaMap(map);
  const stats = getPostStats(post);
  document.getElementById('btnPostUpvote')?.classList.toggle('voted', stats.voted);
  const countEl = document.getElementById('postUpvoteCountText');
  if (countEl) countEl.innerText = stats.likes;
}

async function renderPostComments(postId) {
  const listEl = document.getElementById('postCommentsList');
  const badgeEl = document.getElementById('postCommentCountBadge');
  if (!listEl) return;
  const strPostId = String(postId);
  if (supabaseClient) {
    try {
      const numId = !isNaN(Number(postId)) ? Number(postId) : postId;
      const { data, error } = await supabaseClient.from('comments').select('*').eq('post_id', numId).order('created_at', { ascending: true });
      if (!error && data) postCommentsCache[strPostId] = data;
    } catch (e) {}
  }
  const dbList = postCommentsCache[strPostId] || [];
  const localList = (getLocalCommentsMap())[strPostId] || [];
  const merged = [];
  const seen = new Set();
  dbList.concat(localList).forEach(c => {
    const key = String(c.id || c.created_at);
    if (!seen.has(key)) { seen.add(key); merged.push(c); }
  });
  if (badgeEl) badgeEl.innerText = merged.length;
  if (merged.length === 0) {
    listEl.innerHTML = `<div style="padding:1.4rem; text-align:center; color:var(--text-secondary); font-size:0.85rem; background:var(--bg-color); border:1px solid var(--border-color); border-radius:8px;">등록된 댓글이 없습니다.</div>`;
    return;
  }
  listEl.innerHTML = merged.map(c => {
    const cDate = new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const emailPrefix = currentUser?.email ? currentUser.email.split('@')[0] : '';
    const userNick = originalNickname || currentUser?.user_metadata?.nickname || (emailPrefix ? '@' + emailPrefix : '');
    const canDelete = currentUser && (isUserAdmin(currentUser) || (c.user_id && String(c.user_id) === String(currentUser.id)) || (c.author_nickname && c.author_nickname.replace(/^@/, '') === userNick.replace(/^@/, '')));
    const safeCommentId = typeof c.id === 'string' ? `'${c.id}'` : c.id;
    const shortSnippet = String(c.content || '').substring(0, 30);
    return `
      <div class="comm-comment-item">
        <div class="comm-comment-top">
          <div>
            <span class="comm-author" style="font-size:0.86rem;">${escapeHtml(c.author_nickname)}</span>
            ${c.author_daw ? `<span class="comm-daw-badge">${escapeHtml(c.author_daw)}</span>` : ''}
            <span style="font-size:0.74rem; color:var(--text-secondary);">${escapeHtml(cDate)}</span>
          </div>
          <div style="display:flex; gap:0.35rem;">
            <button type="button" class="nav-btn" style="padding:0.2rem 0.58rem; font-size:0.73rem;" onclick="openReportModal('comment', ${safeCommentId}, '${escapeHtml(shortSnippet)}')">신고</button>
            ${canDelete ? `<button type="button" class="nav-btn danger-outline-btn" style="padding:0.2rem 0.58rem; font-size:0.73rem;" onclick="deleteCommentItem('${escapeHtml(strPostId)}', ${safeCommentId})">삭제</button>` : ''}
          </div>
        </div>
        <div class="comm-comment-body">${renderSafeContent(c.content)}</div>
      </div>
    `;
  }).join('');
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  if (!currentUser && supabaseClient) { alert('댓글을 작성하려면 로그인이 필요합니다.'); openModal('loginModal'); return; }
  if (currentOpenPostId === null) return;
  const btn = document.getElementById('btnSubmitComment');
  await withSubmitLock('commentSubmit', btn, async () => {
    const inputEl = document.getElementById('commentInputText');
    const content = inputEl.value.trim();
    if (!content) return;
    const strPostId = String(currentOpenPostId);
    const emailPrefix = currentUser?.email ? currentUser.email.split('@')[0] : 'producer';
    const nickname = originalNickname || currentUser?.user_metadata?.nickname || '@' + emailPrefix;
    let savedDbComment = null;
    if (supabaseClient && currentUser) {
      try {
        const numPostId = !isNaN(Number(currentOpenPostId)) ? Number(currentOpenPostId) : currentOpenPostId;
        const { data, error } = await supabaseClient.from('comments').insert([{ post_id: numPostId, user_id: currentUser.id, author_nickname: nickname, author_daw: currentUserDaw, content }]).select().maybeSingle();
        if (!error && data) savedDbComment = data;
      } catch (err) {}
    }
    if (!savedDbComment) {
      const localMap = getLocalCommentsMap();
      if (!localMap[strPostId]) localMap[strPostId] = [];
      localMap[strPostId].push({ id: 'local_' + Date.now(), post_id: currentOpenPostId, user_id: currentUser?.id || 'local', author_nickname: nickname, author_daw: currentUserDaw, content, created_at: new Date().toISOString() });
      saveLocalCommentsMap(localMap);
    }
    inputEl.value = '';
    await renderPostComments(currentOpenPostId);
  });
}

async function deleteCommentItem(postId, commentId) {
  if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
  const strPostId = String(postId);
  const localMap = getLocalCommentsMap();
  if (localMap[strPostId]) {
    localMap[strPostId] = localMap[strPostId].filter(c => String(c.id) !== String(commentId));
    saveLocalCommentsMap(localMap);
  }
  if (postCommentsCache[strPostId]) {
    postCommentsCache[strPostId] = postCommentsCache[strPostId].filter(c => String(c.id) !== String(commentId));
  }
  if (supabaseClient && !String(commentId).startsWith('local_')) {
    try {
      const numCid = !isNaN(Number(commentId)) ? Number(commentId) : commentId;
      await supabaseClient.from('comments').delete().eq('id', numCid);
    } catch (e) {}
  }
  if (currentOpenPostId && String(currentOpenPostId) === strPostId) await renderPostComments(postId);
}

async function deletePost(id) {
  if (!confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
  markIdAsDeleted(DELETED_POSTS_STORAGE_KEY, id);
  rawCommunityPosts = rawCommunityPosts.filter(p => String(p.id) !== String(id));
  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        const numId = !isNaN(Number(id)) ? Number(id) : id;
        const { data, error } = await supabaseClient.from('posts').delete().eq('id', numId).select();
        if (!error && (!data || data.length === 0)) {
          await supabaseClient.from('posts').delete().match({ id: numId, user_id: session.user.id });
        }
      }
    } catch (err) {}
  }
  alert('게시글이 삭제되었습니다.');
  updateScrappedPostCountBadge();
  showPage('community');
  renderCommunityPosts();
}

function switchMyPageTab(tabName, el) {
  document.querySelectorAll('#myPageView .cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('mpTabProfile').style.display = tabName === 'profile' ? 'block' : 'none';
  document.getElementById('mpTabSecurity').style.display = tabName === 'security' ? 'block' : 'none';
  document.getElementById('mpTabActivity').style.display = tabName === 'activity' ? 'block' : 'none';
  if (tabName === 'activity') fetchMyActivityPosts();
}

async function initMyPageData() {
  if (!supabaseClient) {
    originalNickname = '@aftrdry';
    document.getElementById('myPageEmail').value = 'aftrdry@outlook.kr';
    document.getElementById('myPageNickname').value = originalNickname;
    document.getElementById('myPageDaw').value = currentUserDaw;
    onNicknameInputChanged();
    return;
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    currentUser = session.user;
    document.getElementById('myPageEmail').value = currentUser.email || '';
    const { data } = await supabaseClient.from('profiles').select('nickname, main_daw').eq('id', currentUser.id).maybeSingle();
    if (data && data.nickname) {
      originalNickname = data.nickname;
      document.getElementById('myPageNickname').value = originalNickname;
      if (data.main_daw) { currentUserDaw = data.main_daw; document.getElementById('myPageDaw').value = data.main_daw; }
    } else {
      originalNickname = currentUser.user_metadata?.nickname || '@' + currentUser.email.split('@')[0];
      document.getElementById('myPageNickname').value = originalNickname;
    }
    onNicknameInputChanged();
  } catch (err) {}
}

function onNicknameInputChanged() {
  const inputVal = document.getElementById('myPageNickname').value.trim();
  const msgEl = document.getElementById('nicknameCheckMsg');
  const saveBtn = document.getElementById('btnSaveProfile');
  if (inputVal === originalNickname) {
    isNicknameVerified = true;
    msgEl.style.color = 'var(--text-secondary)';
    msgEl.innerText = '현재 본인의 닉네임입니다.';
    saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer';
  } else {
    isNicknameVerified = false;
    msgEl.style.color = '#e74c3c';
    msgEl.innerText = '닉네임 변경 시 [중복 확인] 버튼을 눌러주세요.';
    saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; saveBtn.style.cursor = 'not-allowed';
  }
}

async function checkNicknameDuplicate() {
  const nickname = document.getElementById('myPageNickname').value.trim();
  const msgEl = document.getElementById('nicknameCheckMsg');
  const saveBtn = document.getElementById('btnSaveProfile');
  if (!nickname) { alert('닉네임을 입력해 주세요.'); return; }
  if (nickname === originalNickname || !supabaseClient) {
    isNicknameVerified = true;
    msgEl.style.color = '#8fa874';
    msgEl.innerText = '사용 가능한 닉네임입니다.';
    saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer';
    return;
  }
  const { data } = await supabaseClient.from('profiles').select('id').eq('nickname', nickname).maybeSingle();
  if (data) {
    isNicknameVerified = false;
    msgEl.style.color = '#e74c3c';
    msgEl.innerText = '이미 사용 중인 닉네임입니다.';
    saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; saveBtn.style.cursor = 'not-allowed';
  } else {
    isNicknameVerified = true;
    msgEl.style.color = '#8fa874';
    msgEl.innerText = '사용 가능한 닉네임입니다.';
    saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer';
  }
}

async function handleProfileUpdateSubmit(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btnSaveProfile');
  await withSubmitLock('profileUpdate', saveBtn, async () => {
    const nickname = document.getElementById('myPageNickname').value.trim();
    const main_daw = document.getElementById('myPageDaw').value;
    currentUserDaw = main_daw;
    try { localStorage.setItem('plugazit_user_daw', main_daw); } catch (err) {}
    if (!isNicknameVerified) { alert('닉네임 중복 확인을 완료해 주세요.'); return; }
    if (!supabaseClient) { alert('프로필이 저장되었습니다.'); return; }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const { error } = await supabaseClient.from('profiles').upsert({ id: session.user.id, email: session.user.email, nickname, main_daw, updated_at: new Date() });
    if (error) alert('저장 실패: ' + error.message);
    else { alert('프로필 정보가 저장되었습니다.'); originalNickname = nickname; }
  });
}

async function handlePasswordChangeSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnChangePw');
  await withSubmitLock('pwChange', btn, async () => {
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPw = document.getElementById('confirmNewPassword').value;
    if (newPassword !== confirmNewPw) { alert('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPassword.length < 6) { alert('비밀번호는 6자리 이상이어야 합니다.'); return; }
    if (!supabaseClient) { alert('비밀번호가 변경되었습니다.'); return; }
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) alert('비밀번호 변경 실패: ' + error.message);
    else { alert('비밀번호가 변경되었습니다.'); e.target.reset(); }
  });
}

async function handleAccountDeleteRequest() {
  if (!confirm('정말 회원 탈퇴를 진행하시겠습니까?\n탈퇴 즉시 데이터가 파기되며 복구할 수 없습니다.')) return;
  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        await supabaseClient.from('posts').delete().eq('user_id', session.user.id);
        await supabaseClient.from('profiles').delete().eq('id', session.user.id);
        await supabaseClient.auth.signOut();
      }
    } catch (err) {}
  }
  alert('회원 탈퇴 처리가 완료되었습니다.');
  location.reload();
}

async function fetchMyActivityPosts() {
  const listEl = document.getElementById('myActivityList');
  const scrapEl = document.getElementById('myScrappedList');
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  const scrappedIds = getScrappedPostIds();
  if (rawCommunityPosts.length === 0) await fetchCommunityPosts();

  const myPosts = rawCommunityPosts.filter(p => isUserOwnerOfPost(p) && !deletedIds.includes(String(p.id)));
  listEl.innerHTML = myPosts.length === 0
    ? `<p style="color:var(--text-secondary); text-align:center; padding: 1.5rem;">작성한 게시글이 없습니다.</p>`
    : myPosts.map(p => {
        const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
        const stats = getPostStats(p);
        return `<div class="comm-card" onclick="openPostDetail(${safeId})"><span class="comm-category-badge">${escapeHtml(stats.editedCategory || p.category)}</span><h4 style="margin:0.35rem 0; font-size:1rem; font-weight:600;">${escapeHtml(stats.editedTitle || p.title)}</h4><p style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(new Date(p.created_at).toLocaleDateString('ko-KR'))} · 추천 ${stats.likes} · 조회 ${stats.views}</p></div>`;
      }).join('');

  if (scrapEl) {
    const myScrapped = rawCommunityPosts.filter(p => scrappedIds.includes(String(p.id)) && !deletedIds.includes(String(p.id)));
    scrapEl.innerHTML = myScrapped.length === 0
      ? `<p style="color:var(--text-secondary); text-align:center; padding: 1.5rem;">스크랩한 게시글이 없습니다.</p>`
      : myScrapped.map(p => {
          const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
          const stats = getPostStats(p);
          return `<div class="comm-card" onclick="openPostDetail(${safeId})"><span class="comm-category-badge">${escapeHtml(stats.editedCategory || p.category)}</span><span class="comm-author">${escapeHtml(p.author_nickname)}</span><h4 style="margin:0.35rem 0; font-size:1rem; font-weight:600;">${escapeHtml(stats.editedTitle || p.title)}</h4></div>`;
        }).join('');
  }
}

async function checkUserSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  updateUIAuthStatus(currentUser);
  if (currentUser) {
    try {
      const { data } = await supabaseClient.from('profiles').select('nickname, main_daw').eq('id', currentUser.id).maybeSingle();
      if (data?.nickname) originalNickname = data.nickname;
      if (data?.main_daw) currentUserDaw = data.main_daw;
    } catch (e) {}
  }
}

function updateUIAuthStatus(user) {
  currentUser = user;
  document.getElementById('authNav').style.display = user ? 'none' : 'flex';
  document.getElementById('userNav').style.display = user ? 'flex' : 'none';
  const adminBtn = document.getElementById('navAdminBtn');
  if (adminBtn) adminBtn.style.display = isUserAdmin(user) ? 'block' : 'none';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnLoginSubmit');
  await withSubmitLock('login', btn, async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!supabaseClient) { closeModal('loginModal'); updateUIAuthStatus({ email }); alert('환영합니다.'); return; }
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert('로그인 실패: 이메일 또는 비밀번호를 확인해 주세요.');
    else { closeModal('loginModal'); await checkUserSession(); alert('로그인되었습니다.'); }
  });
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSignupSubmit');
  await withSubmitLock('signup', btn, async () => {
    const nickname = document.getElementById('signupNickname').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!supabaseClient) { closeModal('signupModal'); alert('회원가입 완료.'); return; }
    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { nickname } } });
    if (error) alert('회원가입 실패: ' + error.message);
    else { closeModal('signupModal'); alert('가입 완료. 이메일 인증 확인 후 로그인해 주세요.'); }
  });
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  if (!supabaseClient) { alert('재설정 메일 발송됨.'); closeModal('resetPwModal'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: 'https://plugazit.com' });
  if (error) alert('요청 실패: ' + error.message);
  else { alert('비밀번호 재설정 메일이 발송되었습니다.'); closeModal('resetPwModal'); }
}

async function handleFindEmailSubmit(e) {
  e.preventDefault();
  const nickname = document.getElementById('findNickname').value.trim();
  if (!supabaseClient) { alert('이메일 힌트: af***@outlook.kr'); closeModal('findEmailModal'); return; }
  const { data } = await supabaseClient.from('profiles').select('email, nickname').eq('nickname', nickname).maybeSingle();
  if (!data) alert('해당 닉네임의 회원을 찾을 수 없습니다.');
  else {
    const parts = data.email.split('@');
    const masked = parts[0].substring(0, 2) + '*'.repeat(Math.max(2, parts[0].length - 2)) + '@' + parts[1];
    alert(`가입 이메일 힌트: [ ${masked} ]`);
    closeModal('findEmailModal');
  }
}

async function handleLogout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  alert('로그아웃 되었습니다.');
  location.reload();
}

async function handleDealSubmit(e) {
  e.preventDefault();
  if (!isUserAdmin(currentUser) && supabaseClient) { alert('관리자 권한이 없습니다.'); return; }
  const btn = document.getElementById('btnSubmitDeal');
  await withSubmitLock('dealSubmit', btn, async () => {
    const brand = document.getElementById('dealBrand').value.trim();
    const title = document.getElementById('dealTitle').value.trim();
    const cat = document.getElementById('dealMainCat').value;
    const sub = document.getElementById('dealSubCat')?.value.trim() || "전체";
    const orig = parseFloat(document.getElementById('dealOrigPrice').value) || 0;
    const disc = parseFloat(document.getElementById('dealDiscPrice').value) || 0;
    const desc = document.getElementById('dealDesc').value.trim();
    const storeUrl = document.getElementById('dealUrl').value.trim();
    const customImg = document.getElementById('dealImgUrl')?.value.trim() || "";
    const ytInput = document.getElementById('dealYoutubeInput')?.value.trim() || "";
    const ytId = extractYoutubeId(ytInput) || "d9W2j2_y4v8";
    const rateNum = orig > 0 ? Math.round(((orig - disc) / orig) * 100) : (disc === 0 ? 100 : 0);
    const rateStr = disc === 0 ? "100% FREE" : `${rateNum}% OFF`;
    const defaults = buildDefaultSeasonalityAndHistory(orig, disc, rateNum);
    const resolvedImgUrl = customImg || `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
    let insertedRowId = null;

    if (supabaseClient) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || !isUserAdmin(session.user)) { alert('관리자 세션이 유효하지 않습니다.'); return; }
      const { data, error } = await supabaseClient.from('deals').insert([{
        brand, title, cat, sub, description: desc, original_price: orig, discount_price: disc,
        store_url: storeUrl, img_url: customImg || null, youtube_id: ytId, days_left: 7,
        seasonality: defaults.seasonality, price_history: defaults.priceHistory, created_by: session.user.id
      }]).select().maybeSingle();
      if (error) { alert('DB 저장 실패: ' + error.message); return; }
      if (data && data.id) insertedRowId = data.id;
    }

    const newDeal = {
      id: insertedRowId ? `db_${insertedRowId}` : (dealsData.length + 1), dbRowId: insertedRowId,
      brand, title, cat, sub, desc, original: orig, discountPrice: disc, discountRateNum: rateNum, discountRate: rateStr,
      storeUrl, daysLeft: 7, imgUrl: resolvedImgUrl, backupImgUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      youtubeId: ytId, ytQuery: `${brand} ${title} official demo`,
      bestSeasonLabel: defaults.bestSeasonLabel, seasonality: defaults.seasonality, priceHistory: defaults.priceHistory
    };
    dealsData.unshift(newDeal);
    resolveLiveYoutubeAndOfficialImage(newDeal);
    updateSavedDealCountBadge();
    renderDeals();
    alert('새로운 딜 정보가 등록되었습니다.');
    e.target.reset();
    showPage('deals');
  });
}

function openReportModal(targetType, targetId, targetTitle) {
  if (!currentUser && supabaseClient) { alert('신고 기능을 이용하려면 로그인이 필요합니다.'); openModal('loginModal'); return; }
  currentReportTarget = { targetType, targetId, targetTitle };
  const summaryEl = document.getElementById('reportTargetSummary');
  if (summaryEl) summaryEl.innerText = `신고 대상 (${targetType === 'comment' ? '댓글' : '게시글'}): ${targetTitle}`;
  document.getElementById('reportForm')?.reset();
  openModal('reportModal');
}

async function handleReportSubmit(e) {
  e.preventDefault();
  if (!currentReportTarget) return;
  const btn = document.getElementById('btnSubmitReport');
  await withSubmitLock('reportSubmit', btn, async () => {
    const reason = document.getElementById('reportReasonSelect').value;
    const detail = document.getElementById('reportDetailInput').value.trim();
    const reporterEmail = currentUser?.email || 'guest@plugazit.com';
    const newReport = {
      id: 'rep_' + Date.now(), targetType: currentReportTarget.targetType, targetId: currentReportTarget.targetId,
      targetTitle: currentReportTarget.targetTitle, postId: currentOpenPostId, reason, detail, reporterEmail,
      created_at: new Date().toISOString()
    };
    if (supabaseClient && currentUser) {
      try {
        await supabaseClient.from('reports').insert([{
          target_type: newReport.targetType, target_id: String(newReport.targetId),
          target_title: newReport.targetTitle, reason: newReport.reason, detail: newReport.detail, reporter_email: newReport.reporterEmail
        }]);
      } catch (err) {}
    }
    const reportList = getLocalReportsList();
    reportList.unshift(newReport);
    saveLocalReportsList(reportList);
    closeModal('reportModal');
    alert('신고가 접수되었습니다.');
  });
}

function openInquiryModal(defaultCategory = '') {
  const form = document.getElementById('inquiryForm');
  if (form) form.reset();
  const catSelect = document.getElementById('inquiryCategory');
  if (catSelect && defaultCategory) catSelect.value = defaultCategory;
  const emailInput = document.getElementById('inquiryReplyEmail');
  if (emailInput && currentUser?.email) emailInput.value = currentUser.email;
  openModal('inquiryModal');
}

async function handleInquirySubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitInquiry');
  await withSubmitLock('inquirySubmit', btn, async () => {
    const category = document.getElementById('inquiryCategory').value;
    const replyEmail = document.getElementById('inquiryReplyEmail').value.trim();
    const title = document.getElementById('inquiryTitle').value.trim();
    const content = document.getElementById('inquiryContent').value.trim();
    if (!replyEmail || !title || !content) return;
    const newInquiry = {
      id: 'inq_' + Date.now(), category, replyEmail, title, content,
      userNickname: originalNickname || currentUser?.user_metadata?.nickname || 'Guest',
      created_at: new Date().toISOString()
    };
    if (supabaseClient) {
      try {
        await supabaseClient.from('inquiries').insert([{
          category: newInquiry.category, reply_email: newInquiry.replyEmail,
          title: newInquiry.title, content: newInquiry.content, user_nickname: newInquiry.userNickname
        }]);
      } catch (err) {}
    }
    const list = getLocalInquiriesList();
    list.unshift(newInquiry);
    saveLocalInquiriesList(list);
    closeModal('inquiryModal');
    alert('관리자에게 1:1 문의가 접수되었습니다.');
  });
}

async function renderAdminDashboard() {
  if (!isUserAdmin(currentUser) && supabaseClient) return;
  await fetchCommunityPosts();

  const reportsEl = document.getElementById('adminReportsList');
  const inquiriesEl = document.getElementById('adminInquiriesList');
  const allPostsEl = document.getElementById('adminAllPostsList');
  const allCommentsEl = document.getElementById('adminAllCommentsList');
  let reports = getLocalReportsList();
  let inquiries = getLocalInquiriesList();

  if (supabaseClient) {
    try {
      const { data: dbReports } = await supabaseClient.from('reports').select('*').order('created_at', { ascending: false });
      if (dbReports) {
        const seen = new Set(reports.map(r => String(r.id)));
        dbReports.forEach(r => {
          const key = 'db_rep_' + r.id;
          if (!seen.has(key)) reports.push({ id: key, targetType: r.target_type || 'post', targetId: r.target_id, targetTitle: r.target_title || '', reason: r.reason || '', detail: r.detail || '', reporterEmail: r.reporter_email || '', created_at: r.created_at });
        });
      }
    } catch (e) {}
    try {
      const { data: dbInq } = await supabaseClient.from('inquiries').select('*').order('created_at', { ascending: false });
      if (dbInq) {
        const seen = new Set(inquiries.map(i => String(i.id)));
        dbInq.forEach(i => {
          const key = 'db_inq_' + i.id;
          if (!seen.has(key)) inquiries.push({ id: key, category: i.category || '문의', replyEmail: i.reply_email || '', title: i.title || '', content: i.content || '', userNickname: i.user_nickname || '', created_at: i.created_at });
        });
      }
    } catch (e) {}
  }

  const repCountEl = document.getElementById('adminReportCount');
  const inqCountEl = document.getElementById('adminInquiryCount');
  if (repCountEl) repCountEl.innerText = reports.length;
  if (inqCountEl) inqCountEl.innerText = inquiries.length;

  if (reportsEl) {
    reportsEl.innerHTML = reports.length === 0
      ? `<div style="padding:1.2rem; text-align:center; color:var(--text-secondary); font-size:0.84rem;">접수된 신고 내역이 없습니다.</div>`
      : reports.map(r => {
          const safeTargetId = typeof r.targetId === 'string' ? `'${r.targetId}'` : r.targetId;
          const safePostId = typeof r.postId === 'string' ? `'${r.postId}'` : (r.postId || safeTargetId);
          return `<div class="admin-ticket-card"><div class="admin-ticket-top"><span class="tag-badge" style="background:rgba(231,76,60,0.18); color:#e74c3c;">[${r.targetType === 'comment' ? '댓글' : '게시글'}] ${escapeHtml(r.reason)}</span><span style="font-size:0.74rem; color:var(--text-secondary);">${escapeHtml(new Date(r.created_at).toLocaleDateString('ko-KR'))}</span></div><div style="font-size:0.88rem; font-weight:600; margin:0.35rem 0;">대상: ${escapeHtml(r.targetTitle)}</div>${r.detail ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;">상세: ${escapeHtml(r.detail)}</div>` : ''}<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.5rem;">${r.targetType === 'post' ? `<button type="button" class="nav-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="openPostDetail(${safeTargetId})">글 보기</button><button type="button" class="nav-btn danger-outline-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="adminForceDeletePost(${safeTargetId}, '${escapeHtml(r.id)}')">게시글 삭제</button>` : `<button type="button" class="nav-btn danger-outline-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="adminForceDeleteComment(${safePostId}, ${safeTargetId}, '${escapeHtml(r.id)}')">댓글 삭제</button>`}<button type="button" class="nav-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="resolveAdminReport('${escapeHtml(r.id)}')">처리 완료</button></div></div>`;
        }).join('');
  }

  if (inquiriesEl) {
    inquiriesEl.innerHTML = inquiries.length === 0
      ? `<div style="padding:1.2rem; text-align:center; color:var(--text-secondary); font-size:0.84rem;">접수된 문의 내역이 없습니다.</div>`
      : inquiries.map(inq => `<div class="admin-ticket-card"><div class="admin-ticket-top"><span class="tag-badge tag-discount">${escapeHtml(inq.category)}</span><span style="font-size:0.74rem; color:var(--text-secondary);">${escapeHtml(new Date(inq.created_at).toLocaleDateString('ko-KR'))}</span></div><div style="font-size:0.9rem; font-weight:600; margin:0.35rem 0;">${escapeHtml(inq.title)}</div><div style="font-size:0.82rem; color:var(--text-primary); white-space:pre-wrap; margin-bottom:0.5rem;">${escapeHtml(inq.content)}</div><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;"><span style="font-size:0.75rem; color:var(--accent-gold); font-weight:600;">${escapeHtml(inq.replyEmail)} (${escapeHtml(inq.userNickname)})</span><div style="display:flex; gap:0.4rem;"><a href="mailto:${escapeHtml(inq.replyEmail)}?subject=${encodeURIComponent('[PlugAzit 답변] ' + inq.title)}" class="nav-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem; text-decoration:none;">메일 답장</a><button type="button" class="nav-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="resolveAdminInquiry('${escapeHtml(inq.id)}')">답변 완료</button></div></div></div>`).join('');
  }

  const deletedPostIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  const activePosts = rawCommunityPosts.filter(p => !deletedPostIds.includes(String(p.id)));
  const allPostsCountEl = document.getElementById('adminAllPostsCount');
  if (allPostsCountEl) allPostsCountEl.innerText = activePosts.length;
  if (allPostsEl) {
    allPostsEl.innerHTML = activePosts.length === 0
      ? `<div style="padding:1.2rem; text-align:center; color:var(--text-secondary); font-size:0.84rem;">등록된 게시글이 없습니다.</div>`
      : activePosts.map(p => {
          const stats = getPostStats(p);
          const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
          return `<div class="admin-ticket-card" style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem;"><div style="overflow:hidden;"><div style="font-size:0.74rem; color:var(--accent-gold); font-weight:600;">[${escapeHtml(stats.editedCategory || p.category)}] ${escapeHtml(p.author_nickname)}</div><div style="font-size:0.86rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(stats.editedTitle || p.title)}</div></div><div style="display:flex; gap:0.35rem; flex-shrink:0;"><button type="button" class="nav-btn" style="padding:0.25rem 0.6rem; font-size:0.74rem;" onclick="openPostDetail(${safeId})">열람</button><button type="button" class="nav-btn danger-outline-btn" style="padding:0.25rem 0.6rem; font-size:0.74rem;" onclick="adminForceDeletePost(${safeId})">삭제</button></div></div>`;
        }).join('');
  }

  const allComments = [];
  const seenCommentKeys = new Set();
  const localMap = getLocalCommentsMap();
  [postCommentsCache, localMap].forEach(sourceMap => {
    Object.keys(sourceMap).forEach(pid => {
      (sourceMap[pid] || []).forEach(c => {
        const k = String(c.id || c.created_at);
        if (!seenCommentKeys.has(k)) { seenCommentKeys.add(k); allComments.push({ ...c, _postId: pid }); }
      });
    });
  });

  const allCommentsCountEl = document.getElementById('adminAllCommentsCount');
  if (allCommentsCountEl) allCommentsCountEl.innerText = allComments.length;
  if (allCommentsEl) {
    allCommentsEl.innerHTML = allComments.length === 0
      ? `<div style="padding:1.2rem; text-align:center; color:var(--text-secondary); font-size:0.84rem;">등록된 댓글이 없습니다.</div>`
      : allComments.map(c => {
          const safeCid = typeof c.id === 'string' ? `'${c.id}'` : c.id;
          const safePid = typeof c._postId === 'string' ? `'${c._postId}'` : c._postId;
          return `<div class="admin-ticket-card" style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem;"><div style="overflow:hidden;"><div style="font-size:0.74rem; color:var(--accent-gold); font-weight:600;">${escapeHtml(c.author_nickname)}</div><div style="font-size:0.84rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.content)}</div></div><div style="display:flex; gap:0.35rem; flex-shrink:0;"><button type="button" class="nav-btn" style="padding:0.25rem 0.6rem; font-size:0.74rem;" onclick="openPostDetail(${safePid})">원문</button><button type="button" class="nav-btn danger-outline-btn" style="padding:0.25rem 0.6rem; font-size:0.74rem;" onclick="adminForceDeleteComment(${safePid}, ${safeCid})">삭제</button></div></div>`;
        }).join('');
  }
}

async function adminForceDeletePost(postId, reportId = null) {
  await deletePost(postId);
  if (reportId) resolveAdminReport(reportId);
  showPage('admin');
}

async function adminForceDeleteComment(postId, commentId, reportId = null) {
  await deleteCommentItem(postId, commentId);
  if (reportId) resolveAdminReport(reportId);
  renderAdminDashboard();
}

function resolveAdminReport(reportId) {
  saveLocalReportsList(getLocalReportsList().filter(r => String(r.id) !== String(reportId)));
  renderAdminDashboard();
}

function resolveAdminInquiry(inquiryId) {
  saveLocalInquiriesList(getLocalInquiriesList().filter(i => String(i.id) !== String(inquiryId)));
  renderAdminDashboard();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const savedTheme = localStorage.getItem('plugazit_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.setAttribute('data-theme', savedTheme);
    const savedDaw = localStorage.getItem('plugazit_user_daw');
    if (savedDaw) currentUserDaw = savedDaw;
  } catch (e) {}

  setupEnhancedEditorAndEffects();
  renderSubCategories();
  updateSavedDealCountBadge();
  updateScrappedPostCountBadge();
  renderDeals();
  await checkUserSession();
  await fetchDealsFromSupabase();
  dealsData.forEach(d => resolveLiveYoutubeAndOfficialImage(d));
});