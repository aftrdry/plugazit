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
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '#';
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
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  safe = safe.replace(/\[밑줄\]([\s\S]+?)\[\/밑줄\]/g, '<u>$1</u>');
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
      return `<div class="inline-media-box"><div style="font-size:0.78rem; color:var(--accent-gold); font-weight:700;">오디오 트랙 미리듣기</div><audio controls preload="metadata" src="${url}"></audio></div>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-gold); text-decoration:underline; font-weight:700;">[${label} 열기]</a>`;
  });
  return safe;
}
const activeLocks = new Set();
async function withSubmitLock(lockKey, btnEl, asyncFn) {
  if (activeLocks.has(lockKey)) return;
  activeLocks.add(lockKey);
  const origText = btnEl ? btnEl.innerText : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerText = '처리 중...';
  }
  try {
    await asyncFn();
  } finally {
    activeLocks.delete(lockKey);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerText = origText;
    }
  }
}
const DELETED_POSTS_STORAGE_KEY = 'plugazit_deleted_post_ids_v1';
const DELETED_DEALS_STORAGE_KEY = 'plugazit_deleted_deal_ids_v1';
const SAVED_DEALS_STORAGE_KEY = 'plugazit_saved_deal_ids_v1';
const POST_META_STORAGE_KEY = 'plugazit_post_meta_v1';
const LOCAL_COMMENTS_STORAGE_KEY = 'plugazit_local_comments_v1';
function getDeletedIds(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function markIdAsDeleted(storageKey, id) {
  try {
    const list = getDeletedIds(storageKey);
    const strId = String(id);
    if (!list.includes(strId)) {
      list.push(strId);
      localStorage.setItem(storageKey, JSON.stringify(list));
    }
  } catch (e) {}
}
function getSavedDealIds() {
  return getDeletedIds(SAVED_DEALS_STORAGE_KEY);
}
function toggleSaveDeal(dealId, event) {
  if (event) event.stopPropagation();
  try {
    const list = getSavedDealIds();
    const strId = String(dealId);
    const idx = list.indexOf(strId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(strId);
    }
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
function getPostMetaMap() {
  try {
    const raw = localStorage.getItem(POST_META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function savePostMetaMap(map) {
  try {
    localStorage.setItem(POST_META_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}
function getPostStats(post) {
  const map = getPostMetaMap();
  const meta = map[String(post.id)] || {};
  const views = (Number(post.views) || 0) + (Number(meta.extraViews) || 0);
  const likes = (Number(post.likes_count) || 0) + (Number(meta.extraLikes) || 0);
  const voted = Boolean(meta.voted);
  const daw = post.author_daw || meta.daw || '';
  const pluginTag = post.plugin_tag || meta.pluginTag || '';
  const editedTitle = meta.editedTitle;
  const editedContent = meta.editedContent;
  const editedCategory = meta.editedCategory;
  return { views, likes, voted, daw, pluginTag, editedTitle, editedContent, editedCategory };
}
function getLocalCommentsMap() {
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveLocalCommentsMap(map) {
  try {
    localStorage.setItem(LOCAL_COMMENTS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btnEl.innerText = '숨기기';
  } else {
    input.type = 'password';
    btnEl.innerText = '보기';
  }
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
  if (page === 'community') {
    fetchCommunityPosts();
  } else if (page === 'mypage') {
    initMyPageData();
  }
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
  if (event.target.id === modalId) {
    closeModal(modalId);
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
});
function openLegalModal(tabType) {
  switchLegalTab(tabType || 'terms');
  openModal('termsModal');
}
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
  if (mode === 'list') { container.classList.add('list-mode'); }
  else { container.classList.remove('list-mode'); }
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
/* 
 * 404/웹오버뷰 문제를 일으키던 api.microlink.io 스크린샷을 완전 퇴출하고,
 * 각 제조사의 실제 공식 플러그인 UI 화면(YouTube Official HD CDN)과 정확한 공식 데모 영상을 직결함
 */
const dealsData = [
  {
    id: 1,
    brand: "FabFilter",
    title: "Pro-Q 3 Equalizer",
    cat: "mixing",
    sub: "EQ",
    desc: "다이나믹 EQ, 리니어 페이즈 및 트랙 간 주파수 마스킹 확인 기능을 갖춘 업계 표준 이퀄라이저입니다.",
    original: 179,
    discountPrice: 134,
    discountRateNum: 25,
    discountRate: "25% OFF",
    storeUrl: "https://www.fabfilter.com/products/pro-q-3-equalizer-plug-in",
    daysLeft: 5,
    imgUrl: "https://i.ytimg.com/vi/d9W2j2_y4v8/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/d9W2j2_y4v8/hqdefault.jpg",
    youtubeId: "d9W2j2_y4v8",
    ytQuery: "FabFilter Pro-Q 3 Equalizer Official Introduction",
    bestSeasonLabel: "Summer (7월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "정가 유지" },
      { name: "Summer (7~8월)", avgOff: 25, note: "연례 정기 세일" },
      { name: "Black Friday (11월)", avgOff: 25, note: "최대 할인 시즌" },
      { name: "Year-End (12월)", avgOff: 0, note: "정가 유지" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular Price", price: 179 },
      { date: "2023.07", season: "Summer Sale", price: 134 },
      { date: "2023.11", season: "Black Friday", price: 134 },
      { date: "2024.04", season: "Anniversary Sale", price: 125 },
      { date: "2024.08", season: "Regular Price", price: 179 },
      { date: "2024.11", season: "Black Friday", price: 134 },
      { date: "2025.03", season: "Regular Price", price: 179 },
      { date: "2025.07", season: "Summer Sale", price: 134 },
      { date: "2025.11", season: "Black Friday", price: 134 },
      { date: "2026.02", season: "Regular Price", price: 179 },
      { date: "2026.11", season: "Current Deal", price: 134 }
    ]
  },
  {
    id: 2,
    brand: "oeksound",
    title: "soothe2 Resonance Suppressor",
    cat: "mixing",
    sub: "De-Esser/Dynamic",
    desc: "보컬과 악기 트랙의 거친 공명(Resonance) 및 치찰음을 실시간으로 자동 감지해 부드럽게 억제하는 프로세서입니다.",
    original: 219,
    discountPrice: 149,
    discountRateNum: 32,
    discountRate: "32% OFF",
    storeUrl: "https://oeksound.com/plugins/soothe2/",
    daysLeft: 2,
    imgUrl: "https://i.ytimg.com/vi/7_M2jbM_L1k/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/7_M2jbM_L1k/hqdefault.jpg",
    youtubeId: "7_M2jbM_L1k",
    ytQuery: "oeksound soothe2 resonance suppressor walkthrough",
    bestSeasonLabel: "Easter (4월) / Black Friday (11월)",
    seasonality: [
      { name: "Easter (3~4월)", avgOff: 27, note: "$159 프로모션" },
      { name: "Summer (6~8월)", avgOff: 0, note: "정가 유지" },
      { name: "Black Friday (11월)", avgOff: 32, note: "연중 최저가 ($139~$149)" },
      { name: "Year-End (12월)", avgOff: 0, note: "정가 유지" }
    ],
    priceHistory: [
      { date: "2023.04", season: "Easter Sale", price: 159 },
      { date: "2023.08", season: "Regular Price", price: 219 },
      { date: "2023.11", season: "Black Friday", price: 139 },
      { date: "2024.03", season: "Easter Sale", price: 159 },
      { date: "2024.07", season: "Regular Price", price: 219 },
      { date: "2024.11", season: "Black Friday", price: 139 },
      { date: "2025.04", season: "Spring Sale", price: 159 },
      { date: "2025.08", season: "Regular Price", price: 219 },
      { date: "2025.11", season: "Black Friday", price: 149 },
      { date: "2026.04", season: "Easter Sale", price: 159 },
      { date: "2026.11", season: "Current Deal", price: 149 }
    ]
  },
  {
    id: 3,
    brand: "Soundtoys",
    title: "Soundtoys 5.4 Bundle",
    cat: "fx",
    sub: "Modulation",
    desc: "Decapitator, EchoBoy, Little AlterBoy 등 아날로그 질감의 핵심 이펙터 22종과 Effect Rack을 모두 포함한 통합 번들입니다.",
    original: 499,
    discountPrice: 249,
    discountRateNum: 50,
    discountRate: "50% OFF",
    storeUrl: "https://www.soundtoys.com/product/soundtoys-5/",
    daysLeft: 12,
    imgUrl: "https://i.ytimg.com/vi/M6T7obN3aB0/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/M6T7obN3aB0/hqdefault.jpg",
    youtubeId: "M6T7obN3aB0",
    ytQuery: "Soundtoys 5 Bundle Effect Rack Demo",
    bestSeasonLabel: "Black Friday (11월) / Holiday (12월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 40, note: "$299 세일" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$249 세일" },
      { name: "Black Friday (11월)", avgOff: 54, note: "최저가 구간 ($229~$249)" },
      { name: "Year-End (12월)", avgOff: 50, note: "$249 홀리데이 딜" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Spring Sale", price: 299 },
      { date: "2023.07", season: "Summer Sale", price: 249 },
      { date: "2023.11", season: "Black Friday", price: 229 },
      { date: "2024.04", season: "Spring Sale", price: 299 },
      { date: "2024.08", season: "Regular Price", price: 499 },
      { date: "2024.11", season: "Black Friday", price: 229 },
      { date: "2025.03", season: "Spring Sale", price: 269 },
      { date: "2025.07", season: "Summer Sale", price: 249 },
      { date: "2025.11", season: "Black Friday", price: 229 },
      { date: "2026.05", season: "Regular Price", price: 499 },
      { date: "2026.11", season: "Current Deal", price: 249 }
    ]
  },
  {
    id: 4,
    brand: "Universal Audio",
    title: "UAD Spark 1 Year Pass",
    cat: "mixing",
    sub: "Compressor/Limiter",
    desc: "별도 DSP 하드웨어 없이 LA-2A, 1176, Neve 1073 등 UA의 대표적인 아날로그 복각 플러그인을 네이티브로 사용하는 연간 패스입니다.",
    original: 199,
    discountPrice: 99,
    discountRateNum: 50,
    discountRate: "50% OFF",
    storeUrl: "https://spark.uaudio.com/",
    daysLeft: 1,
    imgUrl: "https://i.ytimg.com/vi/bN2N9M1B8iE/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/bN2N9M1B8iE/hqdefault.jpg",
    youtubeId: "bN2N9M1B8iE",
    ytQuery: "Universal Audio UAD Spark Native Plugins Demo",
    bestSeasonLabel: "Half-Year (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 30, note: "$139 프로모션" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$99 반값 세일" },
      { name: "Black Friday (11월)", avgOff: 50, note: "$99 연간권 최저가" },
      { name: "Year-End (12월)", avgOff: 50, note: "$99 연장 세일" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular Price", price: 199 },
      { date: "2023.06", season: "Half-Yearly Sale", price: 99 },
      { date: "2023.11", season: "Black Friday", price: 99 },
      { date: "2024.03", season: "Spring Promo", price: 139 },
      { date: "2024.07", season: "Summer Sale", price: 99 },
      { date: "2024.11", season: "Black Friday", price: 99 },
      { date: "2025.04", season: "Regular Price", price: 199 },
      { date: "2025.06", season: "Summer Sale", price: 99 },
      { date: "2025.11", season: "Black Friday", price: 99 },
      { date: "2026.04", season: "Spring Promo", price: 129 },
      { date: "2026.11", season: "Current Deal", price: 99 }
    ]
  },
  {
    id: 5,
    brand: "Arturia",
    title: "Analog Lab Play",
    cat: "free",
    sub: "Free Synths",
    desc: "Arturia V Collection과 Pigments에서 엄선된 100가지 빈티지 신스 및 건반 프리셋을 무료로 제공하는 가상악기입니다.",
    original: 99,
    discountPrice: 0,
    discountRateNum: 100,
    discountRate: "100% FREE",
    storeUrl: "https://www.arturia.com/products/software-instruments/analoglab-v/overview",
    daysLeft: 99,
    imgUrl: "https://i.ytimg.com/vi/k_fM1v2t-64/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/k_fM1v2t-64/hqdefault.jpg",
    youtubeId: "k_fM1v2t-64",
    ytQuery: "Arturia Analog Lab Play Overview Tutorial",
    bestSeasonLabel: "상시 무료 배포 (Perpetual Free)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 100, note: "상시 무료" },
      { name: "Summer (6~7월)", avgOff: 100, note: "상시 무료" },
      { name: "Black Friday (11월)", avgOff: 100, note: "상시 무료" },
      { name: "Year-End (12월)", avgOff: 100, note: "상시 무료" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Intro Edition", price: 99 },
      { date: "2023.07", season: "Summer Promo", price: 49 },
      { date: "2023.11", season: "Play Launch (Free)", price: 0 },
      { date: "2024.04", season: "Free Edition", price: 0 },
      { date: "2024.11", season: "Free Edition", price: 0 },
      { date: "2025.06", season: "Free Edition", price: 0 },
      { date: "2025.11", season: "Free Edition", price: 0 },
      { date: "2026.05", season: "Free Edition", price: 0 },
      { date: "2026.11", season: "Current Deal", price: 0 }
    ]
  },
  {
    id: 6,
    brand: "Native Instruments",
    title: "Komplete 14 Standard",
    cat: "synth",
    sub: "Sample Library",
    desc: "Kontakt 7, Massive X 등 80여 종의 가상악기·이펙트와 Expansion 사운드 팩이 수록된 올라운드 프로덕션 번들입니다.",
    original: 599,
    discountPrice: 299,
    discountRateNum: 50,
    discountRate: "50% OFF",
    storeUrl: "https://www.native-instruments.com/en/catalog/komplete/",
    daysLeft: 4,
    imgUrl: "https://i.ytimg.com/vi/B7B5mK1eR7c/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/B7B5mK1eR7c/hqdefault.jpg",
    youtubeId: "B7B5mK1eR7c",
    ytQuery: "Native Instruments Komplete 14 Standard Overview",
    bestSeasonLabel: "Summer of Sound (6월) / Cyber Season (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "정가 유지" },
      { name: "Summer of Sound (6월)", avgOff: 50, note: "$299 반값 세일" },
      { name: "Cyber Season (11월)", avgOff: 50, note: "$299 반값 세일" },
      { name: "Year-End (12월)", avgOff: 50, note: "연말 연장 프로모션" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular Price", price: 599 },
      { date: "2023.06", season: "Summer of Sound", price: 299 },
      { date: "2023.11", season: "Cyber Season", price: 299 },
      { date: "2024.03", season: "Regular Price", price: 599 },
      { date: "2024.06", season: "Summer of Sound", price: 299 },
      { date: "2024.11", season: "Cyber Season", price: 299 },
      { date: "2025.03", season: "Regular Price", price: 599 },
      { date: "2025.06", season: "Summer of Sound", price: 299 },
      { date: "2025.11", season: "Cyber Season", price: 299 },
      { date: "2026.04", season: "Regular Price", price: 599 },
      { date: "2026.11", season: "Current Deal", price: 299 }
    ]
  },
  {
    id: 7,
    brand: "iZotope",
    title: "Ozone 11 Advanced",
    cat: "mixing",
    sub: "Mastering Chain",
    desc: "Clarity 모듈, Stem Focus 및 AI Master Assistant를 통해 음압 확보와 톤 밸런스를 완성하는 통합 마스터링 스위트입니다.",
    original: 399,
    discountPrice: 199,
    discountRateNum: 50,
    discountRate: "50% OFF",
    storeUrl: "https://www.izotope.com/en/products/ozone.html",
    daysLeft: 7,
    imgUrl: "https://i.ytimg.com/vi/wG7gV6tP4pA/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/wG7gV6tP4pA/hqdefault.jpg",
    youtubeId: "wG7gV6tP4pA",
    ytQuery: "iZotope Ozone 11 Mastering Overview",
    bestSeasonLabel: "Summer (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 30, note: "$279 세일" },
      { name: "Summer (6~7월)", avgOff: 50, note: "$199 반값 세일" },
      { name: "Black Friday (11월)", avgOff: 55, note: "$179~$199 최저가" },
      { name: "Year-End (12월)", avgOff: 50, note: "$199 홀리데이 세일" }
    ],
    priceHistory: [
      { date: "2023.09", season: "Ozone 11 Launch", price: 299 },
      { date: "2023.11", season: "Black Friday", price: 199 },
      { date: "2024.03", season: "Spring Sale", price: 279 },
      { date: "2024.06", season: "Summer Sale", price: 199 },
      { date: "2024.11", season: "Black Friday", price: 179 },
      { date: "2025.03", season: "Regular Price", price: 399 },
      { date: "2025.07", season: "Summer Sale", price: 199 },
      { date: "2025.11", season: "Black Friday", price: 199 },
      { date: "2026.05", season: "Regular Price", price: 399 },
      { date: "2026.11", season: "Current Deal", price: 199 }
    ]
  },
  {
    id: 8,
    brand: "Xfer Records",
    title: "Serum VST Synth",
    cat: "synth",
    sub: "Analog/Synth",
    desc: "직관적인 파형 편집과 드래그 앤 드롭 모듈레이션 워크플로우를 갖춘 대표적인 웨이브테이블 신디사이저입니다.",
    original: 189,
    discountPrice: 149,
    discountRateNum: 21,
    discountRate: "21% OFF",
    storeUrl: "https://xferrecords.com/products/serum",
    daysLeft: 15,
    imgUrl: "https://i.ytimg.com/vi/5Sa3wa_doG0/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/5Sa3wa_doG0/hqdefault.jpg",
    youtubeId: "5Sa3wa_doG0",
    ytQuery: "Xfer Records Serum Synth Walkthrough",
    bestSeasonLabel: "제휴 바우처 / 번들 프로모션 시점",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 0, note: "공식 노세일 정책" },
      { name: "Summer (6~7월)", avgOff: 0, note: "공식 노세일 정책" },
      { name: "Black Friday (11월)", avgOff: 15, note: "리셀러 쿠폰/제휴 할인" },
      { name: "Year-End (12월)", avgOff: 21, note: "특별 프로모션 딜" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular Price", price: 189 },
      { date: "2023.11", season: "Regular Price", price: 189 },
      { date: "2024.06", season: "Regular Price", price: 189 },
      { date: "2024.11", season: "Partner Voucher", price: 169 },
      { date: "2025.04", season: "Regular Price", price: 189 },
      { date: "2025.11", season: "Partner Promo", price: 159 },
      { date: "2026.05", season: "Regular Price", price: 189 },
      { date: "2026.11", season: "Current Deal", price: 149 }
    ]
  },
  {
    id: 9,
    brand: "Celemony",
    title: "Melodyne 5 assistant",
    cat: "fx",
    sub: "Pitch/Vocal",
    desc: "보컬의 음정, 박자, 비브라토 및 치찰음을 음질 저하 없이 자연스럽게 다듬는 업계 표준 피치 보정 툴입니다.",
    original: 249,
    discountPrice: 149,
    discountRateNum: 40,
    discountRate: "40% OFF",
    storeUrl: "https://www.celemony.com/en/melodyne/what-is-melodyne",
    daysLeft: 3,
    imgUrl: "https://i.ytimg.com/vi/P2tK3P3qB2c/maxresdefault.jpg",
    backupImgUrl: "https://i.ytimg.com/vi/P2tK3P3qB2c/hqdefault.jpg",
    youtubeId: "P2tK3P3qB2c",
    ytQuery: "Celemony Melodyne 5 Vocal Pitch Editing",
    bestSeasonLabel: "Summer (6월) / Black Friday (11월)",
    seasonality: [
      { name: "Spring (3~4월)", avgOff: 20, note: "$199 세일" },
      { name: "Summer (6~7월)", avgOff: 40, note: "$149 정기 할인" },
      { name: "Black Friday (11월)", avgOff: 60, note: "$99~$149 최저가 구간" },
      { name: "Year-End (12월)", avgOff: 40, note: "$149 연말 프로모션" }
    ],
    priceHistory: [
      { date: "2023.03", season: "Regular Price", price: 249 },
      { date: "2023.07", season: "Summer Sale", price: 149 },
      { date: "2023.11", season: "Black Friday", price: 99 },
      { date: "2024.04", season: "Spring Sale", price: 199 },
      { date: "2024.08", season: "Regular Price", price: 249 },
      { date: "2024.11", season: "Black Friday", price: 99 },
      { date: "2025.05", season: "Regular Price", price: 249 },
      { date: "2025.07", season: "Summer Sale", price: 149 },
      { date: "2025.11", season: "Black Friday", price: 129 },
      { date: "2026.04", season: "Regular Price", price: 249 },
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
      { date: "2025.05", season: "Regular Price", price: orig || disc },
      { date: "2025.11", season: "Black Friday", price: disc },
      { date: "2026.05", season: "Regular Price", price: orig || disc },
      { date: "2026.11", season: "Current Deal", price: disc }
    ]
  };
}
async function fetchDealsFromSupabase() {
  if (!supabaseClient) return;
  const deletedDealIds = getDeletedIds(DELETED_DEALS_STORAGE_KEY);
  try {
    const { data, error } = await supabaseClient
      .from('deals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return;
    data.forEach(row => {
      const dbDealId = `db_${row.id}`;
      if (deletedDealIds.includes(dbDealId)) return;
      if (dealsData.some(d => String(d.id) === dbDealId)) return;
      const orig = Number(row.original_price) || 0;
      const disc = Number(row.discount_price) || 0;
      const rateNum = orig > 0 ? Math.round(((orig - disc) / orig) * 100) : (disc === 0 ? 100 : 0);
      const rateStr = disc === 0 ? "100% FREE" : `${rateNum}% OFF`;
      const storeUrl = row.store_url || "https://plugazit.com";
      const ytId = row.youtube_id || "d9W2j2_y4v8";
      const defaults = buildDefaultSeasonalityAndHistory(orig, disc, rateNum);
      const mappedDeal = {
        id: dbDealId,
        dbRowId: row.id,
        brand: row.brand || "Brand",
        title: row.title || "Plugin Deal",
        cat: row.cat || "mixing",
        sub: row.sub || "전체",
        desc: row.description || "",
        original: orig,
        discountPrice: disc,
        discountRateNum: rateNum,
        discountRate: rateStr,
        storeUrl: storeUrl,
        daysLeft: row.days_left || 7,
        imgUrl: row.img_url || `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
        backupImgUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        youtubeId: ytId,
        ytQuery: `${row.brand || ''} ${row.title || ''} official demo`,
        bestSeasonLabel: defaults.bestSeasonLabel,
        seasonality: row.seasonality || defaults.seasonality,
        priceHistory: row.price_history || defaults.priceHistory
      };
      dealsData.unshift(mappedDeal);
      resolveLiveYoutubeAndOfficialImage(mappedDeal);
    });
    updateSavedDealCountBadge();
    renderDeals();
  } catch (err) {
    console.error(err);
  }
}
const PIPED_SEARCH_ENDPOINTS = [
  "https://pipedapi.kavin.rocks/search?filter=videos&q=",
  "https://api.piped.private.coffee/search?filter=videos&q=",
  "https://pipedapi.tokhmi.xyz/search?filter=videos&q="
];
/* 
 * 웹사이트 전체 오버뷰(스크린샷)나 404를 가져오던 Microlink 호출을 제거하고,
 * 유튜브 공식 영상 ID 및 고화질 썸네일만 안전하게 보강함
 */
async function resolveLiveYoutubeAndOfficialImage(deal) {
  const query = encodeURIComponent(deal.ytQuery || `${deal.brand} ${deal.title}`);
  for (const endpoint of PIPED_SEARCH_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}${query}`);
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.items || [];
      const firstValid = items.find(item => item.url && item.url.includes('v='));
      if (firstValid) {
        const vidMatch = firstValid.url.match(/v=([a-zA-Z0-9_-]{11})/);
        if (vidMatch && vidMatch[1]) {
          deal.youtubeId = vidMatch[1];
          const hdThumb = `https://i.ytimg.com/vi/${deal.youtubeId}/maxresdefault.jpg`;
          const hqThumb = `https://i.ytimg.com/vi/${deal.youtubeId}/hqdefault.jpg`;
          deal.imgUrl = hdThumb;
          deal.backupImgUrl = hqThumb;
          updateDealDomImages(deal.id, hdThumb);
          if (String(currentOpenDealId) === String(deal.id)) {
            const iframe = document.getElementById('dealModalYoutubeIframe');
            if (iframe) {
              iframe.src = `https://www.youtube.com/embed/${deal.youtubeId}?rel=0&modestbranding=1`;
            }
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
  subBar.innerHTML = subs.map(s => `
    <button type="button" class="sub-chip ${s === currentSubCat ? 'active' : ''}" onclick="setSubCategory('${s}', this)">${escapeHtml(s)}</button>
  `).join('');
}
function setSubCategory(sub, el) {
  document.querySelectorAll('.sub-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentSubCat = sub;
  renderDeals();
}
function onDealFilterChange() { renderDeals(); }
/* 유튜브 maxresdefault가 없는 영상(120px 더미)일 경우 즉시 hqdefault 고화질 썸네일로 자동 전환 */
function verifyImageNotDummy(imgEl, dealId) {
  if (imgEl.naturalWidth > 0 && imgEl.naturalWidth <= 120) {
    handleImgError(imgEl, dealId);
  }
}
function handleImgError(imgEl, dealId) {
  const deal = dealsData.find(d => String(d.id) === String(dealId));
  const step = parseInt(imgEl.dataset.fallbackStep || '0', 10);
  if (deal && step === 0 && deal.backupImgUrl && imgEl.src !== deal.backupImgUrl) {
    imgEl.dataset.fallbackStep = '1';
    imgEl.src = deal.backupImgUrl;
    return;
  }
  if (deal && step <= 1 && deal.youtubeId) {
    imgEl.dataset.fallbackStep = '2';
    imgEl.src = `https://i.ytimg.com/vi/${deal.youtubeId}/hqdefault.jpg`;
    return;
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
    if (currentMainCat === 'free') {
      filtered = filtered.filter(d => d.discountPrice === 0);
    } else if (currentMainCat === 'saved') {
      filtered = filtered.filter(d => savedDealIds.includes(String(d.id)));
    } else {
      filtered = filtered.filter(d => d.cat === currentMainCat);
    }
  }
  if (currentSubCat !== '전체' && currentSubCat !== '전체 보기') {
    filtered = filtered.filter(d => d.sub === currentSubCat);
  }
  if (searchKeyword !== '') {
    filtered = filtered.filter(d => 
      d.brand.toLowerCase().includes(searchKeyword) ||
      d.title.toLowerCase().includes(searchKeyword) ||
      d.desc.toLowerCase().includes(searchKeyword)
    );
  }
  if (sortOption === 'priceLow') { filtered.sort((a, b) => a.discountPrice - b.discountPrice); }
  else if (sortOption === 'priceHigh') { filtered.sort((a, b) => b.discountPrice - a.discountPrice); }
  else if (sortOption === 'discountHigh') { filtered.sort((a, b) => b.discountRateNum - a.discountRateNum); }
  else if (sortOption === 'endingSoon') { filtered.sort((a, b) => a.daysLeft - b.daysLeft); }
  if (filtered.length === 0) {
    const emptyMsg = currentMainCat === 'saved'
      ? '관심 딜로 저장한 플러그인이 없습니다. 각 카드 우측 상단의 [+ 관심 등록] 버튼을 눌러 추가해 보세요.'
      : '검색 조건에 해당되는 VST 딜 정보가 없습니다.';
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
          <div class="plugin-ui-fallback" style="display:none;">
            ${escapeHtml(d.brand)}
            <span>${escapeHtml(d.title)}</span>
          </div>
          <img 
            data-deal-img-id="${escapeHtml(d.id)}"
            src="${escapeHtml(d.imgUrl)}" 
            alt="${escapeHtml(d.title)}" 
            referrerpolicy="no-referrer" 
            loading="lazy" 
            onload="verifyImageNotDummy(this, ${safeDealId})"
            onerror="handleImgError(this, ${safeDealId})">
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
              <span class="original-price">${origKrw}</span>
              <span class="discount-price">$${escapeHtml(d.discountPrice)}</span>
              <div class="krw-price">한화 추산: ${krw}</div>
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
    { date: "2025.06", season: "Regular Price", price: deal.original || deal.discountPrice },
    { date: "2025.11", season: "Black Friday", price: deal.discountPrice },
    { date: "2026.11", season: "Current Deal", price: deal.discountPrice }
  ];
  const pointsData = rangeMode === '1y' ? fullHistory.slice(-5) : fullHistory;
  const svgW = 740;
  const svgH = 220;
  const padL = 52;
  const padR = 26;
  const padT = 24;
  const padB = 38;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const prices = pointsData.map(p => p.price);
  const maxVal = Math.max(deal.original || 100, ...prices);
  const topBound = maxVal === 0 ? 100 : Math.ceil(maxVal * 1.1);
  const bottomBound = 0;
  const valSpan = Math.max(1, topBound - bottomBound);
  const getX = (idx) => {
    if (pointsData.length <= 1) return padL + plotW / 2;
    return padL + (idx / (pointsData.length - 1)) * plotW;
  };
  const getY = (val) => {
    return padT + plotH - ((val - bottomBound) / valSpan) * plotH;
  };
  const gridSteps = 4;
  let gridLinesHtml = '';
  for (let i = 0; i <= gridSteps; i++) {
    const gVal = Math.round(bottomBound + (valSpan * i) / gridSteps);
    const gy = getY(gVal).toFixed(1);
    gridLinesHtml += `
      <line x1="${padL}" y1="${gy}" x2="${svgW - padR}" y2="${gy}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="${i === 0 ? 'none' : '3 3'}" />
      <text x="${padL - 10}" y="${Number(gy) + 4}" fill="var(--text-secondary)" font-size="11" font-weight="600" text-anchor="end">$${gVal}</text>
    `;
  }
  const origY = getY(deal.original || 0).toFixed(1);
  const origLineHtml = deal.original > 0 ? `
    <line x1="${padL}" y1="${origY}" x2="${svgW - padR}" y2="${origY}" stroke="var(--text-secondary)" stroke-width="1" stroke-dasharray="6 4" opacity="0.55" />
    <text x="${svgW - padR}" y="${Number(origY) - 6}" fill="var(--text-secondary)" font-size="10" font-weight="700" text-anchor="end">MSRP $${escapeHtml(deal.original)}</text>
  ` : '';
  const coords = pointsData.map((pt, idx) => ({
    x: Number(getX(idx).toFixed(1)),
    y: Number(getY(pt.price).toFixed(1)),
    ...pt
  }));
  const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');
  const areaPath = coords.length > 1
    ? `M ${coords[0].x} ${padT + plotH} L ` + coords.map(c => `${c.x} ${c.y}`).join(' L ') + ` L ${coords[coords.length - 1].x} ${padT + plotH} Z`
    : '';
  const minPriceVal = Math.min(...prices);
  const safeDealId = typeof deal.id === 'string' ? `'${deal.id}'` : deal.id;
  const nodesHtml = coords.map((c, idx) => {
    const isLowest = c.price === minPriceVal;
    const isCurrent = idx === coords.length - 1;
    const dotColor = isCurrent ? 'var(--accent-gold)' : (isLowest ? '#8fa874' : 'var(--text-primary)');
    const offRate = deal.original > 0 ? Math.round(((deal.original - c.price) / deal.original) * 100) : 0;
    const showLabel = pointsData.length <= 6 || idx % 2 === 0 || idx === coords.length - 1;
    return `
      <g>
        ${showLabel ? `<text x="${c.x}" y="${svgH - 10}" fill="var(--text-secondary)" font-size="10.5" font-weight="600" text-anchor="middle">${escapeHtml(c.date)}</text>` : ''}
        <circle 
          class="ph-node-point"
          cx="${c.x}" 
          cy="${c.y}" 
          r="${isCurrent ? 5.5 : 4.5}" 
          fill="${dotColor}" 
          stroke="var(--card-bg)" 
          stroke-width="2"
          onmouseenter="updatePriceChartTooltip(${safeDealId}, '${escapeHtml(c.date)}', '${escapeHtml(c.season)}', ${Number(c.price)}, ${offRate})"
          onclick="updatePriceChartTooltip(${safeDealId}, '${escapeHtml(c.date)}', '${escapeHtml(c.season)}', ${Number(c.price)}, ${offRate})"
        />
      </g>
    `;
  }).join('');
  return `
    <svg class="ph-svg-chart" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="phAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-gold)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--accent-gold)" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      ${gridLinesHtml}
      ${origLineHtml}
      <path d="${areaPath}" fill="url(#phAreaGrad)" />
      <polyline fill="none" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${polylinePoints}" />
      ${nodesHtml}
    </svg>
  `;
}
function switchPriceChartRange(dealId, rangeMode, btnEl) {
  const deal = dealsData.find(d => String(d.id) === String(dealId));
  if (!deal) return;
  document.querySelectorAll('.ph-range-tabs .ph-range-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const container = document.getElementById('phSvgChartContainer');
  if (container) {
    container.innerHTML = buildPriceChartSvg(deal, rangeMode);
  }
}
function updatePriceChartTooltip(dealId, dateStr, seasonStr, priceVal, offRate) {
  const box = document.getElementById('phInteractiveTooltip');
  if (!box) return;
  const krwStr = priceVal === 0 ? "0원 (무료)" : `약 ${(priceVal * USD_TO_KRW).toLocaleString()}원`;
  const rateBadge = offRate > 0 ? `(-${offRate}%)` : '(정가)';
  box.innerHTML = `
    <div>
      <span class="ph-tooltip-date">[${escapeHtml(dateStr)}]</span>
      <span class="ph-tooltip-season">${escapeHtml(seasonStr)}</span>
    </div>
    <div class="ph-tooltip-price">
      $${escapeHtml(priceVal)} <span style="color:var(--accent-gold); font-weight:700; margin-left:0.35rem;">${rateBadge} · ${krwStr}</span>
    </div>
  `;
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
  const allPrices = historyArr.map(h => h.price);
  const allTimeLow = Math.min(...allPrices);
  const allTimeLowEntry = historyArr.find(h => h.price === allTimeLow) || historyArr[historyArr.length - 1];
  const maxDiscountPct = deal.original > 0 ? Math.round(((deal.original - allTimeLow) / deal.original) * 100) : 100;
  let timingEvaluation = "평균 프로모션 가격대";
  if (deal.discountPrice <= allTimeLow) {
    timingEvaluation = "역대 최저가 도달 (매수 적합)";
  } else if (deal.discountPrice <= allTimeLow * 1.1) {
    timingEvaluation = "최저가 근접 구간 (차이 $" + (deal.discountPrice - allTimeLow) + ")";
  }
  const latestPoint = historyArr[historyArr.length - 1];
  const latestOffRate = deal.original > 0 ? Math.round(((deal.original - latestPoint.price) / deal.original) * 100) : 0;
  const latestKrw = latestPoint.price === 0 ? "0원 (무료)" : `약 ${(latestPoint.price * USD_TO_KRW).toLocaleString()}원`;
  const seasonalityList = deal.seasonality || [
    { name: "Spring (3~4월)", avgOff: 20, note: "시즌 프로모션" },
    { name: "Summer (6~7월)", avgOff: deal.discountRateNum, note: "정기 세일" },
    { name: "Black Friday (11월)", avgOff: deal.discountRateNum, note: "연중 최대 세일" },
    { name: "Year-End (12월)", avgOff: deal.discountRateNum, note: "연말 세일" }
  ];
  const seasonalityHtml = seasonalityList.map(s => `
    <div class="ph-season-item">
      <div>
        <div class="ph-season-name">${escapeHtml(s.name)}</div>
        <div class="ph-season-rate">${s.avgOff > 0 ? `평균 ${escapeHtml(s.avgOff)}% OFF` : '할인 없음'}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:0.15rem;">${escapeHtml(s.note)}</div>
      </div>
      <div class="ph-season-bar-track">
        <div class="ph-season-bar-fill" style="width: ${Math.min(100, Number(s.avgOff) || 0)}%;"></div>
      </div>
    </div>
  `).join('');
  const adminDeleteBtnHtml = isUserAdmin(currentUser)
    ? `<button type="button" class="nav-btn danger-outline-btn" style="margin-right:0.6rem; padding:0.35rem 0.8rem; font-size:0.78rem;" onclick="deleteDealItem(${safeDealId})">관리자 딜 삭제</button>`
    : '';
  detailContent.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; padding-right:2rem;">
      <div>
        <span style="color:var(--accent-gold); font-weight:800; text-transform:uppercase; font-size:0.85rem;">${escapeHtml(deal.brand)}</span>
        <h2 style="font-size:2rem; font-weight:900; margin-top:0.2rem; color:var(--text-primary);">${escapeHtml(deal.title)}</h2>
      </div>
      <div style="display:flex; align-items:center;">
        ${adminDeleteBtnHtml}
        <span class="tag-badge tag-discount" style="font-size:0.95rem; padding:0.4rem 0.8rem;">${escapeHtml(deal.discountRate)}</span>
      </div>
    </div>
    <div class="plugin-img-wrapper" style="height:280px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:1.5rem;">
      <div class="plugin-ui-fallback" style="display:none;">${escapeHtml(deal.brand)}<br><span>${escapeHtml(deal.title)}</span></div>
      <img 
        data-deal-img-id="${escapeHtml(deal.id)}"
        src="${escapeHtml(deal.imgUrl)}" 
        alt="${escapeHtml(deal.title)}" 
        referrerpolicy="no-referrer" 
        style="object-fit:contain;" 
        onload="verifyImageNotDummy(this, ${safeDealId})"
        onerror="handleImgError(this, ${safeDealId})">
    </div>
    <p style="font-size:1rem; color:var(--text-primary); line-height:1.7; margin-bottom:1.5rem; font-weight:500;">${escapeHtml(deal.desc)}</p>
    <div class="price-history-section">
      <div class="ph-header-bar">
        <div class="ph-title-group">
          <h4>연도별 · 시즌별 할인 가격 추이 (2023 — 2026)</h4>
          <p>차트의 각 시즌 변곡점에 마우스를 올리면 당시 할인가와 원화 환산액을 확인할 수 있습니다.</p>
        </div>
        <div class="ph-range-tabs">
          <button type="button" class="ph-range-btn active" onclick="switchPriceChartRange(${safeDealId}, 'all', this)">전체 기간 (2023~2026)</button>
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
          <div class="ph-metric-label">역대 최저가 (All-Time Low)</div>
          <div class="ph-metric-value">$${escapeHtml(allTimeLow)}</div>
          <div class="ph-metric-sub">최대 ${maxDiscountPct}% 할인 (${escapeHtml(allTimeLowEntry.date)})</div>
        </div>
        <div class="ph-metric-card">
          <div class="ph-metric-label">현재 딜 판정 지표</div>
          <div class="ph-metric-value">$${escapeHtml(deal.discountPrice)}</div>
          <div class="ph-metric-sub">${escapeHtml(timingEvaluation)}</div>
        </div>
        <div class="ph-metric-card">
          <div class="ph-metric-label">핵심 세일 시즌</div>
          <div class="ph-metric-value" style="font-size:0.95rem; line-height:1.35;">${escapeHtml(deal.bestSeasonLabel || 'Black Friday (11월)')}</div>
          <div class="ph-metric-sub">브랜드 정기 프로모션 기준</div>
        </div>
      </div>
      <div class="ph-chart-wrapper">
        <div id="phSvgChartContainer">
          ${buildPriceChartSvg(deal, 'all')}
        </div>
        <div class="ph-tooltip-box" id="phInteractiveTooltip">
          <div>
            <span class="ph-tooltip-date">[${escapeHtml(latestPoint.date)}]</span>
            <span class="ph-tooltip-season">${escapeHtml(latestPoint.season)}</span>
          </div>
          <div class="ph-tooltip-price">
            $${escapeHtml(latestPoint.price)} <span style="color:var(--accent-gold); font-weight:700; margin-left:0.35rem;">(-${latestOffRate}%) · ${latestKrw}</span>
          </div>
        </div>
      </div>
      <div style="font-size:0.8rem; font-weight:800; color:var(--text-secondary); margin-bottom:0.55rem; text-transform:uppercase; letter-spacing:0.04em;">
        시즌별 평균 할인율 지표 (Seasonality Breakdown)
      </div>
      <div class="ph-seasonality-grid">
        ${seasonalityHtml}
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
      <h4 style="font-weight:800; font-size:1.1rem; color:var(--accent-gold);">공식 데모 & 사운드 리뷰 영상</h4>
      <a href="https://www.youtube.com/results?search_query=${searchEncoded}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; color:var(--accent-gold); text-decoration:none; font-weight:700;">YouTube에서 공식 리뷰 더보기</a>
    </div>
    <div class="youtube-video-container">
      <iframe 
        id="dealModalYoutubeIframe"
        src="https://www.youtube.com/embed/${escapeHtml(validVideoId)}?rel=0&modestbranding=1" 
        title="${escapeHtml(deal.title)} Official Demo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen>
      </iframe>
    </div>
    <div class="price-box" style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; padding:1.2rem;">
      <div>
        <span class="original-price" style="font-size:1.05rem;">정가 $${escapeHtml(deal.original)}</span>
        <span class="discount-price" style="font-size:1.8rem; margin-left:0.5rem;">$${escapeHtml(deal.discountPrice)}</span>
      </div>
      <div class="krw-price" style="font-size:1.1rem;">한화: ${krw}</div>
    </div>
    <a href="${escapeHtml(safeStoreUrl)}" target="_blank" rel="noopener noreferrer" class="btn-buy" style="font-size:1.05rem; padding:1rem; text-align:center; margin-top:1.2rem;">공식 스토어 구매 페이지로 이동</a>
  `;
  openModal('dealDetailModal');
}
async function deleteDealItem(dealId) {
  if (!isUserAdmin(currentUser)) {
    alert('관리자 권한이 없습니다.');
    return;
  }
  if (!confirm('이 딜 상품을 목록에서 삭제하시겠습니까?')) return;
  const target = dealsData.find(d => String(d.id) === String(dealId));
  markIdAsDeleted(DELETED_DEALS_STORAGE_KEY, dealId);
  if (target && target.dbRowId && supabaseClient) {
    try {
      await supabaseClient.from('deals').delete().eq('id', target.dbRowId);
    } catch (e) {
      console.error(e);
    }
  }
  closeModal('dealDetailModal');
  updateSavedDealCountBadge();
  renderDeals();
  alert('해당 딜이 삭제되었습니다.');
}
function filterCategory(cat) {
  if (cat === 'affiliate') {
    alert('제휴 문의: aftrdry@outlook.kr 또는 공식 디스코드 채널로 연락해 주시기 바랍니다.');
  }
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
  const localMap = getLocalCommentsMap();
  const localComments = localMap[strId] || [];
  const combinedIds = new Set();
  let count = 0;
  dbComments.concat(localComments).forEach(c => {
    const key = String(c.id || c.created_at);
    if (!combinedIds.has(key)) {
      combinedIds.add(key);
      count++;
    }
  });
  return count;
}
async function fetchAllCommentsSummary() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('comments')
      .select('*')
      .order('created_at', { ascending: true });
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
    renderCommunityPosts();
    return;
  }
  try {
    const { data, error } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    if (error) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-secondary); background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color);">게시글 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>`;
    } else {
      rawCommunityPosts = (data || []).filter(p => !deletedIds.includes(String(p.id)));
      renderCommunityPosts();
    }
  } catch (err) { console.error(err); }
}
function renderCommunityPosts() {
  const listEl = document.getElementById('communityList');
  const keyword = document.getElementById('commSearchKeyword').value.trim().toLowerCase();
  const sortBy = document.getElementById('commSortOption')?.value || 'latest';
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  let enriched = rawCommunityPosts
    .filter(p => !deletedIds.includes(String(p.id)))
    .map(p => {
      const stats = getPostStats(p);
      const commentCount = getCommentCountForPost(p.id);
      return {
        ...p,
        title: stats.editedTitle || p.title,
        content: stats.editedContent || p.content,
        category: stats.editedCategory || p.category,
        _views: stats.views,
        _likes: stats.likes,
        _daw: stats.daw,
        _pluginTag: stats.pluginTag,
        _comments: commentCount
      };
    });
  if (currentCommCat !== 'all') {
    enriched = enriched.filter(p => p.category === currentCommCat);
  }
  if (keyword !== '') {
    enriched = enriched.filter(p => 
      (p.title && p.title.toLowerCase().includes(keyword)) ||
      (p.content && p.content.toLowerCase().includes(keyword)) ||
      (p.author_nickname && p.author_nickname.toLowerCase().includes(keyword)) ||
      (p._daw && p._daw.toLowerCase().includes(keyword)) ||
      (p._pluginTag && p._pluginTag.toLowerCase().includes(keyword))
    );
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
    listEl.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary); background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color);">조건에 해당하는 게시글이 없습니다. 첫 번째 글을 작성해 보세요.</div>`;
    return;
  }
  listEl.innerHTML = enriched.map(p => {
    const isNotice = p.category === '공지사항';
    const cardClass = isNotice ? 'comm-card notice-card' : 'comm-card';
    const badgeClass = isNotice ? 'comm-category-badge notice' : 'comm-category-badge';
    const dateStr = new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
    const plainPreview = String(p.content || '').replace(/\[밑줄\]|\[\/밑줄\]|\*\*/g, '');
    return `
      <div class="${cardClass}" onclick="openPostDetail(${safeId})">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.45rem;">
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.2rem;">
            <span class="${badgeClass}">${escapeHtml(p.category || '자유수다')}</span>
            <span class="comm-author">${escapeHtml(p.author_nickname)}</span>
            ${p._daw ? `<span class="comm-daw-badge">${escapeHtml(p._daw)}</span>` : ''}
            ${p._pluginTag ? `<span class="comm-plugin-tag"># ${escapeHtml(p._pluginTag)}</span>` : ''}
          </div>
          <span style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(dateStr)}</span>
        </div>
        <h4 style="margin:0.5rem 0 0.4rem 0; font-size:1.12rem; color:var(--text-primary); font-weight:800;">${escapeHtml(p.title)}</h4>
        <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; white-space: pre-wrap; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(plainPreview)}</p>
        <div class="comm-card-footer">
          <div class="comm-stats-group">
            <span>추천 ${p._likes}</span>
            <span>댓글 ${p._comments}</span>
            <span>조회 ${p._views}</span>
          </div>
          <span style="color:var(--accent-gold);">상세 보기</span>
        </div>
      </div>
    `;
  }).join('');
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
  if (editPostObj) {
    editingPostId = editPostObj.id;
    const stats = getPostStats(editPostObj);
    if (headingEl) headingEl.innerText = '커뮤니티 게시글 수정';
    if (submitBtn) submitBtn.innerText = '수정 내용 저장';
    document.getElementById('writeCategorySelect').value = stats.editedCategory || editPostObj.category || '자유수다';
    if (document.getElementById('writePluginTag')) document.getElementById('writePluginTag').value = stats.pluginTag || '';
    document.getElementById('writeTitle').value = stats.editedTitle || editPostObj.title || '';
    document.getElementById('writeContent').value = stats.editedContent || editPostObj.content || '';
    document.getElementById('editorGuideOverlay').style.opacity = '0';
  } else {
    editingPostId = null;
    if (headingEl) headingEl.innerText = '프로듀서 커뮤니티 글 작성';
    if (submitBtn) submitBtn.innerText = '작성 완료 및 등록';
    document.getElementById('editorGuideOverlay').style.opacity = '0.85';
  }
  showPage('postWrite');
}
function cancelPostWrite() {
  editingPostId = null;
  showPage('community');
}
function handleEditorTyping() {
  const content = document.getElementById('writeContent').value;
  const overlay = document.getElementById('editorGuideOverlay');
  if (content.length > 0) { overlay.style.opacity = '0'; }
  else { overlay.style.opacity = '0.85'; }
}
function formatEditorText(command) {
  const textarea = document.getElementById('writeContent');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = selectedText;
  if (command === 'bold') replacement = `**${selectedText}**`;
  if (command === 'underline') replacement = `[밑줄]${selectedText}[/밑줄]`;
  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  handleEditorTyping();
}
function insertEditorLink() {
  const url = prompt('삽입할 웹 링크 URL을 입력하세요 (https:// 포함):', 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  const textarea = document.getElementById('writeContent');
  textarea.value += ` [링크](${url.trim()}) `;
  handleEditorTyping();
}
function insertEditorMedia(type) {
  let label = '이미지 URL';
  if (type === 'video') label = '유튜브 영상 URL';
  if (type === 'audio') label = 'SoundCloud 링크 또는 오디오(.mp3/.wav) URL';
  const url = prompt(`첨부할 ${label}을 입력하세요 (https:// 포함):`, 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  const textarea = document.getElementById('writeContent');
  if (type === 'image') {
    textarea.value += `\n![이미지첨부](${url.trim()})\n`;
  } else if (type === 'audio') {
    textarea.value += `\n[오디오링크](${url.trim()})\n`;
  } else {
    textarea.value += `\n[동영상링크](${url.trim()})\n`;
  }
  handleEditorTyping();
}
async function handleStandalonePostSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitPost');
  await withSubmitLock('postSubmit', btn, async () => {
    const category = document.getElementById('writeCategorySelect').value;
    const pluginTag = document.getElementById('writePluginTag')?.value.trim() || '';
    const title = document.getElementById('writeTitle').value.trim();
    const content = document.getElementById('writeContent').value.trim();
    if (category === '공지사항' && !isUserAdmin(currentUser)) {
      alert('공지사항은 관리자만 작성할 수 있습니다.');
      return;
    }
    if (editingPostId !== null) {
      const metaMap = getPostMetaMap();
      const key = String(editingPostId);
      metaMap[key] = {
        ...(metaMap[key] || {}),
        editedCategory: category,
        editedTitle: title,
        editedContent: content,
        pluginTag: pluginTag,
        daw: currentUserDaw
      };
      savePostMetaMap(metaMap);
      if (supabaseClient) {
        try {
          const numId = !isNaN(Number(editingPostId)) ? Number(editingPostId) : editingPostId;
          await supabaseClient.from('posts').update({ category, title, content }).eq('id', numId);
        } catch (err) {}
      }
      const target = rawCommunityPosts.find(p => String(p.id) === String(editingPostId));
      if (target) {
        target.category = category;
        target.title = title;
        target.content = content;
      }
      const finishedId = editingPostId;
      editingPostId = null;
      alert('게시글이 수정되었습니다.');
      openPostDetail(finishedId);
      return;
    }
    if (!supabaseClient) {
      const demoId = Date.now();
      rawCommunityPosts.unshift({
        id: demoId,
        category,
        author_nickname: originalNickname || '@aftrdry',
        author_daw: currentUserDaw,
        plugin_tag: pluginTag,
        title,
        content,
        views: 1,
        likes_count: 0,
        created_at: new Date().toISOString()
      });
      alert('게시글이 등록되었습니다.');
      showPage('community');
      return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { alert('로그인이 만료되었습니다.'); openModal('loginModal'); return; }
    const user = session.user;
    const nickname = originalNickname || user.user_metadata?.nickname || '@' + user.email.split('@')[0];
    const { data: insertedData, error } = await supabaseClient
      .from('posts')
      .insert([{
        user_id: user.id,
        author_nickname: nickname,
        category,
        title,
        content
      }])
      .select()
      .maybeSingle();
    if (error) {
      alert('게시글 작성 실패: ' + error.message);
    } else {
      if (insertedData && insertedData.id) {
        const metaMap = getPostMetaMap();
        metaMap[String(insertedData.id)] = {
          daw: currentUserDaw,
          pluginTag: pluginTag,
          extraViews: 1,
          extraLikes: 0
        };
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
  metaMap[strId] = {
    ...(metaMap[strId] || {}),
    extraViews: ((metaMap[strId] && metaMap[strId].extraViews) || 0) + 1
  };
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
  actionBtns.innerHTML = isMyPost
    ? `
      <button type="button" class="nav-btn" onclick="triggerEditCurrentPost(${safeId})">수정하기</button>
      <button type="button" class="nav-btn danger-outline-btn" onclick="deletePost(${safeId})">삭제하기</button>
    `
    : '';
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.2rem;">
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.35rem;">
        <span class="comm-category-badge ${displayCategory === '공지사항' ? 'notice' : ''}">${escapeHtml(displayCategory)}</span>
        <span class="comm-author" style="font-size:1rem;">${escapeHtml(post.author_nickname)}</span>
        ${stats.daw ? `<span class="comm-daw-badge">${escapeHtml(stats.daw)}</span>` : ''}
        ${stats.pluginTag ? `<span class="comm-plugin-tag"># ${escapeHtml(stats.pluginTag)}</span>` : ''}
      </div>
      <div style="font-size:0.82rem; color:var(--text-secondary);">
        <span>조회 ${stats.views}</span> · <span>${escapeHtml(dateStr)}</span>
      </div>
    </div>
    <h2 style="font-size:1.8rem; font-weight:900; margin-bottom:1.2rem; color:var(--text-primary); line-height:1.4;">${escapeHtml(displayTitle)}</h2>
    <div style="font-size:1.02rem; color:var(--text-primary); line-height:1.85; white-space: pre-wrap; padding: 1.5rem 0; border-top:1px solid var(--border-color);">${renderSafeContent(displayContent)}</div>
    <div class="post-upvote-bar">
      <button type="button" id="btnPostUpvote" class="upvote-action-btn ${stats.voted ? 'voted' : ''}" onclick="togglePostUpvote(${safeId})">
        <span>유익한 글 추천</span>
        <span id="postUpvoteCountText" style="color:var(--accent-gold);">${stats.likes}</span>
      </button>
      <span style="font-size:0.8rem; color:var(--text-secondary);">사운드 팁이나 피드백이 도움이 되었다면 추천을 눌러주세요.</span>
    </div>
  `;
  renderPostComments(post.id);
  showPage('postDetail');
}
function triggerEditCurrentPost(id) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(id));
  if (!post) return;
  showPostWritePage(post);
}
function togglePostUpvote(postId) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(postId));
  if (!post) return;
  const map = getPostMetaMap();
  const key = String(post.id);
  const current = map[key] || {};
  const nextVoted = !current.voted;
  const delta = nextVoted ? 1 : -1;
  map[key] = {
    ...current,
    voted: nextVoted,
    extraLikes: Math.max(0, (Number(current.extraLikes) || 0) + delta)
  };
  savePostMetaMap(map);
  const stats = getPostStats(post);
  const btn = document.getElementById('btnPostUpvote');
  const countEl = document.getElementById('postUpvoteCountText');
  if (btn) btn.classList.toggle('voted', stats.voted);
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
      const { data, error } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('post_id', numId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        postCommentsCache[strPostId] = data;
      }
    } catch (e) {}
  }
  const dbList = postCommentsCache[strPostId] || [];
  const localMap = getLocalCommentsMap();
  const localList = localMap[strPostId] || [];
  const merged = [];
  const seen = new Set();
  dbList.concat(localList).forEach(c => {
    const key = String(c.id || c.created_at);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(c);
    }
  });
  if (badgeEl) badgeEl.innerText = merged.length;
  if (merged.length === 0) {
    listEl.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-secondary); font-size:0.86rem; background:var(--bg-color); border:1px solid var(--border-color); border-radius:8px;">아직 등록된 댓글이 없습니다. 첫 번째 피드백을 남겨보세요.</div>`;
    return;
  }
  listEl.innerHTML = merged.map(c => {
    const cDate = new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const emailPrefix = currentUser?.email ? currentUser.email.split('@')[0] : '';
    const userNick = originalNickname || currentUser?.user_metadata?.nickname || (emailPrefix ? '@' + emailPrefix : '');
    const canDelete = currentUser && (
      isUserAdmin(currentUser) ||
      (c.user_id && String(c.user_id) === String(currentUser.id)) ||
      (c.author_nickname && c.author_nickname.replace(/^@/, '') === userNick.replace(/^@/, ''))
    );
    const safeCommentId = typeof c.id === 'string' ? `'${c.id}'` : c.id;
    return `
      <div class="comm-comment-item">
        <div class="comm-comment-top">
          <div>
            <span class="comm-author" style="font-size:0.88rem;">${escapeHtml(c.author_nickname)}</span>
            ${c.author_daw ? `<span class="comm-daw-badge">${escapeHtml(c.author_daw)}</span>` : ''}
            <span style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(cDate)}</span>
          </div>
          ${canDelete ? `<button type="button" class="nav-btn danger-outline-btn" style="padding:0.2rem 0.6rem; font-size:0.74rem;" onclick="deleteCommentItem('${escapeHtml(strPostId)}', ${safeCommentId})">삭제</button>` : ''}
        </div>
        <div class="comm-comment-body">${renderSafeContent(c.content)}</div>
      </div>
    `;
  }).join('');
}
async function handleCommentSubmit(e) {
  e.preventDefault();
  if (!currentUser && supabaseClient) {
    alert('댓글을 작성하려면 로그인이 필요합니다.');
    openModal('loginModal');
    return;
  }
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
        const { data, error } = await supabaseClient
          .from('comments')
          .insert([{
            post_id: numPostId,
            user_id: currentUser.id,
            author_nickname: nickname,
            author_daw: currentUserDaw,
            content: content
          }])
          .select()
          .maybeSingle();
        if (!error && data) {
          savedDbComment = data;
        }
      } catch (err) {}
    }
    if (!savedDbComment) {
      const localMap = getLocalCommentsMap();
      if (!localMap[strPostId]) localMap[strPostId] = [];
      localMap[strPostId].push({
        id: 'local_' + Date.now(),
        post_id: currentOpenPostId,
        user_id: currentUser?.id || 'local',
        author_nickname: nickname,
        author_daw: currentUserDaw,
        content: content,
        created_at: new Date().toISOString()
      });
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
  await renderPostComments(postId);
}
async function deletePost(id) {
  if (!confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
  
  markIdAsDeleted(DELETED_POSTS_STORAGE_KEY, id);
  rawCommunityPosts = rawCommunityPosts.filter(p => String(p.id) !== String(id));
  if (!supabaseClient) {
    alert('게시글이 삭제되었습니다.');
    showPage('community');
    renderCommunityPosts();
    return;
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const numId = !isNaN(Number(id)) ? Number(id) : id;
      let { data, error } = await supabaseClient
        .from('posts')
        .delete()
        .eq('id', numId)
        .select();
      if (!error && (!data || data.length === 0)) {
        await supabaseClient
          .from('posts')
          .delete()
          .match({ id: numId, user_id: session.user.id });
      }
    }
  } catch (err) {
    console.error(err);
  }
  alert('게시글이 성공적으로 삭제되었습니다.');
  showPage('community');
  renderCommunityPosts();
}
function switchMyPageTab(tabName, el) {
  document.querySelectorAll('#myPageView .cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('mpTabProfile').style.display = tabName === 'profile' ? 'block' : 'none';
  document.getElementById('mpTabSecurity').style.display = tabName === 'security' ? 'block' : 'none';
  document.getElementById('mpTabActivity').style.display = tabName === 'activity' ? 'block' : 'none';
  if (tabName === 'activity') { fetchMyActivityPosts(); }
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
      if (data.main_daw) {
        currentUserDaw = data.main_daw;
        document.getElementById('myPageDaw').value = data.main_daw;
      }
    } else {
      originalNickname = currentUser.user_metadata?.nickname || '@' + currentUser.email.split('@')[0];
      document.getElementById('myPageNickname').value = originalNickname;
    }
    onNicknameInputChanged();
  } catch (err) { console.error(err); }
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
  if (nickname === originalNickname) {
    isNicknameVerified = true;
    msgEl.style.color = 'var(--text-secondary)';
    msgEl.innerText = '현재 본인의 닉네임입니다.';
    saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer';
    return;
  }
  if (!supabaseClient) {
    isNicknameVerified = true;
    msgEl.style.color = '#8fa874';
    msgEl.innerText = '사용 가능한 닉네임입니다. (데모 모드)';
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
    const { error } = await supabaseClient.from('profiles').upsert({
      id: session.user.id, email: session.user.email, nickname, main_daw, updated_at: new Date()
    });
    if (error) { alert('저장 실패: ' + error.message); }
    else { alert('프로필 정보가 안전하게 저장되었습니다.'); originalNickname = nickname; }
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
    if (!supabaseClient) { alert('비밀번호가 변경되었습니다. (데모 모드)'); return; }
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) { alert('비밀번호 변경 실패: ' + error.message); }
    else { alert('비밀번호가 성공적으로 변경되었습니다.'); e.target.reset(); }
  });
}
async function handleAccountDeleteRequest() {
  const confirmed = confirm('정말 회원 탈퇴를 진행하시겠습니까?\n탈퇴 즉시 작성하신 게시글과 프로필 데이터가 파기되며 복구할 수 없습니다.');
  if (!confirmed) return;
  if (!supabaseClient) {
    alert('회원 탈퇴 및 데이터 파기가 완료되었습니다.');
    location.reload();
    return;
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    await supabaseClient.from('posts').delete().eq('user_id', session.user.id);
    await supabaseClient.from('profiles').delete().eq('id', session.user.id);
    await supabaseClient.auth.signOut();
    alert('회원 탈퇴 및 개인정보 파기 처리가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.');
    location.reload();
  } catch (err) {
    console.error(err);
    alert('탈퇴 처리 중 오류가 발생했습니다. 고객센터(aftrdry@outlook.kr)로 문의해 주세요.');
  }
}
async function fetchMyActivityPosts() {
  const listEl = document.getElementById('myActivityList');
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);
  if (!supabaseClient) {
    listEl.innerHTML = `<div class="comm-card"><h4 style="font-weight:700;">[데모] 내가 작성한 글 샘플 제목</h4><p style="font-size:0.88rem; color:var(--text-secondary);">내용 요약...</p></div>`;
    return;
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const myPosts = rawCommunityPosts.filter(p => isUserOwnerOfPost(p) && !deletedIds.includes(String(p.id)));
    if (myPosts.length === 0) {
      listEl.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding: 2rem;">작성한 게시글이 없습니다.</p>`;
      return;
    }
    listEl.innerHTML = myPosts.map(p => {
      const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
      const stats = getPostStats(p);
      return `
        <div class="comm-card" onclick="openPostDetail(${safeId})">
          <span class="comm-category-badge">${escapeHtml(stats.editedCategory || p.category)}</span>
          <h4 style="margin:0.4rem 0; font-size:1.05rem; font-weight:700;">${escapeHtml(stats.editedTitle || p.title)}</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(new Date(p.created_at).toLocaleDateString('ko-KR'))} · 추천 ${stats.likes} · 조회 ${stats.views}</p>
        </div>
      `;
    }).join('');
  } catch (err) { console.error(err); }
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
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { alert('로그인 실패: 이메일 또는 비밀번호를 확인해 주세요.'); }
    else { closeModal('loginModal'); await checkUserSession(); alert('성공적으로 로그인되었습니다.'); }
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
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { nickname } } });
    if (error) { alert('회원가입 실패: ' + error.message); }
    else { closeModal('signupModal'); alert('가입 완료. 이메일 인증 확인 후 로그인해 주세요.'); }
  });
}
async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  if (!supabaseClient) { alert('재설정 메일 발송됨.'); closeModal('resetPwModal'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: 'https://plugazit.com' });
  if (error) { alert('요청 실패: ' + error.message); }
  else { alert('비밀번호 재설정 메일이 발송되었습니다.'); closeModal('resetPwModal'); }
}
async function handleFindEmailSubmit(e) {
  e.preventDefault();
  const nickname = document.getElementById('findNickname').value.trim();
  if (!supabaseClient) { alert(`이메일 힌트: af***@outlook.kr`); closeModal('findEmailModal'); return; }
  const { data } = await supabaseClient.from('profiles').select('email, nickname').eq('nickname', nickname).maybeSingle();
  if (!data) { alert('해당 닉네임의 회원을 찾을 수 없습니다.'); }
  else {
    const parts = data.email.split('@');
    const masked = parts[0].substring(0, 2) + '*'.repeat(Math.max(2, parts[0].length - 2)) + '@' + parts[1];
    alert(`가입 이메일 힌트: [ ${masked} ]`);
    closeModal('findEmailModal');
  }
}
async function handleLogout() {
  if (supabaseClient) { await supabaseClient.auth.signOut(); }
  alert('로그아웃 되었습니다.');
  location.reload();
}
async function handleDealSubmit(e) {
  e.preventDefault();
  if (!isUserAdmin(currentUser) && supabaseClient) {
    alert('관리자 권한이 없습니다.');
    return;
  }
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
      if (!session || !isUserAdmin(session.user)) {
        alert('관리자 세션이 유효하지 않습니다. 다시 로그인해 주세요.');
        return;
      }
      const { data, error } = await supabaseClient
        .from('deals')
        .insert([{
          brand,
          title,
          cat,
          sub,
          description: desc,
          original_price: orig,
          discount_price: disc,
          store_url: storeUrl,
          img_url: customImg || null,
          youtube_id: ytId,
          days_left: 7,
          seasonality: defaults.seasonality,
          price_history: defaults.priceHistory,
          created_by: session.user.id
        }])
        .select()
        .maybeSingle();
      if (error) {
        alert('Supabase DB 저장 실패 (SQL 설정 여부를 확인해 주세요): ' + error.message);
        return;
      }
      if (data && data.id) {
        insertedRowId = data.id;
      }
    }
    const newDeal = {
      id: insertedRowId ? `db_${insertedRowId}` : (dealsData.length + 1),
      dbRowId: insertedRowId,
      brand,
      title,
      cat,
      sub,
      desc,
      original: orig,
      discountPrice: disc,
      discountRateNum: rateNum,
      discountRate: rateStr,
      storeUrl,
      daysLeft: 7,
      imgUrl: resolvedImgUrl,
      backupImgUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      youtubeId: ytId,
      ytQuery: `${brand} ${title} official demo`,
      bestSeasonLabel: defaults.bestSeasonLabel,
      seasonality: defaults.seasonality,
      priceHistory: defaults.priceHistory
    };
    dealsData.unshift(newDeal);
    resolveLiveYoutubeAndOfficialImage(newDeal);
    updateSavedDealCountBadge();
    renderDeals();
    alert('새로운 딜 정보가 데이터베이스에 영구 등록되었습니다.');
    e.target.reset();
    showPage('deals');
  });
}
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const savedTheme = localStorage.getItem('plugazit_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    const savedDaw = localStorage.getItem('plugazit_user_daw');
    if (savedDaw) currentUserDaw = savedDaw;
  } catch (e) {}
  renderSubCategories();
  updateSavedDealCountBadge();
  renderDeals();
  await checkUserSession();
  await fetchDealsFromSupabase();
  dealsData.forEach(d => resolveLiveYoutubeAndOfficialImage(d));
});