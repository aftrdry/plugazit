const SUPABASE_URL = "https://pxmkzyhayxsvbbftncwy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_J0LQJ-qjr5ISX1jRKaQ7-A_GwABw8XP";
let supabaseClient = null;

const ADMIN_EMAILS = ["aftrdry@outlook.kr", "aftrdry@outlook.com", "sharpmson774@gmail.com"];
let currentUser = null;
let rawCommunityPosts = [];
let dealViewMode = 'card';
let currentOpenDealId = null;

let originalNickname = "";
let isNicknameVerified = true;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* 1. 보안 유틸리티: XSS 방지를 위한 HTML 이스케이프 및 URL 검증 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, ''');
}

function sanitizeUrl(url) {
  if (!url) return '#';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '#';
}

/* 에디터 문법(**굵게**, <u>밑줄</u>, [링크], ![이미지])만 안전하게 허용하는 렌더러 */
function renderSafeContent(rawText) {
  let safe = escapeHtml(rawText);
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  safe = safe.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>');
  safe = safe.replace(/!\[이미지첨부\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$1" alt="첨부 이미지" referrerpolicy="no-referrer" style="max-width:100%; border-radius:8px; margin:0.8rem 0; display:block;">');
  safe = safe.replace(/\[(링크|동영상링크)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent-gold); text-decoration:underline; font-weight:700;">[$1 열기]</a>');
  return safe;
}

/* 2. 중복 제출 방지(Rate-limit / Double Submit Lock) 헬퍼 */
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

/* 3. 로컬 영구 삭제 레지스트리 (게시글 및 딜) */
const DELETED_POSTS_STORAGE_KEY = 'plugazit_deleted_post_ids_v1';
const DELETED_DEALS_STORAGE_KEY = 'plugazit_deleted_deal_ids_v1';

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
    document.querySelectorAll('.main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
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
  document.getElementById('navCommBtn').classList.toggle('active', page === 'community');
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

/* ESC 키를 통한 모달 닫기 (키보드 접근성) */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
});

/* 법적 고지 모달 탭 전환 */
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
  mixing: ["전체", "EQ", "Compressor/Limiter", "Reverb/Delay", "De-Esser/Dynamic", "Saturation/Tape", "Mastering Chain"],
  synth: ["전체", "Analog/Synth", "Sample Library", "Cinematic/Orchestral", "Drum/Percussion"],
  fx: ["전체", "Pitch/Vocal", "Utility/Analyzer", "Modulation"],
  free: ["전체", "Free Synths", "Free FX"]
};

const dealsData = [
  {
    id: 1,
    brand: "FabFilter",
    title: "Pro-Q 3 Equalizer",
    cat: "mixing",
    sub: "EQ",
    desc: "트랙 간 믹싱 마스킹 제어 및 위상 왜곡 없는 정밀 이퀄라이징과 Dynamic EQ 작업용 업계 표준 이퀄라이저입니다.",
    original: 179,
    discountPrice: 134,
    discountRateNum: 25,
    discountRate: "25% OFF",
    code: "FAB-PROMO-2026",
    perk: "업계 표준 EQ, Dynamic EQ 모드 지원",
    storeUrl: "https://www.fabfilter.com/products/pro-q-3-equalizer-plug-in",
    daysLeft: 5,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.fabfilter.com%2Fproducts%2Fpro-q-3-equalizer-plug-in&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "보컬이나 악기 트랙에서 발생하는 불쾌한 쏘는 소리와 피크 공명을 실시간으로 감지하여 부드럽게 억제하는 툴입니다.",
    original: 219,
    discountPrice: 149,
    discountRateNum: 32,
    discountRate: "32% OFF",
    code: "SOOTHE2026",
    perk: "불쾌한 공명 사운드 자동 실시간 제어",
    storeUrl: "https://oeksound.com/plugins/soothe2/",
    daysLeft: 2,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Foeksound.com%2Fplugins%2Fsoothe2%2F&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "Decapitator, Echoboy 등 아날로그 감성의 특색 있는 사운드 질감을 만드는 21가지 최고급 이펙터 모음입니다.",
    original: 499,
    discountPrice: 249,
    discountRateNum: 50,
    discountRate: "50% OFF",
    code: "SOUNDTOYS-DEAL",
    perk: "21개 대표 사운드 디자이닝 이펙터 전체 포함",
    storeUrl: "https://www.soundtoys.com/product/soundtoys-5/",
    daysLeft: 12,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.soundtoys.com%2Fproduct%2Fsoundtoys-5%2F&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "DSP 하드웨어 없이 1176, LA-2A, Studer 테이프 머신 등 전설적인 아날로그 하드웨어의 명음기를 컴퓨터에서 구동합니다.",
    original: 199,
    discountPrice: 99,
    discountRateNum: 50,
    discountRate: "50% OFF",
    code: "UAD-SPARK-50",
    perk: "전설적 아날로그 믹싱 기기 네이티브 지원",
    storeUrl: "https://spark.uaudio.com/",
    daysLeft: 1,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fspark.uaudio.com%2F&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "빈티지 신티사이저와 클래식 건반 악기들의 최고급 프리셋 100가지를 무상으로 사용할 수 있는 가상악기 뷰어입니다.",
    original: 99,
    discountPrice: 0,
    discountRateNum: 100,
    discountRate: "100% FREE",
    code: "DIRECT-DOWNLOAD",
    perk: "100가지 핵심 빈티지 신스 프리셋 무상 제공",
    storeUrl: "https://www.arturia.com/products/software-instruments/analoglab-v/overview",
    daysLeft: 99,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.arturia.com%2Fproducts%2Fsoftware-instruments%2Fanaloglab-v%2Foverview&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "Kontakt 7 샘플러를 기반으로 웅장한 시네마틱 오케스트라, 드럼, 신스 사운드까지 보유한 통합 제작 번들입니다.",
    original: 599,
    discountPrice: 299,
    discountRateNum: 50,
    discountRate: "50% OFF",
    code: "BF-SEASON",
    perk: "Kontakt 7 및 수만 가지 시네마틱 샘플 수록",
    storeUrl: "https://www.native-instruments.com/en/catalog/komplete/",
    daysLeft: 4,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.native-instruments.com%2Fen%2Fcatalog%2Fkomplete%2F&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "음원 마스터링 시 대역별 음압 보정, Stem Rebalance 및 AI Assistant 기반으로 곡의 완성도를 마감하는 마스터링 툴입니다.",
    original: 399,
    discountPrice: 199,
    discountRateNum: 50,
    discountRate: "50% OFF",
    code: "OZONE11-SALE",
    perk: "AI 기반 종합 음압/마스터링 프로세싱",
    storeUrl: "https://www.izotope.com/en/products/ozone.html",
    daysLeft: 7,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.izotope.com%2Fen%2Fproducts%2Fozone.html&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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
    desc: "직관적인 렌더링 파형 편집과 압도적인 사운드 메이킹 성능으로 EDM, 팝, 트랩 전 장르에서 일렉트로닉 신스를 이끄는 대표작입니다.",
    original: 189,
    discountPrice: 149,
    discountRateNum: 21,
    discountRate: "21% OFF",
    code: "SERUM-PROMO",
    perk: "웨이브테이블 신티사이저 글로벌 시그니처 툴",
    storeUrl: "https://xferrecords.com/products/serum",
    daysLeft: 15,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fxferrecords.com%2Fproducts%2Fserum&screenshot=true&meta=false&embed=screenshot.url",
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
    desc: "보컬의 음정과 타이밍을 음질 손상 없이 정밀하게 수정하는 글로벌 표준 보컬 피치 보정 플러그인입니다.",
    original: 249,
    discountPrice: 149,
    discountRateNum: 40,
    discountRate: "40% OFF",
    code: "MELODYNE40",
    perk: "자연스러운 보컬 피치 및 타임 보정 업계 표준",
    storeUrl: "https://www.celemony.com/en/melodyne/what-is-melodyne",
    daysLeft: 3,
    imgUrl: "https://api.microlink.io/?url=https%3A%2F%2Fwww.celemony.com%2Fen%2Fmelodyne%2Fwhat-is-melodyne&screenshot=true&meta=false&embed=screenshot.url",
    youtubeId: "5Sa3wa_doG0",
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

/* 4. Supabase 'deals' 테이블 연동 (DB에 저장된 신규 등록 상품 불러오기) */
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
        imgUrl: row.img_url || `https://api.microlink.io/?url=${encodeURIComponent(storeUrl)}&screenshot=true&meta=false&embed=screenshot.url`,
        youtubeId: row.youtube_id || "5Sa3wa_doG0",
        ytQuery: `${row.brand || ''} ${row.title || ''} official demo`,
        bestSeasonLabel: defaults.bestSeasonLabel,
        seasonality: row.seasonality || defaults.seasonality,
        priceHistory: row.price_history || defaults.priceHistory
      };

      dealsData.unshift(mappedDeal);
      resolveLiveYoutubeAndOfficialImage(mappedDeal);
    });

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

async function resolveLiveYoutubeAndOfficialImage(deal) {
  try {
    const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(deal.storeUrl)}&screenshot=true`);
    if (mlRes.ok) {
      const mlJson = await mlRes.json();
      const ogImg = mlJson?.data?.image?.url;
      const screenImg = mlJson?.data?.screenshot?.url;
      if (ogImg && ogImg.startsWith('http')) {
        deal.imgUrl = ogImg;
        deal.backupImgUrl = screenImg || deal.imgUrl;
      } else if (screenImg && screenImg.startsWith('http')) {
        deal.imgUrl = screenImg;
      }
      updateDealDomImages(deal.id, deal.imgUrl);
    }
  } catch (e) {}

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
          if (firstValid.thumbnail && firstValid.thumbnail.startsWith('http')) {
            deal.backupImgUrl = firstValid.thumbnail;
          }
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
  document.querySelectorAll('.main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
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

  if (deal && step <= 1) {
    imgEl.dataset.fallbackStep = '2';
    imgEl.src = `https://api.microlink.io/?url=${encodeURIComponent(deal.storeUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
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

  let filtered = dealsData.filter(d => !deletedDealIds.includes(String(d.id)));

  if (currentMainCat !== 'all') {
    if (currentMainCat === 'free') { filtered = filtered.filter(d => d.discountPrice === 0); }
    else { filtered = filtered.filter(d => d.cat === currentMainCat); }
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
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">검색 조건에 해당되는 VST 딜 정보가 없습니다.</div>`;
    return;
  }

  container.innerHTML = filtered.map(d => {
    const krw = d.discountPrice === 0 ? "0원 (무료)" : `약 ${(d.discountPrice * USD_TO_KRW).toLocaleString()}원`;
    const origKrw = d.original ? `$${escapeHtml(d.original)}` : '';
    const tagClass = d.discountPrice === 0 ? 'tag-free' : 'tag-discount';
    const safeDealId = typeof d.id === 'string' ? `'${d.id}'` : d.id;
    const safeStoreUrl = sanitizeUrl(d.storeUrl);

    return `
      <div class="deal-card" onclick="openDealDetailModal(${safeDealId})">
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
  const validVideoId = (deal.youtubeId && deal.youtubeId.length === 11) ? deal.youtubeId : "5Sa3wa_doG0";
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

/* 관리자 전용 딜 삭제 (Supabase DB + 로컬 동시 제거) */
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
  renderDeals();
  alert('해당 딜이 삭제되었습니다.');
}

function filterCategory(cat) {
  if (cat === 'affiliate') {
    alert('제휴 문의: aftrdry@outlook.kr 또는 공식 디스코드 채널로 연락해 주시기 바랍니다.');
  }
}

let currentCommCat = 'all';

function setCommunityCategory(cat, el) {
  document.querySelectorAll('#communityView .main-cat-bar .cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentCommCat = cat;
  renderCommunityPosts();
}

async function fetchCommunityPosts() {
  const listEl = document.getElementById('communityList');
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);

  if (!supabaseClient) {
    if (rawCommunityPosts.length === 0) {
      rawCommunityPosts = [
        { id: 1, category: "공지사항", author_nickname: "@aftrdry", title: "PlugAzit 공식 아지트 개설 안내", content: "프로듀서들을 위한 큐레이션 및 커뮤니티 공간에 오신 것을 환영합니다.", created_at: new Date().toISOString() },
        { id: 2, category: "믹싱/마스터링", author_nickname: "@aftrdry", title: "FabFilter Pro-Q 3 Dynamic EQ 보컬 마스킹 잡는 팁", content: "Sidechain 연동 후 250Hz 영역 Dynamic EQ 적용하면 투명하게 정리됩니다.", created_at: new Date().toISOString() }
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
  const deletedIds = getDeletedIds(DELETED_POSTS_STORAGE_KEY);

  let filtered = rawCommunityPosts.filter(p => !deletedIds.includes(String(p.id)));
  if (currentCommCat !== 'all') { filtered = filtered.filter(p => p.category === currentCommCat); }
  if (keyword !== '') {
    filtered = filtered.filter(p => 
      (p.title && p.title.toLowerCase().includes(keyword)) ||
      (p.content && p.content.toLowerCase().includes(keyword)) ||
      (p.author_nickname && p.author_nickname.toLowerCase().includes(keyword))
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary); background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color);">게시글이 존재하지 않습니다. 첫 번째 글을 작성해 보세요.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const isNotice = p.category === '공지사항';
    const cardClass = isNotice ? 'comm-card notice-card' : 'comm-card';
    const badgeClass = isNotice ? 'comm-category-badge notice' : 'comm-category-badge';
    const dateStr = new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;

    return `
      <div class="${cardClass}" onclick="openPostDetail(${safeId})">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <div>
            <span class="${badgeClass}">${escapeHtml(p.category || '자유수다')}</span>
            <span class="comm-author">${escapeHtml(p.author_nickname)}</span>
          </div>
          <span style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(dateStr)}</span>
        </div>
        <h4 style="margin:0.5rem 0 0.4rem 0; font-size:1.1rem; color:var(--text-primary); font-weight:700;">${escapeHtml(p.title)}</h4>
        <p style="font-size:0.92rem; color:var(--text-secondary); line-height:1.6; white-space: pre-wrap; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(p.content)}</p>
      </div>
    `;
  }).join('');
}

function showPostWritePage() {
  if (!currentUser && supabaseClient) {
    alert('로그인이 필요한 기능입니다.');
    openModal('loginModal');
    return;
  }
  document.getElementById('standalonePostForm').reset();
  document.getElementById('editorGuideOverlay').style.opacity = '0.85';
  document.getElementById('writeOptNotice').style.display = isUserAdmin(currentUser) ? 'block' : 'none';
  showPage('postWrite');
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
  if (command === 'underline') replacement = `<u>${selectedText}</u>`;

  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
}

function insertEditorLink() {
  const url = prompt('삽입할 웹 링크 URL을 입력하세요 (https:// 포함):', 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  const textarea = document.getElementById('writeContent');
  textarea.value += ` [링크](${url.trim()}) `;
  handleEditorTyping();
}

function insertEditorMedia(type) {
  const label = type === 'image' ? '이미지 URL' : '동영상(유튜브 등) URL';
  const url = prompt(`첨부할 ${label}을 입력하세요 (https:// 포함):`, 'https://');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  const textarea = document.getElementById('writeContent');
  textarea.value += type === 'image' ? `\n![이미지첨부](${url.trim()})\n` : `\n[동영상링크](${url.trim()})\n`;
  handleEditorTyping();
}

async function handleStandalonePostSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitPost');

  await withSubmitLock('postSubmit', btn, async () => {
    const category = document.getElementById('writeCategorySelect').value;
    const title = document.getElementById('writeTitle').value.trim();
    const content = document.getElementById('writeContent').value.trim();

    if (category === '공지사항' && !isUserAdmin(currentUser)) {
      alert('공지사항은 관리자만 작성할 수 있습니다.');
      return;
    }

    if (!supabaseClient) {
      alert('게시글이 성공적으로 등록되었습니다. (데모 모드)');
      showPage('community');
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { alert('로그인이 만료되었습니다.'); openModal('loginModal'); return; }

    const user = session.user;
    const nickname = user.user_metadata?.nickname || '@' + user.email.split('@')[0];

    const { error } = await supabaseClient.from('posts').insert([{
      user_id: user.id, author_nickname: nickname, category, title, content
    }]);

    if (error) { alert('게시글 작성 실패: ' + error.message); }
    else {
      alert('게시글이 등록되었습니다.');
      showPage('community');
      await fetchCommunityPosts();
    }
  });
}

function openPostDetail(id) {
  const post = rawCommunityPosts.find(p => String(p.id) === String(id));
  if (!post) return;

  const container = document.getElementById('postDetailContainer');
  const actionBtns = document.getElementById('postDetailActionBtns');
  const dateStr = new Date(post.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const emailPrefix = currentUser?.email ? currentUser.email.split('@')[0] : '';
  const userNick = currentUser?.user_metadata?.nickname || (emailPrefix ? '@' + emailPrefix : '');
  const isAdmin = isUserAdmin(currentUser);
  const isMyPost = currentUser && (
    (post.user_id && String(currentUser.id) === String(post.user_id)) ||
    (post.author_nickname && (
      post.author_nickname === userNick ||
      post.author_nickname.replace(/^@/, '') === userNick.replace(/^@/, '') ||
      post.author_nickname.replace(/^@/, '') === emailPrefix
    )) ||
    isAdmin
  );

  const safeId = typeof post.id === 'string' ? `'${post.id}'` : post.id;
  actionBtns.innerHTML = isMyPost ? `<button type="button" class="nav-btn danger-outline-btn" onclick="deletePost(${safeId})">삭제하기</button>` : '';

  container.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <span class="comm-category-badge ${post.category === '공지사항' ? 'notice' : ''}">${escapeHtml(post.category)}</span>
      <span class="comm-author" style="font-size:1rem; margin-left:0.5rem;">${escapeHtml(post.author_nickname)}</span>
      <span style="font-size:0.82rem; color:var(--text-secondary); float:right;">${escapeHtml(dateStr)}</span>
    </div>
    <h2 style="font-size:1.8rem; font-weight:900; margin-bottom:1.2rem; color:var(--text-primary);">${escapeHtml(post.title)}</h2>
    <div style="font-size:1.02rem; color:var(--text-primary); line-height:1.8; white-space: pre-wrap; padding: 1.5rem 0; border-top:1px solid var(--border-color); border-bottom:1px solid var(--border-color);">${renderSafeContent(post.content)}</div>
  `;

  showPage('postDetail');
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
    document.getElementById('myPageDaw').value = 'Logic Pro';
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
      if (data.main_daw) document.getElementById('myPageDaw').value = data.main_daw;
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

/* 회원 탈퇴 및 작성 데이터 파기 (출시 안전성 가이드 필수 항목) */
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
    const myPosts = rawCommunityPosts.filter(p => String(p.user_id) === String(session.user.id) && !deletedIds.includes(String(p.id)));

    if (myPosts.length === 0) {
      listEl.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding: 2rem;">작성한 게시글이 없습니다.</p>`;
      return;
    }

    listEl.innerHTML = myPosts.map(p => {
      const safeId = typeof p.id === 'string' ? `'${p.id}'` : p.id;
      return `
        <div class="comm-card" onclick="openPostDetail(${safeId})">
          <span class="comm-category-badge">${escapeHtml(p.category)}</span>
          <h4 style="margin:0.4rem 0; font-size:1.05rem; font-weight:700;">${escapeHtml(p.title)}</h4>
          <p style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(new Date(p.created_at).toLocaleDateString('ko-KR'))}</p>
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
    else { closeModal('loginModal'); updateUIAuthStatus(data.user); alert('성공적으로 로그인되었습니다.'); }
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

function extractYoutubeId(input) {
  if (!input) return "";
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}

/* 5. 관리자 신규 딜 등록: Supabase 'deals' 테이블에 실제로 영구 저장 */
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
    const ytId = extractYoutubeId(ytInput) || "5Sa3wa_doG0";

    const rateNum = orig > 0 ? Math.round(((orig - disc) / orig) * 100) : (disc === 0 ? 100 : 0);
    const rateStr = disc === 0 ? "100% FREE" : `${rateNum}% OFF`;
    const defaults = buildDefaultSeasonalityAndHistory(orig, disc, rateNum);
    const resolvedImgUrl = customImg || `https://api.microlink.io/?url=${encodeURIComponent(storeUrl)}&screenshot=true&meta=false&embed=screenshot.url`;

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
      youtubeId: ytId,
      ytQuery: `${brand} ${title} official demo`,
      bestSeasonLabel: defaults.bestSeasonLabel,
      seasonality: defaults.seasonality,
      priceHistory: defaults.priceHistory
    };

    dealsData.unshift(newDeal);
    resolveLiveYoutubeAndOfficialImage(newDeal);
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
  } catch (e) {}

  renderSubCategories();
  renderDeals();
  await checkUserSession();
  await fetchDealsFromSupabase();
  dealsData.forEach(d => resolveLiveYoutubeAndOfficialImage(d));
});