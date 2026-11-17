/**
 * Diyetisyen Makale Bulucu
 * PubMed E-Utilities API Entegrasyonu & UI Yönetimi
 */

// Hazır arama konuları ve PubMed sorgu eşleşmeleri
const PRESET_TOPICS = [
  { label: "Diyabet ve beslenme", query: "type 2 diabetes AND nutrition" },
  { label: "Obezite ve beslenme", query: "obesity AND diet" },
  { label: "Akdeniz diyeti", query: "Mediterranean diet" },
  { label: "Anne ve çocuk beslenmesi", query: "maternal nutrition OR child nutrition" },
  { label: "Sporcu beslenmesi", query: "sports nutrition" },
  { label: "Bağırsak mikrobiyotası", query: "gut microbiota AND diet" },
  { label: "Fonksiyonel besinler", query: "functional foods" },
  { label: "Yaşlılıkta beslenme", query: "older adults AND nutrition" },
  { label: "Malnütrisyon ve tarama", query: "malnutrition AND nutrition screening" },
  { label: "Çölyak ve glütensiz diyet", query: "celiac disease AND gluten-free diet" }
];

// DOM Elemanları
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const clearBtn = document.getElementById("clear-btn");
const btnText = searchBtn.querySelector(".btn-text");
const btnSpinner = searchBtn.querySelector(".btn-spinner");
const presetChipsContainer = document.getElementById("preset-chips");

const resultsSection = document.getElementById("results-section");
const resultsStatusBar = document.getElementById("results-status-bar");
const statusQueryText = document.getElementById("status-query-text");
const statusCountBadge = document.getElementById("status-count-badge");

const welcomeState = document.getElementById("welcome-state");
const loadingState = document.getElementById("loading-state");
const loadingQueryDesc = document.getElementById("loading-query-desc");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const errorMsgText = document.getElementById("error-msg-text");
const retryBtn = document.getElementById("retry-btn");
const articlesList = document.getElementById("articles-list");

// Arama durumu hafızası
let currentSearchTerm = "";
let currentDisplayTitle = "";
let lastFailedSearch = null;

// Başlangıç Yapılandırması
document.addEventListener("DOMContentLoaded", () => {
  renderPresetChips();
  setupEventListeners();
});

/**
 * Hazır arama konusu butonlarını render eder
 */
function renderPresetChips() {
  presetChipsContainer.innerHTML = "";
  PRESET_TOPICS.forEach((topic, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "preset-chip";
    chip.textContent = topic.label;
    chip.dataset.query = topic.query;
    chip.dataset.label = topic.label;
    chip.dataset.index = index;

    chip.addEventListener("click", () => {
      // Aktif chip stilini güncelle
      document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      // Arama kutusuna Türkçe başlığı yaz
      searchInput.value = topic.label;
      toggleClearBtn();

      // PubMed araması başlat
      executeSearch(topic.query, topic.label);
    });

    presetChipsContainer.appendChild(chip);
  });
}

/**
 * Event Listener'ları bağlar
 */
function setupEventListeners() {
  // Form submit (Arama kutusu ile arama)
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) {
      searchInput.focus();
      return;
    }

    // Eğer girilen metin hazır konulardan biriyle eşleşiyorsa onun İngilizce sorgusunu kullan
    const matchedPreset = PRESET_TOPICS.find(
      p => p.label.toLowerCase() === query.toLowerCase()
    );

    // Tüm chip'lerin aktifliğini temizle, eşleşen varsa onu aktif yap
    document.querySelectorAll(".preset-chip").forEach(c => {
      if (matchedPreset && c.dataset.label === matchedPreset.label) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });

    if (matchedPreset) {
      executeSearch(matchedPreset.query, matchedPreset.label);
    } else {
      executeSearch(query, query);
    }
  });

  // Temizle düğmesi
  searchInput.addEventListener("input", toggleClearBtn);
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    toggleClearBtn();
    document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
    searchInput.focus();
  });

  // Hata durumunda yeniden dene
  retryBtn.addEventListener("click", () => {
    if (lastFailedSearch) {
      executeSearch(lastFailedSearch.term, lastFailedSearch.display);
    }
  });
}

function toggleClearBtn() {
  if (searchInput.value.trim().length > 0) {
    clearBtn.classList.remove("hidden");
  } else {
    clearBtn.classList.add("hidden");
  }
}

/**
 * PubMed Aramasını Yürütür
 * @param {string} pubmedTerm - PubMed'e gönderilecek sorgu
 * @param {string} displayLabel - Kullanıcıya gösterilecek arama adı
 */
async function executeSearch(pubmedTerm, displayLabel) {
  currentSearchTerm = pubmedTerm;
  currentDisplayTitle = displayLabel;
  lastFailedSearch = null;

  setLoadingState(true, displayLabel);

  try {
    // 1. Adım: esearch ile ilgili makale ID'lerini (PMID) çek
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(pubmedTerm)}&retmode=json&retmax=15&sort=pub_date`;
    
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      throw new Error(`PubMed arama servisi yanıt vermedi (${searchRes.status})`);
    }

    const searchData = await searchRes.json();
    const esearchResult = searchData.esearchresult;

    if (!esearchResult || !esearchResult.idlist || esearchResult.idlist.length === 0) {
      showEmptyState(displayLabel);
      return;
    }

    const totalCount = parseInt(esearchResult.count, 10) || esearchResult.idlist.length;
    const idList = esearchResult.idlist;

    // 2. Adım: efetch ile makale detaylarını (başlık, yıl, dergi, özet) XML olarak çek
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${idList.join(",")}&retmode=xml`;
    
    const fetchRes = await fetch(fetchUrl);
    if (!fetchRes.ok) {
      throw new Error(`PubMed makale detayları alınamadı (${fetchRes.status})`);
    }

    const xmlText = await fetchRes.text();
    const articles = parsePubMedXml(xmlText);

    if (!articles || articles.length === 0) {
      showEmptyState(displayLabel);
      return;
    }

    // Sonuçları ekrana bas
    renderArticles(articles, displayLabel, totalCount);

  } catch (err) {
    console.error("PubMed arama hatası:", err);
    lastFailedSearch = { term: pubmedTerm, display: displayLabel };
    showErrorState(err.message || "PubMed sunucularına bağlanırken bir hata oluştu.");
  } finally {
    setLoadingState(false);
  }
}

/**
 * PubMed XML Yanıtını Parse Eder
 * @param {string} xmlString 
 * @returns {Array<Object>} Makale listesi
 */
function parsePubMedXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");

  // Parser hatası kontrolü
  if (xmlDoc.querySelector("parsererror")) {
    console.warn("XML parse uyarısı, standart element arama deneniyor.");
  }

  const articleNodes = xmlDoc.querySelectorAll("PubmedArticle, PubmedBookArticle");
  const parsedArticles = [];

  articleNodes.forEach(node => {
    try {
      // 1. PMID
      const pmidNode = node.querySelector("MedlineCitation > PMID") || node.querySelector("PMID");
      const pmid = pmidNode ? pmidNode.textContent.trim() : "";

      // 2. Başlık (ArticleTitle veya BookTitle)
      const titleNode = node.querySelector("ArticleTitle") || node.querySelector("BookTitle");
      let title = titleNode ? titleNode.textContent.trim() : "Başlık bilgisi bulunamadı";
      // Sondaki noktayı temizle
      if (title.endsWith(".")) {
        title = title.slice(0, -1);
      }

      // 3. Yayın Yılı
      let year = "";
      const yearNode = node.querySelector("JournalIssue PubDate Year") ||
                       node.querySelector("ArticleDate Year") ||
                       node.querySelector("JournalIssue PubDate MedlineDate") ||
                       node.querySelector("BookDocument Book PubDate Year");
      
      if (yearNode) {
        const rawYear = yearNode.textContent.trim();
        const yearMatch = rawYear.match(/\b(19\d\d|20\d\d)\b/);
        year = yearMatch ? yearMatch[1] : rawYear;
      }

      // Yıl hala bulunamadıysa DateCompleted veya DateRevised dene
      if (!year) {
        const altYearNode = node.querySelector("DateCompleted Year") || node.querySelector("DateRevised Year");
        if (altYearNode) {
          year = altYearNode.textContent.trim();
        }
      }

      if (!year) {
        year = "Tarih belirtilmemiş";
      }

      // 4. Dergi Adı
      let journal = "";
      const journalTitleNode = node.querySelector("Journal > Title");
      const journalIsoNode = node.querySelector("Journal > ISOAbbreviation");
      const journalMedlineNode = node.querySelector("MedlineJournalInfo > MedlineTA");
      const bookTitleNode = node.querySelector("Book > BookTitle");

      if (journalTitleNode && journalTitleNode.textContent.trim()) {
        journal = journalTitleNode.textContent.trim();
      } else if (journalIsoNode && journalIsoNode.textContent.trim()) {
        journal = journalIsoNode.textContent.trim();
      } else if (journalMedlineNode && journalMedlineNode.textContent.trim()) {
        journal = journalMedlineNode.textContent.trim();
      } else if (bookTitleNode && bookTitleNode.textContent.trim()) {
        journal = bookTitleNode.textContent.trim();
      } else {
        journal = "Dergi bilgisi yok";
      }

      // 5. Orijinal Özet (Abstract)
      const abstractNodes = node.querySelectorAll("Abstract > AbstractText");
      let abstract = "";

      if (abstractNodes && abstractNodes.length > 0) {
        const sections = [];
        abstractNodes.forEach(absNode => {
          const label = absNode.getAttribute("Label");
          const text = absNode.textContent.trim();
          if (text) {
            if (label && label.trim()) {
              sections.push(`${label.trim()}: ${text}`);
            } else {
              sections.push(text);
            }
          }
        });
        abstract = sections.join("\n\n");
      }

      // AGENTS.md kuralı: "Makalenin özeti yoksa 'Bu makalenin özeti PubMed’de bulunmuyor' yaz."
      const hasAbstract = abstract.trim().length > 0;
      const displayAbstract = hasAbstract 
        ? abstract 
        : "Bu makalenin özeti PubMed’de bulunmuyor";

      parsedArticles.push({
        pmid,
        title,
        year,
        journal,
        abstract: displayAbstract,
        hasAbstract,
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "https://pubmed.ncbi.nlm.nih.gov/"
      });

    } catch (e) {
      console.error("Makale parse hatası:", e);
    }
  });

  return parsedArticles;
}

/**
 * Makale Kartlarını Ekrana Basar
 */
function renderArticles(articles, queryLabel, totalCount) {
  hideAllStates();

  // Status Bar güncelle
  statusQueryText.textContent = `"${queryLabel}" için sonuçlar`;
  statusCountBadge.textContent = `${totalCount.toLocaleString("tr-TR")} kayıt bulundu (${articles.length} makale listelendi)`;
  resultsStatusBar.classList.remove("hidden");

  // Kartları oluştur
  articlesList.innerHTML = "";

  articles.forEach((art, idx) => {
    const card = document.createElement("article");
    card.className = "article-card";

    // Güvenli HTML escape
    const safeTitle = escapeHtml(art.title);
    const safeJournal = escapeHtml(art.journal);
    const safeYear = escapeHtml(art.year);
    const safePmid = escapeHtml(art.pmid);
    const safeAbstract = escapeHtml(art.abstract);

    // Uzun özetler için satır sonlarını koru
    const abstractClass = art.hasAbstract ? "article-abstract" : "article-abstract no-abstract";

    card.innerHTML = `
      <div class="card-meta">
        <span class="meta-badge badge-year" title="Yayın Yılı">
          📅 ${safeYear}
        </span>
        <span class="meta-badge badge-journal" title="${safeJournal}">
          📖 ${safeJournal}
        </span>
        ${safePmid ? `<span class="meta-badge badge-pmid" title="PubMed ID">PMID: ${safePmid}</span>` : ""}
      </div>
      
      <h2 class="article-title">
        <a href="${art.url}" target="_blank" rel="noopener noreferrer" title="PubMed'de aç">
          ${safeTitle}
        </a>
      </h2>

      <div class="abstract-container">
        <div class="abstract-label">Özet</div>
        <div class="${abstractClass}">${safeAbstract}</div>
      </div>

      <div class="card-actions">
        <a href="${art.url}" target="_blank" rel="noopener noreferrer" class="btn-pubmed" title="PubMed üzerinde tam kaydı incele">
          <span>PubMed’de Aç</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>
    `;

    articlesList.appendChild(card);
  });

  articlesList.classList.remove("hidden");

  // Mobil cihazlarda veya aşağıda kalmışsa sonuçların başına yumuşak kaydır
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Durum Yönetimi (Loading, Empty, Error, Welcome)
 */
function setLoadingState(isLoading, queryLabel = "") {
  if (isLoading) {
    hideAllStates();
    loadingState.classList.remove("hidden");
    loadingQueryDesc.textContent = queryLabel 
      ? `"${queryLabel}" konusu için güncel yayınlar ve özetler getiriliyor...` 
      : "PubMed kayıtları taranıyor...";
    
    searchBtn.disabled = true;
    btnText.textContent = "Aranıyor...";
    btnSpinner.classList.remove("hidden");
  } else {
    searchBtn.disabled = false;
    btnText.textContent = "Makale Ara";
    btnSpinner.classList.add("hidden");
  }
}

function showEmptyState(queryLabel) {
  hideAllStates();
  document.getElementById("empty-msg-text").textContent = 
    `"${queryLabel}" araması için PubMed'de eşleşen herhangi bir bilimsel makale bulunamadı. Lütfen anahtar kelimeleri kontrol edin veya yukarıdaki hazır konulardan birini deneyin.`;
  emptyState.classList.remove("hidden");
}

function showErrorState(message) {
  hideAllStates();
  errorMsgText.textContent = message || "PubMed sunucularına bağlanırken bir sorun meydana geldi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.";
  errorState.classList.remove("hidden");
}

function hideAllStates() {
  welcomeState.classList.add("hidden");
  loadingState.classList.add("hidden");
  emptyState.classList.add("hidden");
  errorState.classList.add("hidden");
  resultsStatusBar.classList.add("hidden");
  articlesList.classList.add("hidden");
}

/**
 * XSS koruması için HTML karakterlerini escape eder
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
