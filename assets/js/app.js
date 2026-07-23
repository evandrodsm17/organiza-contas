import { FirebaseService } from "./firebase-service.js";

const app = document.querySelector("#app");
const toastArea = document.querySelector("#toastArea");
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const state = {
  user: null,
  profile: null,
  managements: [],
  selected: null,
  transactions: [],
  cards: [],
  month: new Date().toISOString().slice(0, 7),
  view: "dashboard",
  calendarLayout:
    localStorage.getItem("organiza-calendar-layout") ||
    (matchMedia("(max-width: 760px)").matches ? "agenda" : "grid"),
  calendarFilters: { query: "", expenseCategory: "", cardId: "", sort: "date" },
  dashboardGroupOpen: { upcoming: true, previous: false },
  users: [],
};
let stopManagements = () => {},
  stopTransactions = () => {},
  stopCards = () => {},
  stopUsers = () => {};
let calendarSearchTimer = 0;
let voiceRecognition = null;
let voiceListening = false;
let voiceFinalizeCapture = null;
document.documentElement.dataset.theme =
  localStorage.getItem("organiza-theme") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const categories = {
  expense: [
    "Cartão",
    "Água",
    "Energia",
    "Celular",
    "Internet",
    "Alimentação",
    "Moradia",
    "Transporte",
    "Saúde",
    "Educação",
    "Lazer",
    "Impostos",
    "Acordos e dívidas",
    "Outros",
  ],
  income: [
    "Salário",
    "Aluguel",
    "Freelance",
    "Benefício",
    "Rendimento",
    "Reembolso",
    "Venda",
    "Outros",
  ],
};

const voiceLexicon = {
  create: [
    "adicionar",
    "adicione",
    "adiciona",
    "anotar",
    "anote",
    "anota",
    "botar",
    "bote",
    "bota",
    "cadastrar",
    "cadastre",
    "cadastra",
    "colocar",
    "coloque",
    "coloca",
    "criar",
    "crie",
    "cria",
    "incluir",
    "inclua",
    "inclui",
    "lançar",
    "lance",
    "lança",
    "registrar",
    "registre",
    "registra",
    "põe",
    "poe",
  ],
  expense: [
    "despesa",
    "conta",
    "gasto",
    "débito",
    "boleto",
    "pagamento",
    "saída",
    "valor para pagar",
  ],
  income: [
    "receita",
    "entrada",
    "ganho",
    "recebimento",
    "dinheiro que entrou",
    "valor recebido",
  ],
  save: [
    "salvar",
    "salve",
    "salva",
    "gravar",
    "grave",
    "grava",
    "confirmar",
    "confirme",
    "confirma",
    "finalizar",
    "finalize",
    "finaliza",
  ],
  paid: [
    "paguei",
    "quitei",
    "quitado",
    "quitada",
    "pago",
    "paga",
    "já foi pago",
    "já foi paga",
    "dei baixa",
    "dar baixa",
    "dá baixa",
    "baixar pagamento",
  ],
  received: [
    "recebi",
    "recebido",
    "recebida",
    "já caiu",
    "caiu na conta",
    "dinheiro caiu",
    "entrou na conta",
  ],
  filter: [
    "filtrar",
    "filtre",
    "filtra",
    "mostrar só",
    "mostre só",
    "mostra só",
    "quero só",
    "somente",
  ],
  search: [
    "buscar",
    "busque",
    "busca",
    "pesquisar",
    "pesquise",
    "pesquisa",
    "procurar",
    "procure",
    "procura",
    "achar",
    "ache",
    "acha",
    "encontrar",
    "encontre",
    "encontra",
  ],
  open: [
    "abrir",
    "abra",
    "mostrar",
    "mostre",
    "ver",
    "ir para",
    "vá para",
    "vai para",
    "vai pra",
    "me leva para",
    "voltar para",
  ],
  filler: [
    "por favor",
    "por gentileza",
    "pra mim",
    "para mim",
    "aí pra mim",
    "aí",
    "tipo assim",
    "eu quero que",
    "quero que você",
    "gostaria que você",
    "preciso que você",
    "você pode",
    "pode",
  ],
};

const voiceCategoryAliases = {
  expense: [
    [
      ["fatura", "cartão de crédito", "cartão", "crédito"],
      "Cartão",
    ],
    [
      ["água", "conta de água", "saneamento", "sabesp", "copasa"],
      "Água",
    ],
    [
      ["luz", "conta de luz", "energia", "eletricidade", "enel", "cemig"],
      "Energia",
    ],
    [
      ["celular", "telefone", "telefonia", "recarga", "plano móvel"],
      "Celular",
    ],
    [
      [
        "internet",
        "wi-fi",
        "wifi",
        "banda larga",
        "fibra",
        "provedor",
        "net",
      ],
      "Internet",
    ],
    [
      [
        "alimentação",
        "comida",
        "mercado",
        "supermercado",
        "feira",
        "padaria",
        "restaurante",
        "lanche",
        "ifood",
      ],
      "Alimentação",
    ],
    [
      ["moradia", "aluguel", "condomínio", "casa", "prestação da casa"],
      "Moradia",
    ],
    [
      ["imposto", "impostos", "iptu", "ipva", "tributo", "taxa pública"],
      "Impostos",
    ],
    [
      [
        "transporte",
        "carro",
        "combustível",
        "gasolina",
        "etanol",
        "uber",
        "ônibus",
        "passagem",
        "estacionamento",
        "pedágio",
      ],
      "Transporte",
    ],
    [
      [
        "saúde",
        "médico",
        "remédio",
        "farmácia",
        "consulta",
        "dentista",
        "plano de saúde",
      ],
      "Saúde",
    ],
    [
      [
        "educação",
        "escola",
        "faculdade",
        "curso",
        "material escolar",
        "mensalidade escolar",
      ],
      "Educação",
    ],
    [
      [
        "lazer",
        "passeio",
        "cinema",
        "viagem",
        "diversão",
        "streaming",
        "netflix",
      ],
      "Lazer",
    ],
    [
      [
        "acordo",
        "renegociação",
        "dívida",
        "dívidas",
        "parcela do acordo",
        "serasa",
      ],
      "Acordos e dívidas",
    ],
    [["outro", "outros", "diversos"], "Outros"],
  ],
  income: [
    [
      ["salário", "salario", "pagamento do trabalho", "ordenado"],
      "Salário",
    ],
    [
      ["aluguel recebido", "aluguel", "locação", "inquilino"],
      "Aluguel",
    ],
    [
      ["freelance", "freela", "bico", "trabalho extra", "serviço por fora"],
      "Freelance",
    ],
    [
      [
        "benefício",
        "pensão",
        "aposentadoria",
        "auxílio",
        "inss",
      ],
      "Benefício",
    ],
    [
      ["rendimento", "juros", "investimento", "dividendo"],
      "Rendimento",
    ],
    [["reembolso", "estorno", "devolução"], "Reembolso"],
    [["venda", "vendi"], "Venda"],
    [["outro", "outros", "diversos"], "Outros"],
  ],
};

const categoryIcons = {
  expense: {
    "Cartão": "credit-card",
    Água: "droplet",
    Energia: "bolt",
    Celular: "smartphone",
    Internet: "wifi",
    Alimentação: "utensils",
    Moradia: "home",
    Transporte: "car",
    Saúde: "heart",
    Educação: "book",
    Lazer: "gamepad",
    Impostos: "receipt",
    "Acordos e dívidas": "handshake",
    Outros: "tag",
  },
  income: {
    Salário: "banknote",
    Aluguel: "home",
    Freelance: "laptop",
    Benefício: "gift",
    Rendimento: "trending-up",
    Reembolso: "rotate-ccw",
    Venda: "shopping-bag",
    Outros: "wallet",
  },
};

function categoryIconName(item) {
  const type = item?.type === "income" ? "income" : "expense";
  return categoryIcons[type][item?.category] || (type === "income" ? "wallet" : "tag");
}

function categoryIconBadge(item, baseClass = "cat-icon") {
  const tone = item?.type === "income" ? "income-icon" : "expense-icon";
  const label = item?.category || "Outros";
  return `<span class="${baseClass} ${tone}" title="${attr(label)}" aria-hidden="true">${icon(categoryIconName(item))}</span>`;
}

FirebaseService.observeAuth(async (user) => {
  cleanupObservers();
  state.user = user;
  if (!user) {
    state.profile = null;
    state.managements = [];
    state.selected = null;
    state.transactions = [];
    state.cards = [];
    renderPublic();
    return;
  }
  try {
    state.profile = await FirebaseService.profile(user.uid);
    if (!state.profile?.active)
      throw new Error(
        "Seu acesso está inativo ou ainda não foi autorizado pelo master.",
      );
    observeManagements();
  } catch (error) {
    toast(error.message, "danger");
    await FirebaseService.logout();
  }
});

function cleanupObservers() {
  stopManagements();
  stopTransactions();
  stopCards();
  stopUsers();
  stopManagements = stopTransactions = stopCards = stopUsers = () => {};
}

function renderPublic(showLogin = false) {
  app.innerHTML = `<header class="public-header"><a class="brand" href="#"><img class="brand-logo" src="assets/logo.png" alt=""><span>OrganizaContas</span></a><div class="public-actions">${themeButton()}<button class="btn btn-ghost" id="loginOpen">Entrar</button></div></header>
  <main><section class="hero"><div class="hero-copy"><span class="eyebrow">FINANÇAS EM CONJUNTO</span><h1>As contas do mês,<br><em>claras para todos.</em></h1><p>Organize receitas, vencimentos, pagamentos e comprovantes em um calendário compartilhado com quem cuida das finanças com você.</p><button class="btn btn-primary" id="heroLogin">Acessar meu espaço <span>→</span></button><div class="hero-points"><span>✓ Calendário mensal</span><span>✓ Acesso compartilhado</span><span>✓ Comprovantes seguros</span></div></div>
  <div class="hero-visual"><div class="mock-card"><div class="mock-head"><span>Resumo de julho</span><b>${money.format(5280)}</b></div><div class="mock-progress"><i></i></div><div class="mock-row">${categoryIconBadge({ type: "expense", category: "Energia" })}<div><b>Energia</b><small>Vence dia 12</small></div><strong>${money.format(219.4)}</strong></div><div class="mock-row">${categoryIconBadge({ type: "income", category: "Salário" })}<div><b>Salário</b><small>Recebido dia 05</small></div><strong class="positive">+ ${money.format(4800)}</strong></div><div class="mock-row">${categoryIconBadge({ type: "expense", category: "Internet" })}<div><b>Internet</b><small>Pago antecipado</small></div><span class="pill paid">Pago</span></div></div></div></section>
  <section class="how"><span class="eyebrow">COMO FUNCIONA</span><h2>Do vencimento ao comprovante</h2><div class="feature-grid">${feature("01", "Crie seu espaço", "Separe as finanças da casa, de uma viagem ou de qualquer planejamento compartilhado.")}${feature("02", "Registre tudo", "Adicione entradas e débitos com vencimento, data planejada e categorias personalizadas.")}${feature("03", "Compartilhe", "Convide outra pessoa para consultar, incluir e atualizar os mesmos registros.")}${feature("04", "Confirme o pagamento", "Informe a data real e anexe imagem ou PDF do comprovante quando precisar.")}</div></section></main>
  <footer>OrganizaContas · Organização financeira sem complicação</footer>${showLogin ? loginModal() : ""}`;
  document.querySelector("#loginOpen").onclick = () => renderPublic(true);
  document.querySelector("#heroLogin").onclick = () => renderPublic(true);
  document.querySelector("#themeToggle").onclick = toggleTheme;
  bindLogin();
}

function feature(number, title, text) {
  return `<article class="feature"><span>${number}</span><h3>${title}</h3><p>${text}</p></article>`;
}
function loginModal() {
  return `<div class="modal-backdrop auth-backdrop"><form class="modal login-modal" id="loginForm"><button class="modal-close" type="button" id="closeModal" aria-label="Fechar">×</button><div class="auth-brand logo-only"><img class="auth-logo" src="assets/logo.png" alt="OrganizaContas"></div><span class="eyebrow">ÁREA SEGURA</span><h2>Bem-vindo de volta</h2><p>Acesse seu espaço financeiro compartilhado.</p><button class="google-login" id="googleLogin" type="button">${googleIcon()}<span>Continuar com Google</span></button><div class="auth-divider"><span>ou entre com e-mail</span></div><label>E-mail<input name="email" type="email" autocomplete="username" placeholder="voce@exemplo.com" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required></label><button class="btn btn-primary wide" type="submit">Entrar na minha conta</button><small class="auth-note">Acesso exclusivo para usuários autorizados.</small><small id="configHint"></small></form></div>`;
}
function bindLogin() {
  const form = document.querySelector("#loginForm");
  if (!form) return;
  document.querySelector("#closeModal").onclick = () => renderPublic();
  document.querySelector("#googleLogin").onclick = async (event) => {
    const button = event.currentTarget;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "Conectando...";
    try {
      await FirebaseService.loginWithGoogle();
    } catch (error) {
      if (error.code !== "auth/popup-closed-by-user")
        toast(
          error.code === "auth/operation-not-allowed"
            ? "Ative o provedor Google no Firebase Authentication."
            : "Não foi possível entrar com Google.",
          "danger",
        );
      button.disabled = false;
      button.innerHTML = original;
    }
  };
  if (!FirebaseService.isConfigured())
    document.querySelector("#configHint").textContent =
      "Firebase ainda não configurado. Consulte FIREBASE_SETUP.md.";
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    busy(button, true);
    try {
      await FirebaseService.login(form.email.value, form.password.value);
    } catch {
      toast("E-mail ou senha inválidos.", "danger");
      busy(button, false);
    }
  };
}

function observeManagements() {
  stopManagements = FirebaseService.observeManagements(
    state.user.uid,
    (items) => {
      state.managements = items;
      const selectedId = state.selected?.id;
      state.selected =
        items.find((item) => item.id === selectedId) || items[0] || null;
      if (state.selected?.id !== selectedId) observeSelectedManagement();
      renderApp();
    },
    firebaseError,
  );
}
function observeTransactions() {
  stopTransactions();
  state.transactions = [];
  if (!state.selected) return;
  stopTransactions = FirebaseService.observeTransactions(
    state.selected.id,
    (items) => {
      state.transactions = items;
      renderApp();
    },
    firebaseError,
  );
}

function observeCards() {
  stopCards();
  state.cards = [];
  if (!state.selected) return;
  stopCards = FirebaseService.observeCards(
    state.selected.id,
    (items) => {
      state.cards = items;
      const recordForm = document.querySelector("#recordForm");
      if (recordForm) refreshRecordCardField(recordForm);
      else renderApp();
    },
    firebaseError,
  );
}

function observeSelectedManagement() {
  observeTransactions();
  observeCards();
}

function renderApp() {
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${state.month}-01T12:00:00Z`));
  app.innerHTML = `<div class="app-shell"><aside><a class="brand brand-light" href="#"><img class="brand-logo" src="assets/logo.png" alt=""><span>OrganizaContas</span></a><div class="profile"><span>${initials(state.profile.name)}</span><div><b>${esc(state.profile.name)}</b><small>${state.profile.role === "master" ? "Administrador master" : "Usuário"}</small></div></div><nav>${nav("dashboard", "home", "Visão geral")}${nav("calendar", "calendar", "Agenda")}<button class="mobile-new-record" id="mobileNewRecord" aria-label="Criar novo lançamento" title="Novo lançamento" ${!canEdit() ? "disabled" : ""}>${icon("plus")}</button>${nav("settings", "settings", "Configurações")}<button class="nav-item mobile-nav-logout mobile-nav-voice" id="mobileNavVoice" type="button" aria-label="Executar comando de voz" title="Comando de voz">${icon("mic")}<small>Voz</small></button></nav><button class="logout voice-sidebar-command" id="desktopVoiceCommand" type="button">${icon("mic")} Comando de voz</button></aside>
  <main class="workspace"><header class="workspace-head"><div class="workspace-title"><span class="mobile-brand">OrganizaContas</span><h1>${viewTitle()}</h1><p>${state.selected ? esc(state.selected.name) : "Crie seu primeiro gerenciamento"}</p></div><div class="head-actions">${managementSelect()}<button class="btn btn-primary" id="newRecord" ${!canEdit() ? "disabled" : ""}>${icon("plus")}<span>Novo lançamento</span></button></div></header>
  ${state.view === "users" ? renderUsers() : state.view === "settings" ? renderSettings(monthName) : state.view === "calendar" ? renderCalendar(monthName) : renderDashboard(monthName)}</main></div><div id="modalRoot"></div>`;
  bindShell();
}

function nav(id, iconName, label) {
  const active = state.view === id || (id === "settings" && state.view === "users");
  return `<button class="nav-item ${active ? "active" : ""}" data-view="${id}">${icon(iconName)}<small>${label}</small></button>`;
}
function viewTitle() {
  return {
    dashboard: "Visão geral",
    calendar: "Agenda financeira",
    settings: "Configurações",
    users: "Gestão de usuários",
  }[state.view];
}
function managementSelect() {
  return `<select id="managementSelect"><option value="">${state.managements.length ? "Selecionar gerenciamento" : "Nenhum gerenciamento"}</option>${state.managements.map((item) => `<option value="${item.id}" ${state.selected?.id === item.id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select>`;
}

function monthTransactions() {
  return state.transactions.filter((item) =>
    (item.dueDate || item.plannedDate || "").startsWith(state.month),
  );
}
function totals() {
  const list = monthTransactions();
  return {
    income: sum(list.filter((i) => i.type === "income")),
    expense: sum(list.filter((i) => i.type === "expense")),
    paid: sum(list.filter((i) => i.type === "expense" && i.status === "paid")),
    pending: sum(
      list.filter((i) => i.type === "expense" && i.status !== "paid"),
    ),
  };
}
function sum(items) {
  return items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
}
function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
function cardById(cardId) {
  return state.cards.find((card) => card.id === cardId) || null;
}
function cardNameFor(item) {
  if (item?.category !== "Cartão") return "";
  return (
    cardById(item.cardId)?.name ||
    item.cardSnapshot?.name ||
    "Cartão não informado"
  );
}
function categoryMeta(item) {
  const cardName = cardNameFor(item);
  return cardName ? `${item.category} · ${cardName}` : item.category || "Outros";
}
function validCardColor(value = "") {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#3157d5";
}
function safeLogoUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function cardInkColor(background) {
  const hex = validCardColor(background).slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
function cardSnapshot(card) {
  return card
    ? {
        name: card.name,
        holderName: card.holderName || "",
        logoUrl: card.logoUrl || "",
        backgroundColor: validCardColor(card.backgroundColor),
      }
    : null;
}
function cardOptions(selectedId = "", includeArchived = true) {
  return state.cards
    .filter((card) => card.active !== false || (includeArchived && card.id === selectedId))
    .map(
      (card) =>
        `<option value="${attr(card.id)}" ${card.id === selectedId ? "selected" : ""}>${esc(card.name)}${card.active === false ? " (arquivado)" : ""}</option>`,
    )
    .join("");
}
function calendarFiltersActive() {
  const filters = state.calendarFilters;
  return Boolean(
    filters.query.trim() ||
      filters.expenseCategory ||
      filters.cardId ||
      filters.sort !== "date",
  );
}
function filteredCalendarTransactions() {
  const filters = state.calendarFilters;
  const query = normalizeSearch(filters.query);
  let items = monthTransactions().slice();
  if (query) {
    items = items.filter((item) =>
      normalizeSearch(item.description).includes(query),
    );
  }
  if (filters.expenseCategory) {
    items = items.filter(
      (item) =>
        item.type === "expense" &&
        item.category === filters.expenseCategory,
    );
  }
  if (filters.cardId) {
    items = items.filter((item) => item.cardId === filters.cardId);
  }
  return items.sort((a, b) => {
    if (filters.sort === "amount-asc" || filters.sort === "amount-desc") {
      const direction = filters.sort === "amount-asc" ? 1 : -1;
      const amountDifference =
        (Number(a.amount || 0) - Number(b.amount || 0)) * direction;
      if (amountDifference) return amountDifference;
    }
    return (
      String(a.dueDate || "").localeCompare(String(b.dueDate || "")) ||
      String(a.description || "").localeCompare(
        String(b.description || ""),
        "pt-BR",
      )
    );
  });
}
function expenseFilterCategories() {
  const known = categories.expense.slice();
  monthTransactions()
    .filter((item) => item.type === "expense" && item.category)
    .forEach((item) => {
      if (!known.includes(item.category)) known.push(item.category);
    });
  return known;
}
function renderCalendarFilters(filteredItems) {
  const filters = state.calendarFilters;
  const total = monthTransactions().length;
  const resultLabel = filteredItems.length === 1 ? "resultado" : "resultados";
  const cardFilter =
    filters.expenseCategory === "Cartão"
      ? `<label><span>Cartão</span><select id="cardFilter"><option value="">Todos os cartões</option>${state.cards.map((card) => `<option value="${attr(card.id)}" ${filters.cardId === card.id ? "selected" : ""}>${esc(card.name)}${card.active === false ? " (arquivado)" : ""}</option>`).join("")}</select></label>`
      : "";
  return `<section class="calendar-filters" aria-label="Filtros dos lançamentos"><div class="calendar-filter-fields ${cardFilter ? "has-card-filter" : ""}"><label class="calendar-search-field"><span>Buscar por nome</span><div>${icon("search")}<input id="transactionSearch" type="search" value="${attr(filters.query)}" placeholder="Ex.: aluguel, energia..." autocomplete="off"></div></label><label><span>Categoria de despesa</span><select id="expenseCategoryFilter"><option value="">Todas as categorias</option>${expenseFilterCategories().map((category) => `<option value="${attr(category)}" ${filters.expenseCategory === category ? "selected" : ""}>${esc(category === "Cartão" ? "Fatura de cartão" : category)}</option>`).join("")}</select></label>${cardFilter}<label><span>Ordenar</span><select id="transactionSort"><option value="date" ${filters.sort === "date" ? "selected" : ""}>Data: mais antiga</option><option value="amount-asc" ${filters.sort === "amount-asc" ? "selected" : ""}>Valor: menor primeiro</option><option value="amount-desc" ${filters.sort === "amount-desc" ? "selected" : ""}>Valor: maior primeiro</option></select></label></div><div class="calendar-filter-meta"><span aria-live="polite"><b>${filteredItems.length}</b> ${resultLabel} de ${total}</span>${calendarFiltersActive() ? '<button id="clearCalendarFilters" class="calendar-filter-clear" type="button">Limpar filtros</button>' : ""}</div></section>`;
}
function monthControl() {
  return `<div class="month-control"><button class="month-arrow" data-month="-1" aria-label="Mês anterior" title="Mês anterior">${icon("chevron-left")}</button><label class="month-field"><span>Período</span><input id="monthInput" type="month" value="${state.month}" aria-label="Escolher mês e ano"></label><button class="month-arrow" data-month="1" aria-label="Próximo mês" title="Próximo mês">${icon("chevron-right")}</button><button class="month-today" id="monthToday" type="button">Hoje</button></div>`;
}

function renderDashboard(monthName) {
  if (!state.selected) return emptyManagement();
  const total = totals();
  const list = monthTransactions();
  const dueToday = state.transactions.filter(
    (item) =>
      item.type === "expense" &&
      item.status !== "paid" &&
      item.dueDate === todayKey(),
  );
  return `<div class="content-head">${monthControl(monthName)}<span>${monthTransactions().length} lançamentos no período</span></div>${dueToday.length ? renderTodayAlert(dueToday) : ""}<section class="summary-grid">${summary("Entradas", total.income, "success", "↗", "income")}${summary("Despesas", total.expense, "danger", "↘", "expense")}${summary("Pago", total.paid, "info", "✓", "paid")}${summary("Saldo previsto", total.income - total.expense, total.income - total.expense >= 0 ? "success" : "danger", "=")}</section>${renderPendingPaymentStatus(total)}${renderExpenseInsights(monthName)}<section class="dashboard-grid">${renderBudgetScore(total.expense)}<article class="panel upcoming-panel"><div class="panel-head"><div><h2>Lançamentos do período</h2><p>Organizados em relação à data de hoje</p></div><button class="text-btn" data-go="calendar" data-layout="agenda">Ver na agenda</button></div>${list.length ? renderDashboardGroups(list) : empty("Nenhum lançamento neste mês.")}</article><article class="panel status-panel"><div class="panel-head"><div><h2>Situação das despesas</h2><p>Acompanhamento do mês</p></div></div><div class="donut" style="--paid:${total.expense ? Math.round((total.paid / total.expense) * 100) : 0}"><div><b>${total.expense ? Math.round((total.paid / total.expense) * 100) : 0}%</b><span>pago</span></div></div><div class="legend"><span><i class="dot blue"></i>Pago <b>${money.format(total.paid)}</b></span><span><i class="dot orange"></i>Pendente <b>${money.format(total.pending)}</b></span></div></article></section>`;
}
function renderPendingPaymentStatus(total) {
  if (!total.expense) return "";
  const pendingItems = monthTransactions().filter(
    (item) => item.type === "expense" && item.status !== "paid",
  );
  const overdueCount = pendingItems.filter(
    (item) => item.dueDate && item.dueDate < todayKey(),
  ).length;
  const paidPercent = Math.min(
    100,
    Math.round((total.paid / total.expense) * 100),
  );
  const complete = pendingItems.length === 0;
  const pendingLabel =
    pendingItems.length === 1
      ? "1 despesa aguardando baixa"
      : `${pendingItems.length} despesas aguardando baixa`;
  const statusCopy = complete
    ? "Todas as despesas previstas deste mês já foram marcadas como pagas."
    : `${pendingLabel}${overdueCount ? ` · ${overdueCount} ${overdueCount === 1 ? "está em atraso" : "estão em atraso"}` : ""}.`;
  return `<section class="pending-payment-panel ${complete ? "is-complete" : "has-pending"}" aria-labelledby="pendingPaymentTitle"><span class="pending-payment-icon" aria-hidden="true">${icon(complete ? "shield" : "receipt")}</span><div class="pending-payment-copy"><small>ACOMPANHAMENTO DE PAGAMENTOS</small><h2 id="pendingPaymentTitle">${complete ? "Tudo pago neste mês" : "Ainda falta marcar como pago"}</h2><p>${statusCopy}</p></div><div class="pending-payment-total"><small>${complete ? "Total pago" : "Ainda a pagar"}</small><b>${money.format(complete ? total.paid : total.pending)}</b><span>de ${money.format(total.expense)} em despesas</span></div><div class="pending-payment-progress"><div><span>${paidPercent}% concluído</span><span>${100 - paidPercent}% pendente</span></div><i role="progressbar" aria-label="${paidPercent}% das despesas marcadas como pagas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${paidPercent}"><span style="--payment-progress:${paidPercent}%"></span></i></div><button class="pending-payment-action" type="button" data-summary="${complete ? "paid" : "pending"}">${complete ? "Ver pagamentos" : "Ver pendências"} <span aria-hidden="true">›</span></button></section>`;
}
function expenseCategoryReport() {
  const expenses = monthTransactions().filter((item) => item.type === "expense");
  const grouped = expenses.reduce((acc, item) => {
    const category = item.category || "Outros";
    const current = acc.get(category) || { category, total: 0, count: 0 };
    current.total += Number(item.amount || 0);
    current.count += 1;
    acc.set(category, current);
    return acc;
  }, new Map());
  const total = sum(expenses);
  const ranking = [...grouped.values()]
    .sort((a, b) => b.total - a.total)
    .map((entry) => ({
      ...entry,
      percent: total ? Math.round((entry.total / total) * 100) : 0,
    }));
  return { expenses, ranking, total };
}
function expenseInsightText(report, monthName) {
  const [leader, second] = report.ranking;
  if (!leader) {
    return `Ainda não há despesas registradas em ${monthName}. Quando você adicionar seus débitos, este resumo mostrará onde seu dinheiro está mais concentrado.`;
  }
  const cardExpenses = report.expenses.filter(
    (item) => item.category === "Cartão",
  );
  const cardGroups = cardExpenses.reduce((acc, item) => {
    const name = cardNameFor(item);
    acc.set(name, (acc.get(name) || 0) + Number(item.amount || 0));
    return acc;
  }, new Map());
  const cardRanking = [...cardGroups.entries()].sort((a, b) => b[1] - a[1]);
  const cardTotal = sum(cardExpenses);
  const cardNote = cardRanking.length
    ? ` Entre as faturas, ${cardRanking[0][0]} concentra ${Math.round((cardRanking[0][1] / cardTotal) * 100)}% desse valor.`
    : "";
  if (!second) {
    return `Em ${monthName}, todas as despesas previstas estão concentradas em ${leader.category}, que soma ${money.format(leader.total)}. Conforme novas categorias forem adicionadas, você poderá comparar o peso de cada uma.${cardNote}`;
  }
  const combinedPercent = Math.round(
    ((leader.total + second.total) / report.total) * 100,
  );
  let opening = `Em ${monthName}, ${leader.category} é sua maior fonte de despesa: ${money.format(leader.total)}, ou ${leader.percent}% do total previsto.`;
  if (leader.percent >= 50) {
    opening = `Em ${monthName}, ${leader.category} merece atenção: sozinha, a categoria representa ${leader.percent}% das despesas previstas, somando ${money.format(leader.total)}.`;
  } else if (leader.percent < 35) {
    opening = `As despesas de ${monthName} estão relativamente distribuídas. Ainda assim, ${leader.category} lidera com ${money.format(leader.total)}, equivalente a ${leader.percent}% do total previsto.`;
  }
  return `${opening} Juntas, ${leader.category} e ${second.category} respondem por ${combinedPercent}% dos gastos do mês.${cardNote}`;
}
function renderExpenseInsights(monthName) {
  const report = expenseCategoryReport();
  const visibleCategories = report.ranking.slice(0, 4);
  const categoryRows = visibleCategories.length
    ? `<div class="expense-category-ranking" aria-label="Maiores categorias de despesa">${visibleCategories.map((entry, index) => `<button class="expense-category-row" type="button" data-expense-category="${attr(entry.category)}" aria-label="Filtrar agenda por ${attr(entry.category)}"><span class="expense-category-position">${index + 1}</span>${categoryIconBadge({ type: "expense", category: entry.category })}<span class="expense-category-copy"><span><b>${esc(entry.category)}</b><small>${entry.count} ${entry.count === 1 ? "lançamento" : "lançamentos"}</small></span><i aria-hidden="true"><span style="--category-share:${entry.percent}%"></span></i></span><strong>${money.format(entry.total)}<small>${entry.percent}% do total</small></strong></button>`).join("")}${report.ranking.length > visibleCategories.length ? `<small class="expense-category-more">+ ${report.ranking.length - visibleCategories.length} ${report.ranking.length - visibleCategories.length === 1 ? "categoria" : "categorias"} no mês</small>` : ""}</div>`
    : `<div class="expense-insight-empty">${icon("chart")}<span>O relatório aparecerá assim que houver uma despesa neste período.</span></div>`;
  return `<article class="panel expense-insights-panel"><div class="expense-insights-head"><div><span class="expense-insights-icon">${icon("chart")}</span><span><small>LEITURA DO MÊS</small><h2>Para onde está indo seu dinheiro</h2></span></div><span class="expense-insights-badge">Visão por categoria</span></div><div class="expense-insights-content"><div class="expense-insights-narrative"><p>${esc(expenseInsightText(report, monthName))}</p><div><span><b>${report.ranking.length}</b><small>${report.ranking.length === 1 ? "categoria" : "categorias"}</small></span><span><b>${report.expenses.length}</b><small>${report.expenses.length === 1 ? "despesa" : "despesas"}</small></span><span><b>${money.format(report.total)}</b><small>total previsto</small></span></div></div>${categoryRows}</div></article>`;
}
function renderDashboardGroups(items) {
  const today = todayKey();
  const dateOf = (item) => item.dueDate || item.plannedDate || "";
  const upcoming = items
    .filter((item) => dateOf(item) >= today)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const previous = items
    .filter((item) => dateOf(item) < today)
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  return `<div class="dashboard-record-groups">${upcoming.length ? dashboardRecordGroup("Hoje e próximos", "Vencimentos e recebimentos a partir de hoje", "upcoming", upcoming) : ""}${previous.length ? dashboardRecordGroup("Datas anteriores", "Lançamentos mais recentes primeiro", "previous", previous) : ""}</div>`;
}
function dashboardRecordGroup(title, description, tone, items) {
  const countLabel = items.length === 1 ? "lançamento" : "lançamentos";
  return `<details class="dashboard-record-group ${tone}" data-dashboard-group="${tone}" ${state.dashboardGroupOpen[tone] ? "open" : ""}><summary><div><span aria-hidden="true"></span><div><b>${title}</b><small>${description}</small></div></div><strong><span>${items.length}</span><small>${countLabel}</small></strong></summary><div class="record-list">${items.map(recordRow).join("")}</div></details>`;
}
function expenseLimitForMonth() {
  return Number(state.selected?.monthlyExpenseLimits?.[state.month] || 0);
}
function renderBudgetScore(expense) {
  const limit = expenseLimitForMonth();
  if (!limit) {
    return `<article class="panel budget-score-panel budget-score-empty"><div class="panel-head"><div><h2>Score financeiro</h2><p>Uso do limite de despesas</p></div></div><div class="budget-empty-indicator"><span>—</span><small>Limite não definido</small></div><p>Defina quanto pretende gastar neste mês para acompanhar seu planejamento.</p><button class="text-btn" type="button" data-go="settings">Definir limite mensal</button></article>`;
  }
  const expenseCents = Math.round(expense * 100);
  const limitCents = Math.round(limit * 100);
  const usage = Math.max(0, (expenseCents / limitCents) * 100);
  const percent = Math.round(usage);
  const progress = Math.min(usage, 100).toFixed(2);
  const remaining = (limitCents - expenseCents) / 100;
  let tone = "safe";
  let label = "Dentro do planejado";
  if (expenseCents > limitCents) {
    tone = "over";
    label = "Limite excedido";
  } else if (expenseCents === limitCents) {
    tone = "limit";
    label = "No limite definido";
  } else if (usage >= 80) {
    tone = "warning";
    label = "Próximo do limite";
  }
  return `<article class="panel budget-score-panel score-${tone}"><div class="panel-head"><div><h2>Score financeiro</h2><p>Uso do limite de despesas</p></div><button class="text-btn" type="button" data-go="settings">Ajustar</button></div><div class="budget-gauge" role="img" aria-label="${percent}% do limite mensal utilizado"><svg viewBox="0 0 220 120" aria-hidden="true"><path class="budget-gauge-track" pathLength="100" d="M20 108 A90 90 0 0 1 200 108"></path><path class="budget-gauge-progress" pathLength="100" stroke-dasharray="${progress} 100" d="M20 108 A90 90 0 0 1 200 108"></path></svg><div class="budget-gauge-value"><b>${percent}%</b><span>utilizado</span></div><div class="budget-gauge-scale"><span>0</span><span>50</span><span>100%</span></div></div><div class="budget-score-status"><span></span><div><b>${label}</b><small>${remaining >= 0 ? `${money.format(remaining)} ainda disponíveis` : `${money.format(Math.abs(remaining))} acima do limite`}</small></div></div><div class="budget-score-values"><span>Despesas <b>${money.format(expense)}</b></span><span>Limite <b>${money.format(limit)}</b></span></div></article>`;
}
function renderTodayAlert(items) {
  const total = sum(items);
  return `<section class="today-alert" aria-labelledby="todayDueTitle"><div class="today-alert-heading"><span class="today-alert-icon" aria-hidden="true">!</span><div><strong id="todayDueTitle">Vence hoje</strong><small>${items.length} ${items.length === 1 ? "despesa pendente" : "despesas pendentes"} · ${money.format(total)}</small></div></div><div class="today-alert-list">${items.map((item) => `<button class="today-alert-item" type="button" data-edit="${item.id}"><span><b>${esc(item.description)}</b><small>${esc(categoryMeta(item))} · Vence hoje</small></span><strong>${money.format(item.amount)}</strong><span class="today-alert-open">Abrir</span></button>`).join("")}</div></section>`;
}
function summary(label, value, color, icon, detailType = "") {
  const tag = detailType ? "button" : "article";
  const action = detailType
    ? ` type="button" data-summary="${detailType}" aria-label="Ver detalhes de ${label}"`
    : "";
  return `<${tag} class="summary${detailType ? " summary-action" : ""}"${action}><span class="summary-icon ${color}">${icon}</span><div><small>${label}</small><b>${money.format(value)}</b></div>${detailType ? '<span class="summary-chevron" aria-hidden="true">›</span>' : ""}</${tag}>`;
}
function recordRow(item) {
  const status = financialStatus(item);
  const recurrence =
    Number(item.recurrenceTotal) > 1
      ? ` · ${item.recurrenceType === "installment" ? "Parcela" : "Recorrente"} ${item.recurrenceIndex}/${item.recurrenceTotal}`
      : "";
  return `<button class="record-row" data-edit="${item.id}">${categoryIconBadge(item)}<div><b>${esc(item.description)}</b><small>${esc(categoryMeta(item))} · ${formatDate(item.dueDate)}${recurrence}</small></div><strong class="${item.type === "income" ? "positive" : ""}">${item.type === "income" ? "+ " : ""}${money.format(item.amount)}</strong><span class="pill ${status.className}">${status.label}</span></button>`;
}

function renderCalendar(monthName) {
  if (!state.selected) return emptyManagement();
  if (state.calendarLayout === "agenda") return renderCalendarAgenda(monthName);
  const filteredItems = filteredCalendarTransactions();
  const [year, month] = state.month.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const blanks = first.getUTCDay();
  const cells = Array.from(
    { length: blanks },
    () => '<div class="day muted"></div>',
  );
  for (let day = 1; day <= days; day++) {
    const date = `${state.month}-${String(day).padStart(2, "0")}`;
    const items = filteredItems.filter((i) => i.dueDate === date);
    cells.push(
      `<div class="day"><b>${day}</b>${items
        .slice(0, 3)
        .map(
          (i) =>
            `<button data-edit="${i.id}" class="day-item ${calendarStatus(i)}" title="${attr(`${i.description} · ${categoryMeta(i)}`)}"><span>${i.status === "paid" ? '<i class="paid-check">✓</i>' : ""}${esc(i.description)}</span><strong>${money.format(i.amount)}</strong></button>`,
        )
        .join(
          "",
        )}${items.length > 3 ? `<small>+${items.length - 3} outros</small>` : ""}</div>`,
    );
  }
  return `${calendarHeader()}${renderCalendarFilters(filteredItems)}<article class="panel calendar-panel"><div class="weekdays">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar">${cells.join("")}</div></article>`;
}

function calendarHeader() {
  return `<div class="content-head calendar-content-head">${monthControl()}<div class="calendar-layout-switch" role="group" aria-label="Formato de visualização"><button type="button" data-calendar-layout="grid" class="${state.calendarLayout === "grid" ? "active" : ""}" aria-pressed="${state.calendarLayout === "grid"}">${icon("calendar")}<span>Calendário</span></button><button type="button" data-calendar-layout="agenda" class="${state.calendarLayout === "agenda" ? "active" : ""}" aria-pressed="${state.calendarLayout === "agenda"}">${icon("list")}<span>Agenda</span></button></div></div>`;
}

function renderCalendarAgenda() {
  const items = filteredCalendarTransactions();
  if (state.calendarFilters.sort !== "date") {
    const sortingLabel =
      state.calendarFilters.sort === "amount-asc"
        ? "Do menor para o maior valor"
        : "Do maior para o menor valor";
    const content = items.length
      ? `<div class="agenda-sorted-head"><b>${sortingLabel}</b><span>As datas continuam visíveis em cada lançamento.</span></div><div class="agenda-items agenda-sorted-items">${items.map((item) => agendaItem(item, true)).join("")}</div>`
      : empty(
          calendarFiltersActive()
            ? "Nenhum lançamento corresponde aos filtros escolhidos."
            : "Nenhum lançamento cadastrado neste mês.",
        );
    return `${calendarHeader()}${renderCalendarFilters(items)}<article class="panel agenda-panel agenda-sorted-panel">${content}</article>`;
  }
  const groups = items.reduce((acc, item) => {
    const key = item.dueDate || `${state.month}-01`;
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
  const content = Object.entries(groups)
    .map(([date, dayItems]) => agendaDay(date, dayItems))
    .join("");
  const emptyMessage = calendarFiltersActive()
    ? "Nenhum lançamento corresponde aos filtros escolhidos."
    : "Nenhum lançamento cadastrado neste mês.";
  return `${calendarHeader()}${renderCalendarFilters(items)}<article class="panel agenda-panel">${content || empty(emptyMessage)}</article>`;
}

function agendaDay(date, items) {
  const parsed = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsed);
  const monthDay = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
  const isToday = date === todayKey();
  return `<section class="agenda-day ${isToday ? "today" : ""}"><header><span class="agenda-date-number">${parsed.getUTCDate()}</span><div><b>${isToday ? "Hoje" : esc(weekday)}</b><small>${esc(monthDay)}</small></div><span>${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"}</span></header><div class="agenda-items">${items.map(agendaItem).join("")}</div></section>`;
}

function agendaItem(item, showDate = false) {
  const status = financialStatus(item);
  return `<button type="button" class="agenda-item" data-edit="${item.id}">${categoryIconBadge(item)}<span class="agenda-item-copy"><b>${esc(item.description)}</b><small>${esc(categoryMeta(item))}${showDate ? ` · ${formatDate(item.dueDate)}` : ""}${Number(item.recurrenceTotal) > 1 ? ` · ${item.recurrenceType === "installment" ? "Parcela" : "Recorrente"} ${item.recurrenceIndex}/${item.recurrenceTotal}` : ""}</small></span><span class="agenda-item-value"><b class="${item.type === "income" ? "positive" : ""}">${item.type === "income" ? "+ " : ""}${money.format(item.amount)}</b><span class="pill ${status.className}">${status.label}</span></span></button>`;
}

function renderUsers() {
  if (state.profile.role !== "master") return "";
  return `<div class="content-head"><div><strong>Usuários autorizados</strong><span>Somente o master pode criar e alterar acessos.</span></div><button class="btn btn-primary" id="createUser">+ Criar usuário</button></div><article class="panel"><div class="user-list">${state.users.map((u) => `<div class="user-row"><span>${initials(u.name)}</span><div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div><label class="switch"><input type="checkbox" data-access="${u.id}" data-field="canCreateManagement" ${u.canCreateManagement ? "checked" : ""} ${u.role === "master" ? "disabled" : ""}><i></i> Pode criar gerenciamentos</label><label class="switch"><input type="checkbox" data-access="${u.id}" data-field="active" ${u.active ? "checked" : ""} ${u.role === "master" ? "disabled" : ""}><i></i> Ativo</label><span class="role">${u.role}</span></div>`).join("")}</div></article>`;
}
function renderCardVisual(card, preview = false) {
  const background = validCardColor(card.backgroundColor);
  const ink = cardInkColor(background);
  const logoUrl = safeLogoUrl(card.logoUrl);
  const footer = [
    card.closingDay ? `Fecha dia ${card.closingDay}` : "",
    card.dueDay ? `Vence dia ${card.dueDay}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const logo = logoUrl
    ? `<img class="payment-card-logo" data-card-logo src="${attr(logoUrl)}" alt="Logo de ${attr(card.name || "cartão")}">`
    : `<span class="payment-card-logo-fallback">${initials(card.name || "Cartão")}</span>`;
  return `<div class="payment-card ${preview ? "payment-card-preview" : ""}" style="--card-bg:${attr(background)};--card-ink:${attr(ink)}"><div class="payment-card-top"><span class="payment-card-brand">${icon("credit-card")}<b>${esc(card.name || "Nome do cartão")}</b></span><span class="payment-card-logo-wrap">${logo}</span></div><div class="payment-card-bottom"><span><small>TITULAR</small><b>${esc(card.holderName || "Nome do titular")}</b></span>${footer ? `<small>${esc(footer)}</small>` : ""}</div></div>`;
}
function renderCardsSettings() {
  if (!state.selected) {
    return `<div class="settings-empty"><p>Selecione um gerenciamento para cadastrar cartões.</p></div>`;
  }
  const activeCards = state.cards.filter((card) => card.active !== false);
  const archivedCards = state.cards.filter((card) => card.active === false);
  const group = (cards, archived = false) =>
    cards
      .map(
        (card) =>
          `<article class="managed-card ${archived ? "is-archived" : ""}">${renderCardVisual(card)}<div class="managed-card-meta"><span><b>${esc(card.name)}</b><small>${esc(card.holderName || "Titular não informado")}</small></span>${canEdit() ? `<div><button class="card-action" type="button" data-edit-card="${card.id}" aria-label="Editar ${attr(card.name)}">${icon("edit")} Editar</button><button class="card-action" type="button" data-toggle-card="${card.id}" data-card-active="${archived ? "true" : "false"}">${archived ? "Reativar" : "Arquivar"}</button></div>` : ""}</div></article>`,
      )
      .join("");
  const emptyCards = `<div class="cards-empty">${icon("credit-card")}<div><b>Nenhum cartão cadastrado</b><span>Cadastre seus cartões para identificar cada fatura no calendário.</span></div></div>`;
  return `${activeCards.length ? `<div class="cards-gallery">${group(activeCards)}</div>` : emptyCards}${archivedCards.length ? `<details class="archived-cards"><summary>${archivedCards.length} ${archivedCards.length === 1 ? "cartão arquivado" : "cartões arquivados"}</summary><div class="cards-gallery">${group(archivedCards, true)}</div></details>` : ""}`;
}
function renderSettings(monthName) {
  const limit = expenseLimitForMonth();
  const currentExpense = state.selected ? totals().expense : 0;
  const canCreate =
    state.profile.canCreateManagement || state.profile.role === "master";
  const preference = themePreference();
  const budgetContent = state.selected
    ? `<div class="settings-budget-preview"><span><small>Despesas previstas</small><b>${money.format(currentExpense)}</b></span><span><small>Limite atual</small><b>${limit ? money.format(limit) : "Não definido"}</b></span></div><form class="expense-limit-form" id="expenseLimitForm"><label>Valor máximo para ${esc(monthName)}<div class="currency-field"><span>R$</span><input name="limit" type="number" min="1" step="0.01" value="${limit || ""}" placeholder="Ex.: 3500,00" inputmode="decimal" ${!canEdit() ? "disabled" : ""}></div></label>${canEdit() ? `<div class="settings-actions"><button class="btn btn-primary" type="submit">Salvar limite</button>${limit ? '<button class="btn btn-soft" id="clearExpenseLimit" type="button">Remover limite</button>' : ""}</div>` : '<p class="settings-readonly">Seu acesso permite visualizar, mas não alterar este limite.</p>'}</form>`
    : `<div class="settings-empty"><p>Selecione ou crie um gerenciamento para definir o limite mensal.</p></div>`;
  const managementActions = `${canEdit() ? `<button class="btn btn-soft" id="editManagement" type="button">${icon("edit")} Editar gerenciamento</button>` : ""}${isOwner() ? `<button class="btn btn-soft" id="shareBtn" type="button">${icon("share")} Compartilhar acesso</button>` : ""}${canCreate ? `<button class="btn btn-primary" id="newManagement" type="button">${icon("plus")} Novo gerenciamento</button>` : ""}`;
  const sessionCard = `<section class="panel settings-card settings-session-card"><div class="settings-card-head"><span class="settings-card-icon">${icon("logout")}</span><div><h2>Conta e sessão</h2><p>Consulte seu acesso ou encerre a sessão neste aparelho.</p></div></div><div class="settings-session-profile"><span>${initials(state.profile.name)}</span><div><b>${esc(state.profile.name)}</b><small>${esc(state.profile.email || state.user.email || "")}</small></div></div><button class="btn btn-danger settings-logout-button" id="settingsLogout" type="button">${icon("logout")} Sair da conta</button></section>`;
  return `<div class="settings-grid"><section class="panel settings-card settings-budget"><div class="settings-card-head"><span class="settings-card-icon">${icon("gauge")}</span><div><h2>Planejamento mensal</h2><p>Defina o teto de despesas para cada mês.</p></div><label class="settings-month">Período<input id="settingsMonthInput" type="month" value="${state.month}" aria-label="Mês do limite de despesas"></label></div>${budgetContent}</section><section class="panel settings-card settings-cards"><div class="settings-card-head"><span class="settings-card-icon">${icon("credit-card")}</span><div><h2>Meus cartões</h2><p>Identifique as faturas pelo cartão, titular e aparência.</p></div>${state.selected && canEdit() ? `<button class="btn btn-primary settings-card-cta" id="newCard" type="button">${icon("plus")} Adicionar cartão</button>` : ""}</div>${renderCardsSettings()}</section><section class="panel settings-card"><div class="settings-card-head"><span class="settings-card-icon">${icon("wallet")}</span><div><h2>Gerenciamentos</h2><p>Crie, edite e compartilhe seus espaços financeiros.</p></div></div>${state.selected ? `<div class="settings-management"><small>Selecionado agora</small><b>${esc(state.selected.name)}</b><span>${esc(state.selected.description || "Sem descrição")}</span></div>` : '<div class="settings-empty"><p>Nenhum gerenciamento selecionado.</p></div>'}<div class="settings-actions settings-actions-wrap">${managementActions || '<span class="settings-readonly">Sem ações disponíveis para este acesso.</span>'}</div></section><section class="panel settings-card"><div class="settings-card-head"><span class="settings-card-icon">${icon("palette")}</span><div><h2>Aparência</h2><p>Escolha como o OrganizaContas deve ser exibido.</p></div></div><div class="theme-options" role="group" aria-label="Escolher tema"><button type="button" data-theme-choice="light" class="${preference === "light" ? "active" : ""}">${icon("sun")}<span><b>Claro</b><small>Sempre claro</small></span></button><button type="button" data-theme-choice="dark" class="${preference === "dark" ? "active" : ""}">${icon("moon")}<span><b>Escuro</b><small>Sempre escuro</small></span></button><button type="button" data-theme-choice="system" class="${preference === "system" ? "active" : ""}">${icon("monitor")}<span><b>Sistema</b><small>Segue o aparelho</small></span></button></div></section>${state.profile.role === "master" ? `<section class="panel settings-card settings-users-card"><div class="settings-card-head"><span class="settings-card-icon">${icon("users")}</span><div><h2>Usuários e permissões</h2><p>Crie acessos e defina quem pode criar gerenciamentos.</p></div></div><button class="settings-link" type="button" data-go="users"><span>Abrir gestão de usuários</span><b>›</b></button></section>` : ""}${sessionCard}</div>`;
}
function emptyManagement() {
  return `<section class="empty-state"><div>◫</div><h2>Comece criando um gerenciamento</h2><p>Você poderá organizar as contas da casa e compartilhar o calendário com outra pessoa.</p>${state.profile.canCreateManagement || state.profile.role === "master" ? '<button class="btn btn-primary" id="emptyCreate">Criar gerenciamento</button>' : "<p>Peça ao administrador permissão para criar gerenciamentos.</p>"}</section>`;
}
function empty(text) {
  return `<div class="empty-inline">${text}</div>`;
}

function bindShell() {
  document.querySelectorAll("[data-card-logo]").forEach(
    (image) =>
      (image.onerror = () => {
        image.hidden = true;
      }),
  );
  document
    .querySelectorAll("#settingsLogout")
    .forEach((button) => (button.onclick = openLogoutModal));
  document
    .querySelectorAll("#desktopVoiceCommand, #mobileNavVoice")
    .forEach((button) =>
      button.addEventListener("click", openVoiceAssistant),
    );
  document
    .querySelector("#themeToggle")
    ?.addEventListener("click", toggleTheme);
  document.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        state.view = button.dataset.view;
        if (state.view === "users") observeUsers();
        renderApp();
      }),
  );
  document.querySelectorAll("[data-go]").forEach(
    (button) =>
      (button.onclick = () => {
        state.view = button.dataset.go;
        if (button.dataset.layout) {
          state.calendarLayout = button.dataset.layout;
          localStorage.setItem("organiza-calendar-layout", state.calendarLayout);
        }
        if (state.view === "users") observeUsers();
        renderApp();
      }),
  );
  document.querySelectorAll("[data-expense-category]").forEach(
    (button) =>
      (button.onclick = () => {
        state.calendarFilters.expenseCategory =
          button.dataset.expenseCategory;
        state.calendarFilters.cardId = "";
        state.calendarFilters.sort = "amount-desc";
        state.calendarLayout = "agenda";
        state.view = "calendar";
        localStorage.setItem("organiza-calendar-layout", "agenda");
        renderApp();
      }),
  );
  document.querySelectorAll("[data-dashboard-group]").forEach(
    (details) =>
      (details.ontoggle = () => {
        state.dashboardGroupOpen[details.dataset.dashboardGroup] = details.open;
      }),
  );
  document.querySelectorAll("[data-summary]").forEach(
    (button) =>
      (button.onclick = () => openSummaryModal(button.dataset.summary)),
  );
  document.querySelector("#managementSelect").onchange = (e) => {
    state.selected =
      state.managements.find((i) => i.id === e.target.value) || null;
    state.calendarFilters = { query: "", expenseCategory: "", cardId: "", sort: "date" };
    observeSelectedManagement();
    renderApp();
  };
  document
    .querySelector("#newManagement")
    ?.addEventListener("click", () => openManagementModal());
  document
    .querySelector("#editManagement")
    ?.addEventListener("click", () => openManagementModal(state.selected));
  document
    .querySelector("#emptyCreate")
    ?.addEventListener("click", () => openManagementModal());
  document
    .querySelector("#newCard")
    ?.addEventListener("click", () => openCardModal());
  document.querySelectorAll("[data-edit-card]").forEach(
    (button) =>
      (button.onclick = () =>
        openCardModal(cardById(button.dataset.editCard))),
  );
  document.querySelectorAll("[data-toggle-card]").forEach(
    (button) =>
      (button.onclick = async () => {
        const card = cardById(button.dataset.toggleCard);
        const activate = button.dataset.cardActive === "true";
        if (!card) return;
        if (
          !activate &&
          !confirm(
            `Arquivar ${card.name}? As faturas antigas continuarão identificadas.`,
          )
        )
          return;
        busy(button, true);
        try {
          await FirebaseService.setCardActive(
            state.selected.id,
            card.id,
            activate,
            state.user.uid,
          );
          toast(activate ? "Cartão reativado." : "Cartão arquivado.");
        } catch (error) {
          firebaseError(error);
          busy(button, false);
        }
      }),
  );
  document.querySelector("#newRecord")?.addEventListener("click", () => {
    if (canEdit()) openRecordModal();
  });
  document.querySelector("#mobileNewRecord")?.addEventListener("click", () => {
    if (canEdit()) openRecordModal();
  });
  document
    .querySelector("#shareBtn")
    ?.addEventListener("click", openShareModal);
  document
    .querySelector("#createUser")
    ?.addEventListener("click", openUserModal);
  document.querySelectorAll("[data-theme-choice]").forEach(
    (button) =>
      (button.onclick = () => setThemePreference(button.dataset.themeChoice)),
  );
  const expenseLimitForm = document.querySelector("#expenseLimitForm");
  if (expenseLimitForm) {
    expenseLimitForm.onsubmit = async (event) => {
      event.preventDefault();
      const button = expenseLimitForm.querySelector('button[type="submit"]');
      const limit = Number(expenseLimitForm.limit.value);
      if (!limit || limit <= 0) {
        toast("Informe um limite mensal maior que zero.", "danger");
        return;
      }
      busy(button, true);
      try {
        await FirebaseService.setMonthlyExpenseLimit(
          state.selected.id,
          state.month,
          limit,
        );
        toast("Limite mensal atualizado.");
      } catch (error) {
        firebaseError(error);
        busy(button, false);
      }
    };
  }
  document
    .querySelector("#clearExpenseLimit")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      busy(button, true);
      try {
        await FirebaseService.setMonthlyExpenseLimit(
          state.selected.id,
          state.month,
          null,
        );
        toast("Limite mensal removido.");
      } catch (error) {
        firebaseError(error);
        busy(button, false);
      }
    });
  document.querySelectorAll("[data-month]").forEach(
    (b) =>
      (b.onclick = () => {
        const [y, m] = state.month.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.month), 1));
        state.month = d.toISOString().slice(0, 7);
        renderApp();
      }),
  );
  document.querySelector("#monthInput")?.addEventListener("change", (event) => {
    if (event.target.value) {
      state.month = event.target.value;
      renderApp();
    }
  });
  document
    .querySelector("#settingsMonthInput")
    ?.addEventListener("change", (event) => {
      if (event.target.value) {
        state.month = event.target.value;
        renderApp();
      }
    });
  const transactionSearch = document.querySelector("#transactionSearch");
  if (transactionSearch) {
    transactionSearch.oninput = (event) => {
      const value = event.currentTarget.value;
      const cursor = event.currentTarget.selectionStart ?? value.length;
      state.calendarFilters.query = value;
      window.clearTimeout(calendarSearchTimer);
      calendarSearchTimer = window.setTimeout(() => {
        if (state.view !== "calendar") return;
        renderApp();
        requestAnimationFrame(() => {
          const nextInput = document.querySelector("#transactionSearch");
          nextInput?.focus({ preventScroll: true });
          nextInput?.setSelectionRange(cursor, cursor);
        });
      }, 140);
    };
  }
  document
    .querySelector("#expenseCategoryFilter")
    ?.addEventListener("change", (event) => {
      state.calendarFilters.expenseCategory = event.target.value;
      if (event.target.value !== "Cartão") state.calendarFilters.cardId = "";
      renderApp();
    });
  document.querySelector("#cardFilter")?.addEventListener("change", (event) => {
    state.calendarFilters.cardId = event.target.value;
    renderApp();
  });
  document
    .querySelector("#transactionSort")
    ?.addEventListener("change", (event) => {
      state.calendarFilters.sort = event.target.value;
      if (state.calendarFilters.sort !== "date") {
        state.calendarLayout = "agenda";
        localStorage.setItem("organiza-calendar-layout", "agenda");
      }
      renderApp();
    });
  document
    .querySelector("#clearCalendarFilters")
    ?.addEventListener("click", () => {
      window.clearTimeout(calendarSearchTimer);
      state.calendarFilters = {
        query: "",
        expenseCategory: "",
        cardId: "",
        sort: "date",
      };
      renderApp();
    });
  document.querySelector("#monthToday")?.addEventListener("click", () => {
    state.month = new Date().toISOString().slice(0, 7);
    renderApp();
  });
  document.querySelectorAll("[data-calendar-layout]").forEach(
    (button) =>
      (button.onclick = () => {
        state.calendarLayout = button.dataset.calendarLayout;
        if (
          state.calendarLayout === "grid" &&
          state.calendarFilters.sort !== "date"
        ) {
          state.calendarFilters.sort = "date";
        }
        localStorage.setItem("organiza-calendar-layout", state.calendarLayout);
        renderApp();
      }),
  );
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.transactions.find((i) => i.id === b.dataset.edit);
        if (canEdit()) openRecordModal(item);
        else openRecordDetails(item);
      }),
  );
  document.querySelectorAll("[data-access]").forEach(
    (input) =>
      (input.onchange = async () => {
        try {
          await FirebaseService.setUserAccess(input.dataset.access, {
            [input.dataset.field]: input.checked,
          });
          toast("Permissão atualizada.");
        } catch (e) {
          input.checked = !input.checked;
          firebaseError(e);
        }
      }),
  );
}

function speechRecognitionApi() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function openVoiceAssistant() {
  closeVoiceAssistant();
  const layer = document.createElement("div");
  layer.className = "voice-assistant-backdrop";
  layer.id = "voiceAssistant";
  layer.innerHTML = `<section class="voice-assistant" role="dialog" aria-modal="true" aria-labelledby="voiceAssistantTitle"><button class="voice-assistant-close" type="button" aria-label="Fechar">×</button><span class="eyebrow">ASSISTENTE DE VOZ</span><div class="voice-assistant-heading"><span class="voice-orb" aria-hidden="true">${icon("mic")}</span><div><h2 id="voiceAssistantTitle">O que deseja fazer?</h2><p id="voiceStatus" aria-live="polite">Preparando o microfone...</p></div></div><blockquote id="voiceTranscript" aria-live="polite">Fale um comando em português.</blockquote><div class="voice-examples"><small>EXPERIMENTE DIZER</small>${[
    "Coloca a conta de luz de 150 pro dia 10 e grava",
    "Paguei a internet hoje, pode salvar",
    "Quanto ainda falta pagar?",
    "Vai pra agenda",
  ]
    .map(
      (command) =>
        `<button type="button" data-voice-example="${attr(command)}">“${esc(command)}”</button>`,
    )
    .join("")}</div><div class="voice-assistant-actions"><button class="btn btn-soft" id="voiceRetry" type="button">${icon("mic")} <span>Ouvir novamente</span></button></div><small class="voice-privacy">${icon("shield")} O OrganizaContas não salva seu áudio. O reconhecimento pode ser processado pelo serviço de voz do navegador.</small></section>`;
  document.body.append(layer);
  layer.querySelector(".voice-assistant-close").onclick = closeVoiceAssistant;
  layer.onclick = (event) => {
    if (event.target === layer) closeVoiceAssistant();
  };
  layer.querySelector("#voiceRetry").onclick = () => {
    if (voiceListening) {
      voiceFinalizeCapture?.();
      return;
    }
    startVoiceListening();
  };
  layer.querySelectorAll("[data-voice-example]").forEach(
    (button) =>
      (button.onclick = () => {
        const command = button.dataset.voiceExample;
        updateVoiceAssistant("Interpretando o comando de exemplo...", command);
        executeVoiceCommand(command);
      }),
  );
  document.addEventListener("keydown", closeVoiceOnEscape);
  startVoiceListening();
}

function closeVoiceOnEscape(event) {
  if (event.key === "Escape") closeVoiceAssistant();
}

function closeVoiceAssistant() {
  document.removeEventListener("keydown", closeVoiceOnEscape);
  voiceFinalizeCapture = null;
  if (voiceRecognition) {
    try {
      voiceRecognition.abort();
    } catch {}
  }
  voiceRecognition = null;
  voiceListening = false;
  document.querySelector("#voiceAssistant")?.remove();
}

function updateVoiceAssistant(status, transcript = "") {
  const panel = document.querySelector("#voiceAssistant");
  if (!panel) return;
  const statusElement = panel.querySelector("#voiceStatus");
  const transcriptElement = panel.querySelector("#voiceTranscript");
  if (statusElement) statusElement.textContent = status;
  if (transcript && transcriptElement)
    transcriptElement.textContent = `“${transcript}”`;
}

function setVoiceListening(listening) {
  voiceListening = listening;
  const panel = document.querySelector("#voiceAssistant");
  if (!panel) return;
  panel.classList.toggle("is-listening", listening);
  const retry = panel.querySelector("#voiceRetry");
  if (retry) {
    retry.querySelector("span").textContent = listening
      ? "Parar de ouvir"
      : "Ouvir novamente";
  }
}

function voiceErrorMessage(error) {
  return {
    "not-allowed":
      "Permita o uso do microfone nas configurações do navegador e tente novamente.",
    "service-not-allowed":
      "O serviço de voz está bloqueado neste navegador.",
    "audio-capture":
      "Nenhum microfone disponível foi encontrado neste aparelho.",
    "no-speech": "Não ouvi nenhum comando. Toque abaixo para tentar novamente.",
    network:
      "O serviço de reconhecimento não respondeu. Verifique sua conexão e tente novamente.",
    aborted: "A escuta foi interrompida.",
  }[error] || "Não foi possível usar o reconhecimento de voz neste momento.";
}

function mergeVoiceTranscript(base = "", addition = "") {
  const left = String(base).replace(/\s+/g, " ").trim();
  const right = String(addition).replace(/\s+/g, " ").trim();
  if (!left) return right;
  if (!right) return left;

  const transcriptKey = (value) =>
    normalizeSearch(value)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const leftKey = transcriptKey(left);
  const rightKey = transcriptKey(right);
  if (!leftKey) return right;
  if (!rightKey) return left;
  if (leftKey === rightKey) return right;
  if (rightKey.startsWith(`${leftKey} `)) return right;
  if (leftKey.startsWith(`${rightKey} `)) return left;

  const leftWords = left.split(" ");
  const rightWords = right.split(" ");
  const leftKeys = leftWords.map(transcriptKey);
  const rightKeys = rightWords.map(transcriptKey);
  const maximumOverlap = Math.min(leftKeys.length, rightKeys.length);
  for (let size = maximumOverlap; size > 0; size--) {
    const leftEnding = leftKeys.slice(-size).join(" ");
    const rightBeginning = rightKeys.slice(0, size).join(" ");
    if (leftEnding === rightBeginning)
      return `${left} ${rightWords.slice(size).join(" ")}`.trim();
  }
  return `${left} ${right}`;
}

function startVoiceListening() {
  const Recognition = speechRecognitionApi();
  const panel = document.querySelector("#voiceAssistant");
  if (!panel) return;
  if (!Recognition) {
    panel.classList.add("is-unsupported");
    updateVoiceAssistant(
      "Este navegador não oferece reconhecimento de voz. Tente uma versão atual do Chrome ou Edge.",
    );
    panel.querySelector("#voiceRetry").disabled = true;
    return;
  }
  if (voiceRecognition) {
    try {
      voiceRecognition.abort();
    } catch {}
  }
  voiceFinalizeCapture = null;
  const recognition = new Recognition();
  voiceRecognition = recognition;
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let capturedTranscript = "";
  let currentFinalTranscript = "";
  let currentInterimTranscript = "";
  let silenceTimer = 0;
  let finished = false;
  const combinedTranscript = () =>
    mergeVoiceTranscript(
      mergeVoiceTranscript(capturedTranscript, currentFinalTranscript),
      currentInterimTranscript,
    );
  const clearSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = 0;
  };
  const finishCommand = () => {
    if (finished) return;
    finished = true;
    clearSilenceTimer();
    const command = combinedTranscript();
    voiceFinalizeCapture = null;
    setVoiceListening(false);
    try {
      recognition.stop();
    } catch {}
    if (!command) {
      updateVoiceAssistant(
        "Não ouvi um comando completo. Toque abaixo para tentar novamente.",
      );
      return;
    }
    updateVoiceAssistant("Entendi. Executando...", command);
    executeVoiceCommand(command);
  };
  const waitForMoreSpeech = () => {
    clearSilenceTimer();
    if (!combinedTranscript()) return;
    updateVoiceAssistant(
      "Aguardando você terminar de falar...",
      combinedTranscript(),
    );
    silenceTimer = setTimeout(finishCommand, 3000);
  };
  voiceFinalizeCapture = finishCommand;
  recognition.onstart = () => {
    setVoiceListening(true);
    updateVoiceAssistant(
      capturedTranscript
        ? "Continue falando. Vou aguardar você terminar."
        : "Ouvindo... fale seu comando agora.",
    );
  };
  recognition.onresult = (event) => {
    currentFinalTranscript = "";
    currentInterimTranscript = "";
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index];
      if (result.isFinal)
        currentFinalTranscript = mergeVoiceTranscript(
          currentFinalTranscript,
          result[0].transcript,
        );
      else
        currentInterimTranscript = mergeVoiceTranscript(
          currentInterimTranscript,
          result[0].transcript,
        );
    }
    updateVoiceAssistant("Ouvindo... pode continuar.", combinedTranscript());
    waitForMoreSpeech();
  };
  recognition.onerror = (event) => {
    if (finished || !document.querySelector("#voiceAssistant")) return;
    if (event.error === "no-speech" && combinedTranscript()) {
      waitForMoreSpeech();
      return;
    }
    finished = true;
    clearSilenceTimer();
    voiceFinalizeCapture = null;
    setVoiceListening(false);
    updateVoiceAssistant(voiceErrorMessage(event.error));
  };
  recognition.onend = () => {
    if (finished || !document.querySelector("#voiceAssistant")) {
      if (voiceRecognition === recognition) voiceRecognition = null;
      return;
    }
    const completedSegment = mergeVoiceTranscript(
      currentFinalTranscript,
      currentInterimTranscript,
    );
    if (completedSegment) {
      capturedTranscript = mergeVoiceTranscript(
        capturedTranscript,
        completedSegment,
      );
      currentFinalTranscript = "";
      currentInterimTranscript = "";
      waitForMoreSpeech();
    }
    setVoiceListening(false);
    if (combinedTranscript()) {
      setTimeout(() => {
        if (finished || !document.querySelector("#voiceAssistant")) return;
        try {
          recognition.start();
        } catch {
          waitForMoreSpeech();
        }
      }, 120);
    } else {
      voiceFinalizeCapture = null;
      updateVoiceAssistant(
        "A escuta terminou sem um comando completo. Tente novamente.",
      );
    }
  };
  try {
    recognition.start();
  } catch (error) {
    voiceRecognition = null;
    voiceFinalizeCapture = null;
    setVoiceListening(false);
    updateVoiceAssistant(error.message || voiceErrorMessage());
  }
}

function normalizeVoiceText(value = "") {
  return normalizeSearch(value)
    .replace(/[^\p{L}\p{N},.$\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function voiceHasAny(command, terms = []) {
  const searchable = ` ${normalizeVoiceText(command).replace(/[,.]/g, " ")} `
    .replace(/\s+/g, " ");
  return terms.some((term) => {
    const normalizedTerm = normalizeVoiceText(term)
      .replace(/[,.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalizedTerm && searchable.includes(` ${normalizedTerm} `);
  });
}

function voiceRemoveTerms(command, terms = []) {
  let result = ` ${normalizeVoiceText(command).replace(/[,.]/g, " ")} `
    .replace(/\s+/g, " ");
  terms
    .map((term) => normalizeVoiceText(term).replace(/[,.]/g, " ").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((term) => {
      result = result.replaceAll(` ${term} `, " ");
    });
  return result.replace(/\s+/g, " ").trim();
}

function voiceCategory(command, type) {
  const normalized = normalizeVoiceText(command);
  const categoryList = categories[type];
  const direct = categoryList
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((category) => voiceHasAny(normalized, [category]));
  if (direct) return direct;
  const alias = voiceCategoryAliases[type].find(([terms]) =>
    voiceHasAny(normalized, terms),
  )?.[1];
  if (alias) return alias;
  if (type === "expense" && voiceCard(normalized)) return "Cartão";
  return "";
}

function voiceCard(command) {
  const normalized = normalizeVoiceText(command);
  const activeCards = state.cards.filter((card) => card.active !== false);
  const exact = activeCards
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
    .find((card) => voiceHasAny(normalized, [card.name]));
  if (exact) return exact;
  const partialMatches = activeCards.filter((card) =>
    normalizeVoiceText(card.name)
      .split(" ")
      .filter((word) => word.length > 2)
      .some((word) => voiceHasAny(normalized, [word])),
  );
  return partialMatches.length === 1 ? partialMatches[0] : null;
}

function portugueseNumber(value) {
  const numbers = {
    zero: 0,
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    primeiro: 1,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezassete: 17,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
    sessenta: 60,
    setenta: 70,
    oitenta: 80,
    noventa: 90,
    cem: 100,
    cento: 100,
    duzentos: 200,
    trezentos: 300,
    quatrocentos: 400,
    quinhentos: 500,
    seiscentos: 600,
    setecentos: 700,
    oitocentos: 800,
    novecentos: 900,
  };
  let total = 0;
  let current = 0;
  let found = false;
  normalizeVoiceText(value)
    .split(" ")
    .forEach((token) => {
      if (token === "e") return;
      if (token === "mil") {
        total += (current || 1) * 1000;
        current = 0;
        found = true;
        return;
      }
      if (numbers[token] !== undefined) {
        current += numbers[token];
        found = true;
      }
    });
  return found ? total + current : 0;
}

function voiceNumericValue(raw = "") {
  const value = String(raw).trim();
  const normalized = value.includes(",")
    ? value.replaceAll(".", "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(value)
      ? value.replaceAll(".", "")
      : value;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function voiceAmount(command) {
  const digitMatch =
    command.match(
      /(?:r\$\s*|(?:no\s+)?valor\s+(?:de\s+)?|cust(?:a|ou)\s+|saiu\s+(?:por\s+)?|total\s+(?:de\s+)?|de\s+)(\d[\d.]*?(?:,\d{1,2})?)(?:\s*(?:reais?|contos?))?(?:\s|$)/,
    ) ||
    command.match(/(\d[\d.]*?(?:,\d{1,2})?)\s*(?:reais?|contos?)/);
  if (digitMatch) {
    const amount = voiceNumericValue(digitMatch[1]);
    if (amount > 0) return amount;
  }
  const words = command.match(
    /(?:valor\s+(?:de\s+)?|cust(?:a|ou)\s+|saiu\s+(?:por\s+)?|de\s+)([\p{L}\s-]+?)(?=\s+(?:reais?|contos?|pro\s+dia|para\s+o\s+dia|dia|e\s+(?:salvar|salva|gravar|grava|confirmar|confirma))\b|$)/u,
  );
  const amountInWords = words ? portugueseNumber(words[1]) : 0;
  if (amountInWords) return amountInWords;
  const spokenCurrency = command.match(
    /\b((?:(?:zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|e)(?:\s+|$))+)(?:reais?|contos?)\b/,
  );
  const spokenAmount = spokenCurrency
    ? portugueseNumber(spokenCurrency[1])
    : 0;
  if (spokenAmount) return spokenAmount;

  const genericNumbers = [...command.matchAll(/\b\d[\d.]*?(?:,\d{1,2})?\b/g)];
  const genericAmount = genericNumbers.find((match) => {
    const before = command.slice(Math.max(0, match.index - 16), match.index);
    const after = command.slice(
      match.index + match[0].length,
      match.index + match[0].length + 8,
    );
    return (
      !/\b(?:dia|vence|vencimento|em)\s*$/.test(before) &&
      !/^\s*[/.:-]\s*\d/.test(after) &&
      !/^20\d{2}$/.test(match[0])
    );
  });
  return genericAmount ? voiceNumericValue(genericAmount[0]) : 0;
}

function voiceDueDate(command) {
  if (voiceHasAny(command, ["hoje"])) return todayKey();
  if (voiceHasAny(command, ["amanhã", "dia seguinte"])) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  }

  const numericDate = command.match(
    /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/,
  );
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]);
    let year = Number(numericDate[3] || state.month.slice(0, 4));
    if (year < 100) year += 2000;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month >= 1 && month <= 12 && day >= 1 && day <= lastDay)
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const digitDay =
    command.match(/\bdia\s+(\d{1,2})\b/) ||
    command.match(/\b(?:vence|vencimento|receber|recebo)\s+(?:no\s+)?(\d{1,2})\b/);
  const wordDay = command.match(
    /\bdia\s+([\p{L}]+(?:\s+e\s+[\p{L}]+)?)/u,
  );
  const day = digitDay
    ? Number(digitDay[1])
    : wordDay
      ? portugueseNumber(wordDay[1])
      : 0;
  if (!day) return "";

  let targetMonth = voiceMonthFromName(command) || state.month;
  if (
    !voiceMonthFromName(command) &&
    voiceHasAny(command, ["mês que vem", "próximo mês", "mês seguinte"])
  ) {
    const [year, month] = state.month.split("-").map(Number);
    targetMonth = new Date(Date.UTC(year, month, 1))
      .toISOString()
      .slice(0, 7);
  } else if (
    !voiceMonthFromName(command) &&
    voiceHasAny(command, ["mês passado", "mês anterior"])
  ) {
    const [year, month] = state.month.split("-").map(Number);
    targetMonth = new Date(Date.UTC(year, month - 2, 1))
      .toISOString()
      .slice(0, 7);
  }
  const [year, month] = targetMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);
  return `${targetMonth}-${String(safeDay).padStart(2, "0")}`;
}

function shiftVoiceMonth(offset) {
  const [year, month] = state.month.split("-").map(Number);
  state.month = new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

function voiceMonthFromName(command) {
  const monthNames = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const monthIndex = monthNames.findIndex((name) => command.includes(name));
  if (monthIndex < 0) return "";
  const informedYear = command.match(/\b(20\d{2})\b/)?.[1];
  const currentYear = state.month.slice(0, 4);
  return `${informedYear || currentYear}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function completeVoiceAction(message, action) {
  closeVoiceAssistant();
  action();
  toast(message);
}

function voiceCommandNotUnderstood(message = "") {
  updateVoiceAssistant(
    message ||
      "Não reconheci uma ação nesse comando. Tente usar uma das frases de exemplo.",
  );
}

function voiceWantsImmediateSave(command) {
  return voiceHasAny(command, voiceLexicon.save);
}

function voiceTransactionPayload(item, changes = {}) {
  return {
    type: item.type,
    description: item.description,
    category: item.category || "Outros",
    cardId: item.cardId || "",
    cardSnapshot: item.cardSnapshot || null,
    amount: Number(item.amount),
    dueDate: item.dueDate || "",
    plannedDate: item.plannedDate || item.dueDate || "",
    status: item.status || "pending",
    paidDate: item.paidDate || "",
    notes: item.notes || "",
    attachment: item.attachment || null,
    ...changes,
  };
}

async function saveVoiceTransaction(
  data,
  id = "",
  successMessage = "Lançamento salvo.",
) {
  updateVoiceAssistant("Salvando o lançamento no Firebase...", data.description);
  try {
    await FirebaseService.saveTransaction(
      state.selected.id,
      data,
      state.user.uid,
      id || undefined,
    );
    closeVoiceAssistant();
    if (!id && data.dueDate) state.month = data.dueDate.slice(0, 7);
    state.view = "dashboard";
    renderApp();
    toast(successMessage);
    return true;
  } catch (error) {
    setVoiceListening(false);
    updateVoiceAssistant(
      "Não consegui salvar o lançamento. Confira sua conexão e tente novamente.",
      data.description,
    );
    firebaseError(error);
    return false;
  }
}

function openVoiceRecordChoice(
  items,
  received = false,
  saveImmediately = false,
) {
  showModal(
    `<article class="modal modal-large voice-choice-modal"><button class="modal-close" type="button">×</button><span class="eyebrow">CONFIRME O LANÇAMENTO</span><h2>Qual registro deseja ${received ? "marcar como recebido" : "marcar como pago"}?</h2><p>${saveImmediately ? `Toque no registro correto para marcá-lo como ${received ? "recebido" : "pago"} e salvar agora.` : "Nenhuma alteração será salva antes da sua confirmação no formulário."}</p><div class="summary-detail-list">${items
      .map(
        (item) =>
          `<button class="summary-detail-row" type="button" data-voice-record="${item.id}">${categoryIconBadge(item)}<span class="summary-detail-copy"><b>${esc(item.description)}</b><small>${formatDate(item.dueDate)} · ${esc(categoryMeta(item))}</small></span><strong>${money.format(item.amount)}</strong></button>`,
      )
      .join("")}</div></article>`,
  );
  document.querySelectorAll("[data-voice-record]").forEach(
    (button) =>
      (button.onclick = async () => {
        const item = state.transactions.find(
          (transaction) => transaction.id === button.dataset.voiceRecord,
        );
        if (!item) return;
        if (saveImmediately) {
          busy(button, true);
          const saved = await saveVoiceTransaction(
            voiceTransactionPayload(item, {
              status: "paid",
              paidDate: todayKey(),
            }),
            item.id,
            received
              ? "Entrada marcada como recebida e salva."
              : "Despesa marcada como paga e salva.",
          );
          if (!saved) busy(button, false);
          return;
        }
        openRecordModal({ ...item, status: "paid", paidDate: todayKey() });
        toast("Revise os dados e confirme em Salvar lançamento.");
      }),
  );
}

function voiceLooksLikeNewRecord(command) {
  if (!voiceHasAny(command, voiceLexicon.create)) return false;
  if (
    voiceHasAny(command, [
      ...voiceLexicon.paid,
      ...voiceLexicon.received,
      "como pago",
      "como paga",
      "como recebido",
      "como recebida",
    ])
  )
    return false;
  return Boolean(
    voiceHasAny(command, [...voiceLexicon.expense, ...voiceLexicon.income]) ||
      voiceCategory(command, "expense") ||
      voiceCategory(command, "income") ||
      voiceAmount(command),
  );
}

function voiceTransactionType(command) {
  if (
    voiceHasAny(command, [
      ...voiceLexicon.income,
      "receita nova",
      "entrada nova",
    ])
  )
    return "income";
  const incomeCategory = voiceCategory(command, "income");
  const expenseCategory = voiceCategory(command, "expense");
  return incomeCategory && !expenseCategory
    ? "income"
    : "expense";
}

function handleVoiceNewRecord(command) {
  if (!voiceLooksLikeNewRecord(command)) return false;
  if (!state.selected) {
    voiceCommandNotUnderstood(
      "Selecione ou crie um gerenciamento antes de adicionar lançamentos.",
    );
    return true;
  }
  if (!canEdit()) {
    voiceCommandNotUnderstood(
      "Seu acesso permite apenas visualizar lançamentos.",
    );
    return true;
  }

  const type = voiceTransactionType(command);
  const category = voiceCategory(command, type);
  const selectedCard =
    type === "expense" && category === "Cartão" ? voiceCard(command) : null;
  const amount = voiceAmount(command);
  const dueDate = voiceDueDate(command);
  const saveImmediately = voiceWantsImmediateSave(command);
  const draft = {
    type,
    description:
      category || (type === "income" ? "Nova entrada" : "Nova despesa"),
    category,
    cardId: selectedCard?.id || "",
    amount: amount || "",
    dueDate,
    plannedDate: dueDate,
    status: "pending",
  };

  if (saveImmediately) {
    const missing = [];
    if (!amount) missing.push("valor");
    if (!category) missing.push("categoria");
    if (!dueDate) missing.push("data");
    if (category === "Cartão" && !selectedCard) missing.push("cartão");
    if (!missing.length) {
      void saveVoiceTransaction(
        voiceTransactionPayload({
          ...draft,
          cardSnapshot: cardSnapshot(selectedCard),
        }),
        "",
        `${type === "income" ? "Entrada" : "Despesa"} adicionada e salva.`,
      );
      return true;
    }
    closeVoiceAssistant();
    openRecordModal(draft);
    toast(
      `Não salvei ainda: informe ${missing.join(", ")} e confirme o lançamento.`,
      "danger",
    );
    return true;
  }

  completeVoiceAction(
    "Formulário preparado. Revise os dados antes de salvar.",
    () => openRecordModal(draft),
  );
  return true;
}

function voicePaymentQuery(command) {
  const noise = [
    ...voiceLexicon.paid,
    ...voiceLexicon.received,
    ...voiceLexicon.save,
    ...voiceLexicon.filler,
    "marcar",
    "marque",
    "marca",
    "colocar",
    "coloque",
    "coloca",
    "botar",
    "bote",
    "bota",
    "põe",
    "poe",
    "baixar",
    "baixe",
    "baixa",
    "como",
    "já",
    "foi",
    "está",
    "tá",
    "agora",
    "hoje",
    "a conta",
    "o boleto",
    "a despesa",
    "a entrada",
    "o pagamento",
    "e",
    "que",
  ];
  return voiceRemoveTerms(command, noise)
    .replace(/^(?:a|o|as|os|na|no|da|do|de|que)\s+/, "")
    .replace(/\b(?:por favor|pra mim|para mim)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function voiceMarkAsCompleted(command) {
  const received = voiceHasAny(command, voiceLexicon.received);
  const paid = voiceHasAny(command, voiceLexicon.paid);
  if (!received && !paid) return false;
  const saveImmediately = voiceWantsImmediateSave(command);
  const query = voicePaymentQuery(command);
  if (!query) return false;
  if (!canEdit()) {
    voiceCommandNotUnderstood(
      "Seu acesso permite apenas visualizar lançamentos.",
    );
    return true;
  }
  const queryWords = query
    .split(" ")
    .filter(
      (word) =>
        word.length > 2 &&
        ![
          "conta",
          "fatura",
          "despesa",
          "receita",
          "pagamento",
          "para",
          "com",
          "uma",
        ].includes(word),
    );
  const inferredCategory = voiceCategory(
    query,
    received ? "income" : "expense",
  );
  const inferredCard = received ? null : voiceCard(query);
  const candidates = monthTransactions().filter(
    (item) => {
      const haystack = normalizeVoiceText(
        `${item.description} ${categoryMeta(item)}`,
      );
      return (
        item.type === (received ? "income" : "expense") &&
        item.status !== "paid" &&
        (haystack.includes(query) ||
          (inferredCard && item.cardId === inferredCard.id) ||
          (!inferredCard &&
            inferredCategory &&
            item.category === inferredCategory) ||
          (queryWords.length &&
            queryWords.every((word) => haystack.includes(word))))
      );
    },
  );
  if (!candidates.length) {
    voiceCommandNotUnderstood(
      `Não encontrei nenhum lançamento pendente com “${query}” neste mês.`,
    );
    return true;
  }
  if (candidates.length === 1 && saveImmediately) {
    const item = candidates[0];
    void saveVoiceTransaction(
      voiceTransactionPayload(item, {
        status: "paid",
        paidDate: todayKey(),
      }),
      item.id,
      received
        ? "Entrada marcada como recebida e salva."
        : "Despesa marcada como paga e salva.",
    );
    return true;
  }
  completeVoiceAction(
    candidates.length === 1
      ? "Lançamento encontrado. Confirme os dados antes de salvar."
      : saveImmediately
        ? `${candidates.length} lançamentos encontrados. Escolha qual deseja salvar.`
        : `${candidates.length} lançamentos encontrados. Escolha o correto.`,
    () => {
      if (candidates.length === 1)
        openRecordModal({
          ...candidates[0],
          status: "paid",
          paidDate: todayKey(),
        });
      else openVoiceRecordChoice(candidates, received, saveImmediately);
    },
  );
  return true;
}

function executeVoiceCommand(transcript) {
  const command = normalizeVoiceText(transcript);
  if (!command) return voiceCommandNotUnderstood();

  if (
    voiceHasAny(command, [
      "ajuda",
      "me ajuda",
      "comandos",
      "o que posso dizer",
      "como funciona a voz",
    ])
  ) {
    updateVoiceAssistant(
      "Fale naturalmente: você pode adicionar contas e entradas, dar baixa, consultar pendências, navegar, buscar e filtrar.",
      transcript,
    );
    return;
  }

  if (handleVoiceNewRecord(command)) return;

  if (voiceMarkAsCompleted(command)) return;

  if (
    voiceHasAny(command, [
      "limpar filtros",
      "limpa os filtros",
      "remover filtros",
      "remove os filtros",
      "tirar os filtros",
      "tira os filtros",
      "mostrar tudo",
      "mostra tudo",
    ])
  ) {
    completeVoiceAction("Filtros removidos.", () => {
      state.calendarFilters = {
        query: "",
        expenseCategory: "",
        cardId: "",
        sort: "date",
      };
      state.view = "calendar";
      renderApp();
    });
    return;
  }

  const searchMatch = command.match(
    /\b(?:buscar|busque|busca|pesquisar|pesquise|pesquisa|procurar|procure|procura|achar|ache|acha|encontrar|encontre|encontra)(?:\s+por)?\s+(.+)/,
  );
  if (searchMatch) {
    const searchQuery =
      voiceRemoveTerms(searchMatch[1], voiceLexicon.filler) || searchMatch[1];
    completeVoiceAction(`Buscando por “${searchQuery}”.`, () => {
      state.calendarFilters = {
        query: searchQuery,
        expenseCategory: "",
        cardId: "",
        sort: "date",
      };
      state.calendarLayout = "agenda";
      state.view = "calendar";
      localStorage.setItem("organiza-calendar-layout", "agenda");
      renderApp();
    });
    return;
  }

  if (voiceHasAny(command, voiceLexicon.filter)) {
    const category = voiceCategory(command, "expense");
    if (!category) {
      voiceCommandNotUnderstood(
        "Não identifiquei a categoria de despesa para aplicar o filtro.",
      );
      return;
    }
    const selectedCard = category === "Cartão" ? voiceCard(command) : null;
    completeVoiceAction(
      selectedCard
        ? `Mostrando faturas do cartão ${selectedCard.name}.`
        : `Mostrando despesas de ${category}.`,
      () => {
        state.calendarFilters = {
          query: "",
          expenseCategory: category,
          cardId: selectedCard?.id || "",
          sort: "date",
        };
        state.calendarLayout = "agenda";
        state.view = "calendar";
        localStorage.setItem("organiza-calendar-layout", "agenda");
        renderApp();
      },
    );
    return;
  }

  if (
    /\b(menor\s+(?:para|pro)\s+(?:o\s+)?maior|crescente|mais barato primeiro|menores primeiro)\b/.test(
      command,
    )
  ) {
    completeVoiceAction("Lançamentos ordenados do menor valor para o maior.", () => {
      state.calendarFilters.sort = "amount-asc";
      state.calendarLayout = "agenda";
      state.view = "calendar";
      renderApp();
    });
    return;
  }
  if (
    /\b(maior\s+(?:para|pro)\s+(?:o\s+)?menor|decrescente|mais caro primeiro|maiores primeiro)\b/.test(
      command,
    )
  ) {
    completeVoiceAction("Lançamentos ordenados do maior valor para o menor.", () => {
      state.calendarFilters.sort = "amount-desc";
      state.calendarLayout = "agenda";
      state.view = "calendar";
      renderApp();
    });
    return;
  }

  if (
    voiceHasAny(command, [
      "próximo mês",
      "mês seguinte",
      "mês que vem",
      "avança um mês",
      "avançar um mês",
    ])
  ) {
    completeVoiceAction("Avançando para o próximo mês.", () => {
      shiftVoiceMonth(1);
      renderApp();
    });
    return;
  }
  if (
    voiceHasAny(command, [
      "mês anterior",
      "mês passado",
      "volta um mês",
      "voltar um mês",
    ])
  ) {
    completeVoiceAction("Voltando para o mês anterior.", () => {
      shiftVoiceMonth(-1);
      renderApp();
    });
    return;
  }
  if (
    voiceHasAny(command, [
      "mês atual",
      "voltar para hoje",
      "ir para hoje",
      "volta pra hoje",
      "vai pra hoje",
    ])
  ) {
    completeVoiceAction("Mostrando o mês atual.", () => {
      state.month = new Date().toISOString().slice(0, 7);
      renderApp();
    });
    return;
  }
  const namedMonth = voiceMonthFromName(command);
  if (
    namedMonth &&
    (voiceHasAny(command, voiceLexicon.open) ||
      voiceHasAny(command, ["mudar", "mude", "trocar", "troque"]))
  ) {
    completeVoiceAction("Período atualizado.", () => {
      state.month = namedMonth;
      renderApp();
    });
    return;
  }

  if (
    voiceHasAny(command, [
      "modo escuro",
      "tema escuro",
      "modo noturno",
      "deixa escuro",
      "deixe escuro",
    ])
  ) {
    completeVoiceAction("Modo escuro ativado.", () =>
      setThemePreference("dark"),
    );
    return;
  }
  if (
    voiceHasAny(command, [
      "modo claro",
      "tema claro",
      "deixa claro",
      "deixe claro",
    ])
  ) {
    completeVoiceAction("Modo claro ativado.", () =>
      setThemePreference("light"),
    );
    return;
  }

  const wantsToOpen = voiceHasAny(command, voiceLexicon.open);
  if (
    wantsToOpen &&
    voiceHasAny(command, [
      "visão geral",
      "início",
      "dashboard",
      "painel",
      "resumo",
    ])
  ) {
    completeVoiceAction("Abrindo a visão geral.", () => {
      state.view = "dashboard";
      renderApp();
    });
    return;
  }
  if (
    wantsToOpen &&
    voiceHasAny(command, ["agenda", "calendário", "minhas contas"])
  ) {
    completeVoiceAction("Abrindo a agenda.", () => {
      state.view = "calendar";
      renderApp();
    });
    return;
  }
  if (
    wantsToOpen &&
    voiceHasAny(command, ["configurações", "configuração", "ajustes"])
  ) {
    completeVoiceAction("Abrindo as configurações.", () => {
      state.view = "settings";
      renderApp();
    });
    return;
  }
  if (
    wantsToOpen &&
    voiceHasAny(command, ["usuários", "usuário", "permissões", "acessos"])
  ) {
    if (state.profile.role !== "master") {
      voiceCommandNotUnderstood(
        "A gestão de usuários está disponível somente para o administrador master.",
      );
      return;
    }
    completeVoiceAction("Abrindo a gestão de usuários.", () => {
      state.view = "users";
      observeUsers();
      renderApp();
    });
    return;
  }

  const summaryType = voiceHasAny(command, [
    "quanto falta pagar",
    "o que falta pagar",
    "quanto ainda falta",
    "a pagar",
    "despesa pendente",
    "despesas pendentes",
    "pendência",
    "pendências",
    "contas abertas",
  ])
      ? "pending"
      : voiceHasAny(command, [
            "quanto entrou",
            "total de entradas",
            "minhas entradas",
            "minhas receitas",
            "detalhar entradas",
            "mostrar entradas",
            "ver entradas",
          ])
        ? "income"
        : voiceHasAny(command, [
              "quanto gastei",
              "quanto vou gastar",
              "total de gastos",
              "total de despesas",
              "minhas despesas",
              "detalhar despesas",
              "mostrar despesas",
              "ver despesas",
            ])
          ? "expense"
          : voiceHasAny(command, [
                "quanto já paguei",
                "total pago",
                "total que paguei",
                "despesas pagas",
                "ver pagamentos",
              ])
            ? "paid"
            : "";
  if (summaryType) {
    completeVoiceAction("Abrindo o detalhamento solicitado.", () =>
      openSummaryModal(summaryType),
    );
    return;
  }

  voiceCommandNotUnderstood();
}

function observeUsers() {
  if (state.profile.role !== "master") return;
  stopUsers();
  stopUsers = FirebaseService.observeUsers((users) => {
    state.users = users;
    if (state.view === "users") renderApp();
  }, firebaseError);
}
function currentRole() {
  return state.selected?.memberRoles?.[state.user?.uid];
}
function canEdit() {
  return ["owner", "editor"].includes(currentRole());
}
function isOwner() {
  return currentRole() === "owner";
}
function financialStatus(item) {
  if (item.status === "paid")
    return item.type === "income"
      ? { className: "received", label: "Recebido" }
      : { className: "paid", label: "Pago" };
  const overdue =
    item.type === "expense" && item.dueDate && item.dueDate < todayKey();
  return overdue
    ? { className: "overdue", label: "Em atraso" }
    : { className: "pending", label: "Pendente" };
}
function calendarStatus(item) {
  const status = financialStatus(item).className;
  if (item.type === "income")
    return status === "received" ? "income-received" : "income-pending";
  return `expense-${status}`;
}
function openRecordDetails(item) {
  showModal(
    `<article class="modal"><button class="modal-close" type="button">×</button><span class="eyebrow">SOMENTE LEITURA</span><h2>${esc(item.description)}</h2><p>${esc(categoryMeta(item))} · ${formatDate(item.dueDate)}</p><div class="summary">${categoryIconBadge(item, "summary-icon")}<div><small>Valor</small><b>${money.format(item.amount)}</b></div></div>${item.category === "Cartão" ? `<p><strong>Cartão:</strong> ${esc(cardNameFor(item))}</p>` : ""}<p><strong>Data planejada:</strong> ${formatDate(item.plannedDate)}</p><p><strong>Data real:</strong> ${formatDate(item.paidDate)}</p>${item.notes ? `<p>${esc(item.notes)}</p>` : ""}${item.attachment?.url ? `<a class="btn btn-soft" href="${attr(item.attachment.url)}" target="_blank" rel="noopener">Abrir comprovante</a>` : ""}</article>`,
  );
}
function openSummaryModal(type) {
  const definitions = {
    income: {
      eyebrow: "ENTRADAS DO MÊS",
      title: "Composição das entradas",
      description:
        "Entradas previstas e recebidas com data de recebimento no mês selecionado.",
      filter: (item) => item.type === "income",
    },
    expense: {
      eyebrow: "DESPESAS DO MÊS",
      title: "Composição das despesas",
      description:
        "Todas as despesas, pagas ou pendentes, com vencimento no mês selecionado.",
      filter: (item) => item.type === "expense",
    },
    paid: {
      eyebrow: "PAGO NO TOTAL",
      title: "Despesas consideradas pagas",
      description:
        "Despesas com vencimento no mês selecionado que estão marcadas como pagas, mesmo quando o pagamento ocorreu em outra data.",
      filter: (item) => item.type === "expense" && item.status === "paid",
    },
    pending: {
      eyebrow: "AINDA A PAGAR",
      title: "Despesas aguardando pagamento",
      description:
        "Despesas do mês selecionado que ainda não foram marcadas como pagas.",
      filter: (item) => item.type === "expense" && item.status !== "paid",
    },
  };
  const definition = definitions[type];
  if (!definition) return;
  const items = monthTransactions()
    .filter(definition.filter)
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
  const total = sum(items);
  const rows = items.length
    ? `<div class="summary-detail-list">${items.map(summaryDetailRow).join("")}</div>`
    : `<div class="summary-detail-empty">Nenhum lançamento compõe este total.</div>`;
  showModal(
    `<article class="modal modal-large summary-detail-modal"><button class="modal-close" type="button">×</button><span class="eyebrow">${definition.eyebrow}</span><h2>${definition.title}</h2><p>${definition.description}</p><div class="summary-detail-total"><div><small>Total considerado</small><b>${money.format(total)}</b></div><span>${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"}</span></div>${rows}</article>`,
  );
  document.querySelectorAll("[data-summary-edit]").forEach(
    (button) =>
      (button.onclick = () => {
        const item = state.transactions.find(
          (transaction) => transaction.id === button.dataset.summaryEdit,
        );
        if (!item) return;
        if (canEdit()) openRecordModal(item);
        else openRecordDetails(item);
      }),
  );
}
function summaryDetailRow(item) {
  const status = financialStatus(item);
  return `<button class="summary-detail-row" type="button" data-summary-edit="${item.id}">${categoryIconBadge(item)}<span class="summary-detail-copy"><b>${esc(item.description)}</b><small>${esc(categoryMeta(item))} · ${formatDate(item.dueDate)}</small></span><strong class="${item.type === "income" ? "positive" : ""}">${item.type === "income" ? "+ " : ""}${money.format(item.amount)}</strong><span class="pill ${status.className}">${status.label}</span></button>`;
}
function openManagementModal(item = null) {
  const editing = Boolean(item?.id);
  showModal(
    `<form class="modal" id="managementForm"><button class="modal-close" type="button">×</button><span class="eyebrow">${editing ? "EDITAR" : "NOVO"} ESPAÇO</span><h2>${editing ? "Editar gerenciamento" : "Criar gerenciamento"}</h2><label>Nome<input name="name" placeholder="Ex.: Contas de casa" value="${attr(item?.name || "")}" required maxlength="80"></label><label>Descrição<textarea name="description" placeholder="Opcional" maxlength="240">${esc(item?.description || "")}</textarea></label><button class="btn btn-primary wide" type="submit">${editing ? "Salvar alterações" : "Criar gerenciamento"}</button></form>`,
  );
  const form = document.querySelector("#managementForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    busy(button, true);
    try {
      const data = Object.fromEntries(new FormData(form));
      if (editing)
        await FirebaseService.updateManagement(item.id, {
          name: data.name.trim(),
          description: data.description.trim(),
        });
      else await FirebaseService.createManagement(data, state.user);
      closeModal();
      toast(editing ? "Gerenciamento atualizado." : "Gerenciamento criado.");
    } catch (err) {
      firebaseError(err);
      busy(button, false);
    }
  };
}
function openShareModal() {
  showModal(
    `<form class="modal" id="shareForm"><button class="modal-close" type="button">×</button><span class="eyebrow">ACESSO COMPARTILHADO</span><h2>Compartilhar gerenciamento</h2><p>A pessoa precisa ter uma conta criada pelo master.</p><label>E-mail do usuário<input name="email" type="email" required></label><label>Permissão<select name="role"><option value="editor">Pode adicionar e editar</option><option value="viewer">Somente visualizar</option></select></label><button class="btn btn-primary wide" type="submit">Compartilhar acesso</button></form>`,
  );
  const form = document.querySelector("#shareForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await FirebaseService.shareManagement({
        managementId: state.selected.id,
        ...Object.fromEntries(new FormData(form)),
      });
      closeModal();
      toast("Gerenciamento compartilhado.");
    } catch (err) {
      firebaseError(err);
    }
  };
}
function openUserModal() {
  showModal(
    `<form class="modal" id="userForm"><button class="modal-close" type="button">×</button><span class="eyebrow">ACESSO</span><h2>Criar novo usuário</h2><label>Nome<input name="name" required maxlength="100"></label><label>E-mail<input name="email" type="email" required></label><label>Senha temporária<input name="password" type="password" minlength="8" required></label><label class="check"><input name="canCreateManagement" type="checkbox"> Pode criar seus próprios gerenciamentos</label><button class="btn btn-primary wide" type="submit">Criar usuário</button></form>`,
  );
  const form = document.querySelector("#userForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.canCreateManagement = form.canCreateManagement.checked;
    try {
      await FirebaseService.createManagedUser(data);
      closeModal();
      toast("Usuário criado com sucesso.");
    } catch (err) {
      firebaseError(err);
    }
  };
}

function openCardModal(item = null, onSaved = null) {
  if (!state.selected || !canEdit()) return;
  const editing = Boolean(item?.id);
  const layer = document.createElement("div");
  layer.className = "modal-backdrop secondary-modal-backdrop";
  layer.innerHTML = `<form class="modal modal-large card-editor-modal" id="cardForm" role="dialog" aria-modal="true" aria-labelledby="cardFormTitle"><button class="modal-close" type="button" aria-label="Fechar">×</button><span class="eyebrow">${editing ? "EDITAR" : "NOVO"} CARTÃO</span><h2 id="cardFormTitle">${editing ? "Personalizar cartão" : "Adicionar cartão"}</h2><p>Use apenas dados de identificação. Não informe número completo, validade ou código de segurança.</p><div class="card-editor-layout"><div class="card-editor-fields"><label>Nome do cartão<input name="name" value="${attr(item?.name || "")}" placeholder="Ex.: Nubank, Itaú Platinum" required maxlength="60" autocomplete="off"></label><label>Nome do titular<input name="holderName" value="${attr(item?.holderName || "")}" placeholder="Como aparece no cartão" required maxlength="80" autocomplete="off"></label><label class="full">URL da logo <small>Opcional · use um endereço HTTPS de imagem</small><input name="logoUrl" type="url" inputmode="url" value="${attr(item?.logoUrl || "")}" placeholder="https://exemplo.com/logo.png"></label><fieldset class="card-color-field"><legend>Cor do cartão</legend><div class="card-color-row"><input name="backgroundColor" type="color" value="${attr(validCardColor(item?.backgroundColor))}" aria-label="Escolher uma cor"><div class="card-color-presets" aria-label="Cores sugeridas">${["#3157d5", "#111827", "#6d28d9", "#be123c", "#0369a1", "#f59e0b"].map((color) => `<button type="button" data-card-color="${color}" style="--preset-color:${color}" aria-label="Usar cor ${color}"></button>`).join("")}</div></div></fieldset><div class="card-day-fields"><label>Dia de fechamento <small>Opcional</small><input name="closingDay" type="number" min="1" max="31" inputmode="numeric" value="${item?.closingDay || ""}" placeholder="Ex.: 5"></label><label>Dia de vencimento <small>Opcional</small><input name="dueDay" type="number" min="1" max="31" inputmode="numeric" value="${item?.dueDay || ""}" placeholder="Ex.: 12"></label></div></div><div class="card-editor-preview"><small>PRÉ-VISUALIZAÇÃO</small><div id="cardPreview"></div><p>A cor do texto é ajustada automaticamente para manter o contraste.</p></div></div><div class="modal-actions"><button class="btn btn-soft" type="button" data-card-cancel>Cancelar</button><button class="btn btn-primary" type="submit">${editing ? "Salvar alterações" : "Adicionar cartão"}</button></div></form>`;
  document.body.append(layer);
  const form = layer.querySelector("#cardForm");
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    layer.remove();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  const refreshPreview = () => {
    const previewCard = {
      name: form.elements.name.value,
      holderName: form.elements.holderName.value,
      logoUrl: form.elements.logoUrl.value,
      backgroundColor: form.elements.backgroundColor.value,
      closingDay: form.elements.closingDay.value,
      dueDay: form.elements.dueDay.value,
    };
    layer.querySelector("#cardPreview").innerHTML = renderCardVisual(
      previewCard,
      true,
    );
    layer.querySelectorAll("[data-card-logo]").forEach(
      (image) =>
        (image.onerror = () => {
          image.hidden = true;
        }),
    );
    layer.querySelectorAll("[data-card-color]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.cardColor.toLowerCase() ===
          form.elements.backgroundColor.value.toLowerCase(),
      );
    });
  };
  layer.querySelector(".modal-close").onclick = close;
  layer.querySelector("[data-card-cancel]").onclick = close;
  layer.onclick = (event) => {
    if (event.target === layer) close();
  };
  document.addEventListener("keydown", onKeydown);
  form.querySelectorAll("input").forEach(
    (input) => (input.oninput = refreshPreview),
  );
  layer.querySelectorAll("[data-card-color]").forEach(
    (button) =>
      (button.onclick = () => {
        form.elements.backgroundColor.value = button.dataset.cardColor;
        refreshPreview();
      }),
  );
  refreshPreview();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    if (data.logoUrl.trim() && !safeLogoUrl(data.logoUrl)) {
      toast("A logo precisa usar uma URL HTTPS válida.", "danger");
      form.elements.logoUrl.focus();
      return;
    }
    data.logoUrl = safeLogoUrl(data.logoUrl);
    data.backgroundColor = validCardColor(data.backgroundColor);
    data.active = item?.active !== false;
    busy(button, true);
    try {
      const cardRef = await FirebaseService.saveCard(
        state.selected.id,
        data,
        state.user.uid,
        item?.id,
      );
      const savedCard = { ...item, ...data, id: item?.id || cardRef.id };
      state.cards = [
        ...state.cards.filter((card) => card.id !== savedCard.id),
        savedCard,
      ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      close();
      if (onSaved) onSaved(savedCard);
      else renderApp();
      toast(editing ? "Cartão atualizado." : "Cartão adicionado.");
    } catch (error) {
      firebaseError(error);
      busy(button, false);
    }
  };
  form.elements.name.focus();
}

function recurrenceBaseDescription(item) {
  if (item.recurrenceBaseDescription) return item.recurrenceBaseDescription;
  if (item.recurrenceType !== "installment") return item.description || "";
  const suffix = ` (${item.recurrenceIndex}/${item.recurrenceTotal})`;
  return String(item.description || "").endsWith(suffix)
    ? item.description.slice(0, -suffix.length)
    : item.description || "";
}

function recurrenceDescription(baseDescription, item) {
  return item.recurrenceType === "installment"
    ? `${baseDescription} (${item.recurrenceIndex}/${item.recurrenceTotal})`
    : baseDescription;
}

function refreshRecordCardField(form, preferredId) {
  const field = form?.querySelector("#recordCardField");
  const select = form?.querySelector("#recordCardSelect");
  const preview = form?.querySelector("#recordCardPreview");
  if (!field || !select || !preview) return;
  const isCardInvoice =
    form.elements.type.value === "expense" &&
    form.elements.category.value === "Cartão";
  field.hidden = !isCardInvoice;
  select.required = isCardInvoice;
  if (!isCardInvoice) return;
  const selectedId =
    preferredId === undefined ? select.value : String(preferredId || "");
  const available = state.cards.filter(
    (card) => card.active !== false || card.id === selectedId,
  );
  select.innerHTML = `<option value="">${available.length ? "Selecione o cartão" : "Cadastre seu primeiro cartão"}</option>${cardOptions(selectedId)}`;
  select.value = available.some((card) => card.id === selectedId)
    ? selectedId
    : "";
  const card = cardById(select.value);
  preview.innerHTML = card
    ? renderCardVisual(card, true)
    : `<div class="record-card-empty">${icon("credit-card")}<span><b>Qual cartão gerou esta fatura?</b><small>Essa identificação aparecerá na agenda e nos relatórios.</small></span></div>`;
  preview.querySelectorAll("[data-card-logo]").forEach(
    (image) =>
      (image.onerror = () => {
        image.hidden = true;
      }),
  );
}

function openRecordModal(item = {}) {
  const type = item.type || "expense";
  const paid = item.status === "paid";
  const isRecurring = Boolean(
    item.recurrenceGroupId && Number(item.recurrenceTotal) > 1,
  );
  const baseDescription = isRecurring
    ? recurrenceBaseDescription(item)
    : item.description || "";
  const seriesItems = isRecurring
    ? state.transactions.filter(
        (transaction) =>
          transaction.recurrenceGroupId === item.recurrenceGroupId,
      )
    : [];
  const seriesOccurrences = seriesItems.length || Number(item.recurrenceTotal);
  const remainingOccurrences = isRecurring
    ? seriesItems.filter(
        (transaction) =>
          Number(transaction.recurrenceIndex) >= Number(item.recurrenceIndex),
      ).length || 1
    : 1;
  const recurrenceFields = !item.id
    ? `<section class="recurrence-card full" id="recurrenceCard">
    <label class="recurrence-toggle">
      <input name="recurrenceEnabled" type="checkbox">
      <span><b>Repetir esta despesa</b><small>Crie os próximos meses de uma só vez.</small></span>
    </label>
    <div class="recurrence-options" id="recurrenceOptions" hidden>
      <label>Total de meses <small>Incluindo o mês atual</small><input name="recurrenceMonths" type="number" min="2" max="60" value="2" inputmode="numeric"></label>
      <label>Tipo de repetição<select name="recurrenceType"><option value="fixed">Despesa fixa — mesmo nome</option><option value="installment">Parcelamento — numerar parcelas</option></select></label>
    </div>
  </section>`
    : isRecurring
      ? `<section class="recurrence-context full"><b>${item.recurrenceType === "installment" ? "Parcela" : "Despesa recorrente"} ${item.recurrenceIndex} de ${item.recurrenceTotal}</b><small>Valor, datas e descrição podem ser propagados. Pagamento e comprovante continuam individuais.</small><div class="recurrence-scope" role="radiogroup" aria-label="Alcance da alteração"><label><input type="radio" name="recurrenceScope" value="single" checked><span><b>Somente este</b><small>Os outros meses não mudam</small></span></label>${remainingOccurrences > 1 ? `<label><input type="radio" name="recurrenceScope" value="future"><span><b>Este e os próximos</b><small>${remainingOccurrences} lançamentos</small></span></label>` : ""}<label><input type="radio" name="recurrenceScope" value="all"><span><b>Toda a série</b><small>${seriesOccurrences} lançamentos</small></span></label></div></section>`
      : "";
  showModal(
    `<form class="modal modal-large" id="recordForm"><button class="modal-close" type="button">×</button><span class="eyebrow">${item.id ? "EDITAR" : "NOVO"} LANÇAMENTO</span><h2>${item.id ? esc(item.description) : "Adicionar ao calendário"}</h2><div class="type-toggle"><label><input type="radio" name="type" value="expense" ${type === "expense" ? "checked" : ""}> Débito</label><label><input type="radio" name="type" value="income" ${type === "income" ? "checked" : ""}> Entrada</label></div><div class="form-grid"><label>Descrição<input name="description" value="${attr(baseDescription)}" required maxlength="120"></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" value="${item.amount || ""}" required></label><label>Categoria<select name="category" id="categorySelect" required></select></label><label>Data de vencimento/recebimento<input name="dueDate" type="date" value="${item.dueDate || ""}" required></label><section class="record-card-field full" id="recordCardField" hidden><div class="record-card-select-row"><label>Cartão da fatura<select name="cardId" id="recordCardSelect"></select></label><button class="btn btn-soft" id="quickAddCard" type="button">${icon("plus")} Cadastrar cartão</button></div><div id="recordCardPreview"></div></section><label>Data que deseja pagar/receber<input name="plannedDate" type="date" value="${item.plannedDate || item.dueDate || ""}"></label><label>Status<select name="status" id="status"><option value="pending" ${!paid ? "selected" : ""}>Pendente</option><option value="paid" ${paid ? "selected" : ""}>${type === "income" ? "Recebido" : "Pago"}</option></select></label><label id="paidDateLabel">Data real do pagamento/recebimento<input name="paidDate" type="date" value="${item.paidDate || ""}"></label>${recurrenceFields}<label class="full">Observações<textarea name="notes" maxlength="500">${esc(item.notes || "")}</textarea></label><label class="full file-label">Comprovante (imagem ou PDF, até 10 MB)<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">${item.attachment?.url ? `<a href="${attr(item.attachment.url)}" target="_blank" rel="noopener">Abrir comprovante atual: ${esc(item.attachment.name)}</a>` : ""}</label></div><div class="modal-actions">${item.id ? '<button class="btn btn-danger" type="button" id="deleteRecord">Excluir</button>' : ""}<button class="btn btn-primary" type="submit">Salvar lançamento</button></div></form>`,
  );
  const form = document.querySelector("#recordForm");
  const category = form.querySelector("#categorySelect");
  const recurrenceCard = form.querySelector("#recurrenceCard");
  const recurrenceOptions = form.querySelector("#recurrenceOptions");
  const recurrenceToggle = form.elements.recurrenceEnabled;
  const submitButton = form.querySelector('button[type="submit"]');
  const updateRecurrence = () => {
    if (!recurrenceCard) return;
    const isExpense = form.type.value === "expense";
    recurrenceCard.hidden = !isExpense;
    if (!isExpense) recurrenceToggle.checked = false;
    const enabled = isExpense && recurrenceToggle.checked;
    recurrenceOptions.hidden = !enabled;
    form.elements.recurrenceMonths.required = enabled;
    submitButton.textContent = enabled
      ? "Criar lançamentos"
      : "Salvar lançamento";
  };
  const fillCategories = () => {
    const current = category.value || item.category;
    category.innerHTML = `<option value="">Selecione uma categoria</option>${categories[form.type.value]
      .map((c) => `<option value="${attr(c)}" ${c === current ? "selected" : ""}>${esc(c === "Cartão" ? "Fatura de cartão" : c)}</option>`)
      .join("")}`;
    form.status.options[1].textContent =
      form.type.value === "income" ? "Recebido" : "Pago";
    updateRecurrence();
    refreshRecordCardField(form, item.cardId);
  };
  form
    .querySelectorAll('[name="type"]')
    .forEach((i) => (i.onchange = fillCategories));
  if (recurrenceToggle) recurrenceToggle.onchange = updateRecurrence;
  fillCategories();
  category.onchange = () => refreshRecordCardField(form);
  form.querySelector("#recordCardSelect").onchange = () =>
    refreshRecordCardField(form);
  form.querySelector("#quickAddCard").onclick = () =>
    openCardModal(null, (card) => refreshRecordCardField(form, card.id));
  form.status.onchange = () =>
    (form.paidDate.required = form.status.value === "paid");
  form.status.onchange();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    busy(button, true);
    try {
      const data = Object.fromEntries(new FormData(form));
      const recurring =
        !item.id &&
        form.type.value === "expense" &&
        Boolean(form.elements.recurrenceEnabled?.checked);
      const recurrenceMonths = Number(data.recurrenceMonths);
      const recurrenceType = data.recurrenceType || "fixed";
      const recurrenceScope = data.recurrenceScope || "single";
      delete data.recurrenceEnabled;
      delete data.recurrenceMonths;
      delete data.recurrenceType;
      delete data.recurrenceScope;
      delete data.attachment;
      if (data.type === "expense" && data.category === "Cartão") {
        const selectedCard = cardById(data.cardId);
        if (!selectedCard) {
          toast("Selecione ou cadastre o cartão desta fatura.", "danger");
          form.querySelector("#recordCardSelect").focus();
          busy(button, false);
          return;
        }
        data.cardSnapshot = cardSnapshot(selectedCard);
      } else {
        data.cardId = "";
        data.cardSnapshot = null;
      }
      if (form.attachment.files[0])
        data.attachment = await FirebaseService.uploadAttachment(
          state.selected.id,
          form.attachment.files[0],
          state.user.uid,
        );
      else data.attachment = item.attachment || null;
      if (recurring)
        await FirebaseService.saveRecurringTransactions(
          state.selected.id,
          data,
          state.user.uid,
          recurrenceMonths,
          recurrenceType,
        );
      else if (isRecurring && recurrenceScope !== "single")
        await FirebaseService.updateRecurringTransactions(
          state.selected.id,
          item,
          data,
          state.user.uid,
          recurrenceScope,
        );
      else {
        if (isRecurring) {
          data.recurrenceBaseDescription = data.description.trim();
          data.description = recurrenceDescription(
            data.recurrenceBaseDescription,
            item,
          );
        }
        await FirebaseService.saveTransaction(
          state.selected.id,
          data,
          state.user.uid,
          item.id,
        );
      }
      closeModal();
      if (!item.id) {
        state.view = "dashboard";
        renderApp();
      }
      toast(
        recurring
          ? `${recurrenceMonths} lançamentos criados.`
          : isRecurring && recurrenceScope !== "single"
            ? recurrenceScope === "all"
              ? "Toda a série foi atualizada."
              : "Este e os próximos lançamentos foram atualizados."
            : "Lançamento salvo.",
      );
    } catch (err) {
      firebaseError(err);
      busy(button, false);
    }
  };
  document
    .querySelector("#deleteRecord")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const scope = form.elements.recurrenceScope?.value || "single";
      let count =
        scope === "all"
          ? seriesOccurrences
          : scope === "future"
            ? remainingOccurrences
            : 1;
      const message =
        count > 1
          ? `Excluir ${count} lançamentos desta série? Esta ação não pode ser desfeita.`
          : "Excluir este lançamento? Esta ação não pode ser desfeita.";
      if (!confirm(message)) return;
      busy(button, true);
      try {
        let attachmentPaths = [item.attachment?.path].filter(Boolean);
        if (isRecurring && scope !== "single") {
          const result = await FirebaseService.deleteRecurringTransactions(
            state.selected.id,
            item,
            scope,
          );
          attachmentPaths = result.attachmentPaths;
          count = result.count;
        } else {
          await FirebaseService.deleteTransaction(state.selected.id, item.id);
        }
        Promise.allSettled(
          attachmentPaths.map((path) => FirebaseService.deleteAttachment(path)),
        );
        closeModal();
        toast(
          count > 1
            ? `${count} lançamentos excluídos.`
            : "Lançamento excluído.",
        );
      } catch (err) {
        firebaseError(err);
        busy(button, false);
      }
    });
}

function openLogoutModal() {
  showModal(
    `<article class="modal logout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle"><button class="modal-close" type="button" aria-label="Fechar">×</button><span class="logout-confirm-icon" aria-hidden="true">${icon("logout")}</span><span class="eyebrow">CONFIRMAR SAÍDA</span><h2 id="logoutConfirmTitle">Deseja realmente sair?</h2><p>Sua sessão será encerrada e será necessário entrar novamente para acessar seus gerenciamentos.</p><div class="modal-actions"><button class="btn btn-soft" id="cancelLogout" type="button">Continuar conectado</button><button class="btn btn-danger" id="confirmLogout" type="button">Sair da conta</button></div></article>`,
  );
  const cancelButton = document.querySelector("#cancelLogout");
  cancelButton.onclick = closeModal;
  cancelButton.focus();
  document.querySelector("#confirmLogout").onclick = async (event) => {
    const button = event.currentTarget;
    busy(button, true);
    try {
      await FirebaseService.logout();
    } catch (error) {
      firebaseError(error);
      busy(button, false);
    }
  };
}

function showModal(html) {
  document.querySelector("#modalRoot").innerHTML =
    `<div class="modal-backdrop">${html}</div>`;
  document.querySelector(".modal-close").onclick = closeModal;
}
function closeModal() {
  const root = document.querySelector("#modalRoot");
  if (root) root.innerHTML = "";
  else renderPublic();
}
function busy(button, value) {
  if (!button) return;
  button.disabled = value;
  if (value) {
    button.dataset.text = button.textContent;
    button.textContent = "Aguarde...";
  } else button.textContent = button.dataset.text || button.textContent;
}
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastArea.append(el);
  setTimeout(() => el.remove(), 4000);
}
function firebaseError(error) {
  console.error(error);
  toast(error?.message || "Não foi possível concluir a operação.", "danger");
}
function formatDate(value) {
  return value ? dateLabel.format(new Date(`${value}T12:00:00Z`)) : "Sem data";
}
function initials(name = "") {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "U"
  );
}
function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("organiza-theme", next);
  renderCurrentSurface();
}
function themePreference() {
  return localStorage.getItem("organiza-theme") || "system";
}
function setThemePreference(preference) {
  if (preference === "system") {
    localStorage.removeItem("organiza-theme");
    document.documentElement.dataset.theme = matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches
      ? "dark"
      : "light";
  } else {
    localStorage.setItem("organiza-theme", preference);
    document.documentElement.dataset.theme = preference;
  }
  renderCurrentSurface();
}
function renderCurrentSurface() {
  state.user
    ? renderApp()
    : renderPublic(Boolean(document.querySelector("#loginForm")));
}
function themeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  return `<button class="theme-toggle" id="themeToggle" type="button" aria-label="Ativar modo ${dark ? "claro" : "escuro"}" title="Modo ${dark ? "claro" : "escuro"}">${icon(dark ? "sun" : "moon")}</button>`;
}
function icon(name) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.02A1.7 1.7 0 0 0 10 3.07V3h4v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.02A1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    gauge:
      '<path d="M4 15a8 8 0 0 1 16 0"/><path d="m12 15 4-5"/><circle cx="12" cy="15" r="1"/>',
    wallet:
      '<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/>',
    "credit-card":
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    droplet:
      '<path d="M12 2.7s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"/><path d="M9 15.5a3 3 0 0 0 3 2"/>',
    bolt: '<path d="m13 2-8 12h7l-1 8 8-12h-7Z"/>',
    smartphone:
      '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 18h2"/>',
    wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>',
    utensils:
      '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3v18M14 3v7h3"/>',
    car: '<path d="m5 17-1-4 2-5h12l2 5-1 4Z"/><path d="M5 17v2M19 17v2M4 13h16M7 13h.01M17 13h.01"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M7 12h2l1-2 2 5 1.5-3H17"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4ZM20 4h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4Z"/>',
    gamepad:
      '<path d="M8 8h8a5 5 0 0 1 4.8 6.4l-1 3.2a2 2 0 0 1-3.3.8L14.5 16h-5l-2 2.4a2 2 0 0 1-3.3-.8l-1-3.2A5 5 0 0 1 8 8Z"/><path d="M7 12v4M5 14h4M16 13h.01M18 15h.01"/>',
    receipt:
      '<path d="M6 2v20l3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2Z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    handshake:
      '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 0-2.8 0l-.8.8a1 1 0 0 1-1.4 0l-.2-.2a2 2 0 0 1 0-2.8l2.3-2.2"/><path d="m18 2 3 3-6 6M2 5l3-3 6 6M6 12l5 5M4 14l5 5M2 16l3 3"/>',
    tag: '<path d="m20 13-7 7L4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1.5"/>',
    banknote:
      '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H6a1 1 0 0 1-1-1M17 15h1a1 1 0 0 1 1 1"/>',
    laptop:
      '<rect x="5" y="4" width="14" height="11" rx="1"/><path d="M3 19h18M7 19l1-4h8l1 4"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M7.5 9C5 9 4 7.8 4 6.5S5 4 6.5 4C9 4 12 9 12 9M16.5 9C19 9 20 7.8 20 6.5S19 4 17.5 4C15 4 12 9 12 9"/>',
    "trending-up": '<path d="m3 17 6-6 4 4 7-8"/><path d="M14 7h6v6"/>',
    "rotate-ccw": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    "shopping-bag":
      '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    search:
      '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chart:
      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    palette:
      '<path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10Z"/><circle cx="7.5" cy="10.5" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="14" cy="7" r=".7"/>',
    monitor:
      '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>',
    shield:
      '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z"/><path d="m9 12 2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    logout:
      '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    share:
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
}
function googleIcon() {
  return `<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.25-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>`;
}
function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
const attr = esc;
