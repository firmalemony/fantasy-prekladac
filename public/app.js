// Slovníky budou načítány dynamicky podle výběru
const DICTIONARIES = {
  elf: '/slovniky/elf.json',
  klingon: '/slovniky/klingon.json',
  dothraki: '/slovniky/dothraki.json',
  esperanto: '/slovniky/esperanto.json',
  quenya: '/slovniky/quenya.json',
  dwarvish: '/slovniky/dwarvish.json',
  valyrian: '/slovniky/valyrian.json',
  cs: '/slovniky/cs.json', // fallback, pokud bude potřeba
};

let currentUser = null;
let currentHistory = [];
let lastTranslateTime = 0;

// UI prvky
const loginBtn = document.getElementById('login-btn');
const userInfo = document.getElementById('user-info');
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const fromLang = document.getElementById('from-lang');
const toLang = document.getElementById('to-lang');
const inputText = document.getElementById('input-text');
const translateBtn = document.getElementById('translate-btn');
const outputBox = document.getElementById('output-box');
const saveBtn = document.getElementById('save-btn');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// === KREDITNÍ SYSTÉM ===
const ANON_CREDITS_PER_DAY = 5;
const USER_CREDITS_PER_DAY = 50;
let currentCredits = 0;
let creditsKey = '';

const creditsBox = document.createElement('div');
creditsBox.id = 'credits-box';
creditsBox.style.margin = '8px 0';
creditsBox.style.fontFamily = "'Press Start 2P', cursive";
creditsBox.style.fontSize = '0.95rem';
const mainHeader = document.querySelector('header');
mainHeader.appendChild(creditsBox);

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

function getCreditsKey() {
  if (currentUser && currentUser.id) {
    return 'fantasy_credits_' + currentUser.id + '_' + getTodayStr();
  } else {
    return 'fantasy_credits_anon_' + getTodayStr();
  }
}

function getMaxCredits() {
  return (currentUser && currentUser.id) ? USER_CREDITS_PER_DAY : ANON_CREDITS_PER_DAY;
}

function loadCredits() {
  creditsKey = getCreditsKey();
  let stored = localStorage.getItem(creditsKey);
  if (stored === null) {
    currentCredits = getMaxCredits();
    localStorage.setItem(creditsKey, currentCredits);
  } else {
    currentCredits = parseInt(stored, 10);
  }
  updateCreditsUI();
}

function updateCreditsUI() {
  creditsBox.textContent = `Kredity na dnes: ${currentCredits} / ${getMaxCredits()}`;
  if (currentCredits <= 0) {
    translateBtn.disabled = true;
    translateBtn.classList.add('disabled');
    translateBtn.textContent = 'Vyčerpány kredity';
  } else {
    translateBtn.disabled = false;
    translateBtn.classList.remove('disabled');
    translateBtn.innerHTML = '<img src="/assets/sword.svg" alt="Přeložit" class="icon"> Přeložit';
  }
}

function useCredits(wordsUsed) {
  currentCredits -= wordsUsed;
  if (currentCredits < 0) currentCredits = 0;
  localStorage.setItem(creditsKey, currentCredits);
  updateCreditsUI();
}

// === úprava loginBtn ===
loginBtn.addEventListener('click', () => {
  // ZDE VLOŽ SVŮJ GOOGLE CLIENT ID:
  const clientId = '532259405148-jlr8tv2f82p19vonlnqh2dc8japrr9d8.apps.googleusercontent.com'; // TODO: doplnit
  const redirectUri = window.location.origin + '/auth/google';
  const scope = 'openid email profile';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}`;
  window.location.href = url;
});

// Po návratu z Google OAuth
window.addEventListener('DOMContentLoaded', () => {
  // Zpracování tokenu z URL fragmentu
  if (window.location.pathname === '/auth/google' && window.location.hash) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
      // Získání emailu z tokenu (volání Google API)
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(user => {
          currentUser = { id: user.sub, email: user.email };
          localStorage.setItem('fantasy_user', JSON.stringify(currentUser));
          // PŘESMĚROVÁNÍ NA HLAVNÍ STRÁNKU
          window.location.href = '/';
        });
      // Zastavíme další provádění skriptu na této dočasné stránce
      return;
    }
  } else {
    // Pokud je uživatel uložen v localStorage
    const user = localStorage.getItem('fantasy_user');
    if (user) {
      currentUser = JSON.parse(user);
      showUser();
      loadHistory();
    }
  }
  loadCredits();
});

function showUser() {
  if (currentUser) {
    loginBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userEmailSpan.textContent = `Přihlášen: ${currentUser.email}`;
    saveBtn.classList.remove('hidden');
    historySection.classList.remove('hidden');
  } else {
    loginBtn.classList.remove('hidden');
    userInfo.classList.add('hidden');
  }
  loadCredits();
}

// Logika pro odhlášení
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('fantasy_user');
    if (currentUser) {
        localStorage.removeItem('fantasy_history_' + currentUser.id);
    }
    currentUser = null;
    currentHistory = [];
    showUser();
    renderHistory();
});

// Zde byl dříve API klíč, nyní bude načítán z backendu
const OPENAI_API_KEY = ''; // Tento klíč se již nepoužívá, nechávám pro integritu kódu

// Překladová logika
async function translateText() {
  const now = Date.now();
  if (now - lastTranslateTime < 3000) {
    outputBox.textContent = 'Počkej prosím pár sekund mezi překlady.';
    return;
  }
  lastTranslateTime = now;
  loadCredits();
  if (currentCredits <= 0) {
    outputBox.textContent = 'Vyčerpal jsi dnešní kredity.';
    return;
  }
  const from = fromLang.value;
  const to = toLang.value;
  const text = inputText.value.trim();
  if (!text || from === to) {
    outputBox.textContent = '';
    return;
  }
  // Načti slovníky
  const dictFrom = from === 'cs' ? await loadDict(to) : await loadDict(from);
  const dictTo = to === 'cs' ? await loadDict(from) : await loadDict(to);
  // Rozděl text na slova
  const words = text.split(/\s+/);
  let translated = words.map(word => {
    if (from === 'cs') {
      return dictFrom[word.toLowerCase()] || word;
    } else if (to === 'cs') {
      const found = Object.entries(dictTo).find(([cz, fj]) => fj === word.toLowerCase());
      return found ? found[0] : word;
    } else {
      const cz = Object.entries(dictTo).find(([cz, fj]) => fj === word.toLowerCase());
      return cz ? (dictFrom[cz[0]] || word) : word;
    }
  });
  // Pokud je většina slov nepřeložena, použij OpenAI API
  const untranslatedCount = translated.filter((w, i) => w === words[i]).length;
  let usedCredits = 0;
  if (untranslatedCount > words.length / 2) { // ODSTRANĚNA KONTROLA && OPENAI_API_KEY
    if (currentCredits < words.length) {
      outputBox.textContent = 'Nemáš dostatek kreditů na překlad této věty.';
      return;
    }
    outputBox.textContent = 'Probíhá magický překlad...';
    const openaiResult = await openaiTranslate(text, from, to);
    outputBox.textContent = openaiResult || translated.join(' ');
    
    // Odečti kredity pouze pokud překlad proběhl úspěšně
    if (openaiResult && !openaiResult.startsWith('[')) {
        usedCredits = words.length;
    } else {
        usedCredits = 0; // Neodečítej kredity, pokud nastala chyba
    }
    
  } else {
    outputBox.textContent = translated.join(' ');
    // Slovníkový překlad neodečítá kredity
    usedCredits = 0;
  }
  if (usedCredits > 0) useCredits(usedCredits);
}

async function loadDict(lang) {
  if (!DICTIONARIES[lang]) return {};
  const res = await fetch(DICTIONARIES[lang]);
  return res.json();
}

async function openaiTranslate(text, from, to) {
  // Nyní voláme náš vlastní backend proxy
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, from, to })
    });
    
    if (res.status === 429) {
      return '[Překročil jsi limit OpenAI API. Počkej pár minut a zkus to znovu.]';
    }
    if (!res.ok) {
        const errData = await res.json();
        console.error('Chyba z proxy serveru:', errData);
        return '[Chyba překladu přes server]';
    }

    const data = await res.json();
    return data.choices && data.choices[0] && data.choices[0].message.content.trim();
  } catch (e) {
    console.error('Chyba při volání proxy serveru:', e);
    return '[Chyba připojení k překladovému serveru]';
  }
}

translateBtn.addEventListener('click', translateText);

// Ukládání historie
saveBtn.addEventListener('click', () => {
  if (!currentUser) return;
  const entry = {
    from: fromLang.value,
    to: toLang.value,
    input: inputText.value,
    output: outputBox.textContent,
    date: new Date().toISOString(),
  };
  currentHistory.unshift(entry);
  localStorage.setItem('fantasy_history_' + currentUser.id, JSON.stringify(currentHistory));
  renderHistory();
});

function loadHistory() {
  if (!currentUser) return;
  const data = localStorage.getItem('fantasy_history_' + currentUser.id);
  currentHistory = data ? JSON.parse(data) : [];
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  currentHistory.forEach((item, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.input} <b>→</b> ${item.output}</span> <button data-idx="${idx}" class="fantasy-btn">Smazat</button>`;
    historyList.appendChild(li);
  });
}

historyList.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    const idx = e.target.getAttribute('data-idx');
    currentHistory.splice(idx, 1);
    localStorage.setItem('fantasy_history_' + currentUser.id, JSON.stringify(currentHistory));
    renderHistory();
  }
});

clearHistoryBtn.addEventListener('click', () => {
  if (!currentUser) return;
  currentHistory = [];
  localStorage.removeItem('fantasy_history_' + currentUser.id);
  renderHistory();
}); 