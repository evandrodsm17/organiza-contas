import { FirebaseService } from "./firebase-service.js";

const app = document.querySelector("#app");
const toastArea = document.querySelector("#toastArea");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const state = { user: null, profile: null, managements: [], selected: null, transactions: [], month: new Date().toISOString().slice(0, 7), view: "dashboard", users: [] };
let stopManagements = () => {}, stopTransactions = () => {}, stopUsers = () => {};

const categories = {
  expense: ["Cartão", "Água", "Energia", "Celular", "Internet", "Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer", "Impostos", "Outros"],
  income: ["Salário", "Freelance", "Benefício", "Rendimento", "Reembolso", "Venda", "Outros"]
};

FirebaseService.observeAuth(async (user) => {
  cleanupObservers(); state.user = user;
  if (!user) { state.profile = null; renderPublic(); return; }
  try {
    state.profile = await FirebaseService.profile(user.uid);
    if (!state.profile?.active) throw new Error("Seu acesso está inativo ou ainda não foi autorizado pelo master.");
    observeManagements();
  } catch (error) { toast(error.message, "danger"); await FirebaseService.logout(); }
});

function cleanupObservers() { stopManagements(); stopTransactions(); stopUsers(); stopManagements = stopTransactions = stopUsers = () => {}; }

function renderPublic(showLogin = false) {
  app.innerHTML = `<header class="public-header"><a class="brand" href="#"><span class="brand-mark">C</span><span>Conta Clara</span></a><button class="btn btn-ghost" id="loginOpen">Entrar</button></header>
  <main><section class="hero"><div class="hero-copy"><span class="eyebrow">FINANÇAS EM CONJUNTO</span><h1>As contas do mês,<br><em>claras para todos.</em></h1><p>Organize receitas, vencimentos, pagamentos e comprovantes em um calendário compartilhado com quem cuida das finanças com você.</p><button class="btn btn-primary" id="heroLogin">Acessar meu espaço <span>→</span></button><div class="hero-points"><span>✓ Calendário mensal</span><span>✓ Acesso compartilhado</span><span>✓ Comprovantes seguros</span></div></div>
  <div class="hero-visual"><div class="mock-card"><div class="mock-head"><span>Resumo de julho</span><b>${money.format(5280)}</b></div><div class="mock-progress"><i></i></div><div class="mock-row"><span class="cat-icon orange">⚡</span><div><b>Energia</b><small>Vence dia 12</small></div><strong>${money.format(219.4)}</strong></div><div class="mock-row"><span class="cat-icon green">↗</span><div><b>Salário</b><small>Recebido dia 05</small></div><strong class="positive">+ ${money.format(4800)}</strong></div><div class="mock-row"><span class="cat-icon blue">▣</span><div><b>Internet</b><small>Pago antecipado</small></div><span class="pill paid">Pago</span></div></div></div></section>
  <section class="how"><span class="eyebrow">COMO FUNCIONA</span><h2>Do vencimento ao comprovante</h2><div class="feature-grid">${feature("01", "Crie seu espaço", "Separe as finanças da casa, de uma viagem ou de qualquer planejamento compartilhado.")}${feature("02", "Registre tudo", "Adicione entradas e débitos com vencimento, data planejada e categorias personalizadas.")}${feature("03", "Compartilhe", "Convide outra pessoa para consultar, incluir e atualizar os mesmos registros.")}${feature("04", "Confirme o pagamento", "Informe a data real e anexe imagem ou PDF do comprovante quando precisar.")}</div></section></main>
  <footer>Conta Clara · Organização financeira sem complicação</footer>${showLogin ? loginModal() : ""}`;
  document.querySelector("#loginOpen").onclick = () => renderPublic(true);
  document.querySelector("#heroLogin").onclick = () => renderPublic(true);
  bindLogin();
}

function feature(number, title, text) { return `<article class="feature"><span>${number}</span><h3>${title}</h3><p>${text}</p></article>`; }
function loginModal() { return `<div class="modal-backdrop"><form class="modal login-modal" id="loginForm"><button class="modal-close" type="button" id="closeModal">×</button><span class="brand-mark">C</span><h2>Bem-vindo de volta</h2><p>Entre com a conta criada pelo administrador.</p><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary wide" type="submit">Entrar</button><small id="configHint"></small></form></div>`; }
function bindLogin() {
  const form = document.querySelector("#loginForm"); if (!form) return;
  document.querySelector("#closeModal").onclick = () => renderPublic();
  if (!FirebaseService.isConfigured()) document.querySelector("#configHint").textContent = "Firebase ainda não configurado. Consulte FIREBASE_SETUP.md.";
  form.onsubmit = async (event) => { event.preventDefault(); const button = form.querySelector("button[type=submit]"); busy(button, true); try { await FirebaseService.login(form.email.value, form.password.value); } catch { toast("E-mail ou senha inválidos.", "danger"); busy(button, false); } };
}

function observeManagements() {
  stopManagements = FirebaseService.observeManagements(state.user.uid, (items) => {
    state.managements = items;
    if (!state.selected || !items.some((item) => item.id === state.selected.id)) state.selected = items[0] || null;
    observeTransactions(); renderApp();
  }, firebaseError);
}
function observeTransactions() {
  stopTransactions(); state.transactions = [];
  if (!state.selected) return;
  stopTransactions = FirebaseService.observeTransactions(state.selected.id, (items) => { state.transactions = items; renderApp(); }, firebaseError);
}

function renderApp() {
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${state.month}-01T12:00:00Z`));
  app.innerHTML = `<div class="app-shell"><aside><a class="brand brand-light" href="#"><span class="brand-mark">C</span><span>Conta Clara</span></a><div class="profile"><span>${initials(state.profile.name)}</span><div><b>${esc(state.profile.name)}</b><small>${state.profile.role === "master" ? "Administrador master" : "Usuário"}</small></div></div><nav>${nav("dashboard", "⌂", "Visão geral")}${nav("calendar", "□", "Calendário")}${nav("records", "≡", "Lançamentos")}${state.profile.role === "master" ? nav("users", "♙", "Usuários") : ""}</nav><button class="logout" id="logout">↪ Sair</button></aside>
  <main class="workspace"><header class="workspace-head"><div><span class="mobile-brand">Conta Clara</span><h1>${viewTitle()}</h1><p>${state.selected ? esc(state.selected.name) : "Crie seu primeiro gerenciamento"}</p></div><div class="head-actions">${managementSelect()}${isOwner() ? '<button class="btn btn-soft" id="shareBtn">Compartilhar</button>' : ""}<button class="btn btn-primary" id="newRecord" ${!canEdit() ? "disabled" : ""}>+ Novo lançamento</button></div></header>
  ${state.view === "users" ? renderUsers() : state.view === "calendar" ? renderCalendar(monthName) : state.view === "records" ? renderRecords(monthName) : renderDashboard(monthName)}</main></div><div id="modalRoot"></div>`;
  bindShell();
}

function nav(id, icon, label) { return `<button class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}"><span>${icon}</span>${label}</button>`; }
function viewTitle() { return ({ dashboard: "Visão geral", calendar: "Calendário financeiro", records: "Lançamentos", users: "Gestão de usuários" })[state.view]; }
function managementSelect() { return `<select id="managementSelect"><option value="">${state.managements.length ? "Selecionar gerenciamento" : "Nenhum gerenciamento"}</option>${state.managements.map((item) => `<option value="${item.id}" ${state.selected?.id === item.id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select>${state.profile.canCreateManagement || state.profile.role === "master" ? '<button class="icon-btn" id="newManagement" title="Novo gerenciamento">+</button>' : ""}`; }

function monthTransactions() { return state.transactions.filter((item) => (item.dueDate || item.plannedDate || "").startsWith(state.month)); }
function totals() { const list = monthTransactions(); return { income: sum(list.filter((i) => i.type === "income")), expense: sum(list.filter((i) => i.type === "expense")), paid: sum(list.filter((i) => i.type === "expense" && i.status === "paid")), pending: sum(list.filter((i) => i.type === "expense" && i.status !== "paid")) }; }
function sum(items) { return items.reduce((acc, item) => acc + Number(item.amount || 0), 0); }
function monthControl(name) { return `<div class="month-control"><button data-month="-1">‹</button><strong>${name}</strong><button data-month="1">›</button></div>`; }

function renderDashboard(monthName) {
  if (!state.selected) return emptyManagement(); const total = totals(); const list = monthTransactions().slice(0, 6);
  return `<div class="content-head">${monthControl(monthName)}<span>${monthTransactions().length} lançamentos no período</span></div><section class="summary-grid">${summary("Entradas", total.income, "green", "↗")}${summary("Despesas", total.expense, "red", "↘")}${summary("Pago", total.paid, "blue", "✓")}${summary("Saldo previsto", total.income - total.expense, total.income - total.expense >= 0 ? "green" : "red", "=")}</section><section class="dashboard-grid"><article class="panel"><div class="panel-head"><div><h2>Próximos lançamentos</h2><p>Vencimentos e recebimentos deste mês</p></div><button class="text-btn" data-go="records">Ver todos</button></div>${list.length ? `<div class="record-list">${list.map(recordRow).join("")}</div>` : empty("Nenhum lançamento neste mês.")}</article><article class="panel status-panel"><div class="panel-head"><div><h2>Situação das despesas</h2><p>Acompanhamento do mês</p></div></div><div class="donut" style="--paid:${total.expense ? Math.round(total.paid / total.expense * 100) : 0}"><div><b>${total.expense ? Math.round(total.paid / total.expense * 100) : 0}%</b><span>pago</span></div></div><div class="legend"><span><i class="dot blue"></i>Pago <b>${money.format(total.paid)}</b></span><span><i class="dot orange"></i>Pendente <b>${money.format(total.pending)}</b></span></div></article></section>`;
}
function summary(label, value, color, icon) { return `<article class="summary"><span class="summary-icon ${color}">${icon}</span><div><small>${label}</small><b>${money.format(value)}</b></div></article>`; }
function recordRow(item) { return `<button class="record-row" data-edit="${item.id}"><span class="cat-icon ${item.type === "income" ? "green" : "orange"}">${item.type === "income" ? "↗" : "↘"}</span><div><b>${esc(item.description)}</b><small>${esc(item.category)} · ${formatDate(item.dueDate)}</small></div><strong class="${item.type === "income" ? "positive" : ""}">${item.type === "income" ? "+ " : ""}${money.format(item.amount)}</strong><span class="pill ${item.status === "paid" ? "paid" : "pending"}">${item.status === "paid" ? (item.type === "income" ? "Recebido" : "Pago") : "Pendente"}</span></button>`; }

function renderRecords(monthName) { const list = monthTransactions(); return `<div class="content-head">${monthControl(monthName)}<span>${list.length} registros no período</span></div><article class="panel"><div class="panel-head"><div><h2>Lançamentos do mês</h2><p>${canEdit() ? "Clique em um registro para editar, pagar ou anexar comprovante." : "Você possui acesso somente para consulta."}</p></div></div>${list.length ? `<div class="record-list">${list.map(recordRow).join("")}</div>` : empty("Nenhum lançamento cadastrado.")}</article>`; }

function renderCalendar(monthName) {
  const [year, month] = state.month.split("-").map(Number); const first = new Date(Date.UTC(year, month - 1, 1)); const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); const blanks = first.getUTCDay();
  const cells = Array.from({ length: blanks }, () => '<div class="day muted"></div>');
  for (let day = 1; day <= days; day++) { const date = `${state.month}-${String(day).padStart(2, "0")}`; const items = state.transactions.filter((i) => i.dueDate === date); cells.push(`<div class="day"><b>${day}</b>${items.slice(0, 3).map((i) => `<button data-edit="${i.id}" class="day-item ${i.type}">${esc(i.description)} <strong>${money.format(i.amount)}</strong></button>`).join("")}${items.length > 3 ? `<small>+${items.length - 3} outros</small>` : ""}</div>`); }
  return `<div class="content-head">${monthControl(monthName)}<span>Datas exibidas pelo vencimento</span></div><article class="panel calendar-panel"><div class="weekdays">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar">${cells.join("")}</div></article>`;
}

function renderUsers() { if (state.profile.role !== "master") return ""; return `<div class="content-head"><div><strong>Usuários autorizados</strong><span>Somente o master pode criar e alterar acessos.</span></div><button class="btn btn-primary" id="createUser">+ Criar usuário</button></div><article class="panel"><div class="user-list">${state.users.map((u) => `<div class="user-row"><span>${initials(u.name)}</span><div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div><label class="switch"><input type="checkbox" data-access="${u.id}" data-field="canCreateManagement" ${u.canCreateManagement ? "checked" : ""} ${u.role === "master" ? "disabled" : ""}><i></i> Pode criar gerenciamentos</label><label class="switch"><input type="checkbox" data-access="${u.id}" data-field="active" ${u.active ? "checked" : ""} ${u.role === "master" ? "disabled" : ""}><i></i> Ativo</label><span class="role">${u.role}</span></div>`).join("")}</div></article>`; }
function emptyManagement() { return `<section class="empty-state"><div>◫</div><h2>Comece criando um gerenciamento</h2><p>Você poderá organizar as contas da casa e compartilhar o calendário com outra pessoa.</p>${state.profile.canCreateManagement || state.profile.role === "master" ? '<button class="btn btn-primary" id="emptyCreate">Criar gerenciamento</button>' : '<p>Peça ao administrador permissão para criar gerenciamentos.</p>'}</section>`; }
function empty(text) { return `<div class="empty-inline">${text}</div>`; }

function bindShell() {
  document.querySelector("#logout").onclick = () => FirebaseService.logout();
  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => { state.view = button.dataset.view; if (state.view === "users") observeUsers(); renderApp(); });
  document.querySelectorAll("[data-go]").forEach((button) => button.onclick = () => { state.view = button.dataset.go; renderApp(); });
  document.querySelector("#managementSelect").onchange = (e) => { state.selected = state.managements.find((i) => i.id === e.target.value) || null; observeTransactions(); renderApp(); };
  document.querySelector("#newManagement")?.addEventListener("click", openManagementModal); document.querySelector("#emptyCreate")?.addEventListener("click", openManagementModal);
  document.querySelector("#newRecord")?.addEventListener("click", () => { if (canEdit()) openRecordModal(); }); document.querySelector("#shareBtn")?.addEventListener("click", openShareModal);
  document.querySelector("#createUser")?.addEventListener("click", openUserModal);
  document.querySelectorAll("[data-month]").forEach((b) => b.onclick = () => { const [y, m] = state.month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.month), 1)); state.month = d.toISOString().slice(0, 7); renderApp(); });
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { const item = state.transactions.find((i) => i.id === b.dataset.edit); if (canEdit()) openRecordModal(item); else openRecordDetails(item); });
  document.querySelectorAll("[data-access]").forEach((input) => input.onchange = async () => { try { await FirebaseService.setUserAccess(input.dataset.access, { [input.dataset.field]: input.checked }); toast("Permissão atualizada."); } catch (e) { input.checked = !input.checked; firebaseError(e); } });
}

function observeUsers() { if (state.profile.role !== "master") return; stopUsers(); stopUsers = FirebaseService.observeUsers((users) => { state.users = users; if (state.view === "users") renderApp(); }, firebaseError); }
function currentRole() { return state.selected?.memberRoles?.[state.user?.uid]; }
function canEdit() { return ["owner", "editor"].includes(currentRole()); }
function isOwner() { return currentRole() === "owner"; }
function openRecordDetails(item) { showModal(`<article class="modal"><button class="modal-close" type="button">×</button><span class="eyebrow">SOMENTE LEITURA</span><h2>${esc(item.description)}</h2><p>${esc(item.category)} · ${formatDate(item.dueDate)}</p><div class="summary"><span class="summary-icon ${item.type === "income" ? "green" : "orange"}">${item.type === "income" ? "↗" : "↘"}</span><div><small>Valor</small><b>${money.format(item.amount)}</b></div></div><p><strong>Data planejada:</strong> ${formatDate(item.plannedDate)}</p><p><strong>Data real:</strong> ${formatDate(item.paidDate)}</p>${item.notes ? `<p>${esc(item.notes)}</p>` : ""}${item.attachment?.url ? `<a class="btn btn-soft" href="${attr(item.attachment.url)}" target="_blank" rel="noopener">Abrir comprovante</a>` : ""}</article>`); }
function openManagementModal() { showModal(`<form class="modal" id="managementForm"><button class="modal-close" type="button">×</button><span class="eyebrow">NOVO ESPAÇO</span><h2>Criar gerenciamento</h2><label>Nome<input name="name" placeholder="Ex.: Contas de casa" required maxlength="80"></label><label>Descrição<textarea name="description" placeholder="Opcional" maxlength="240"></textarea></label><button class="btn btn-primary wide">Criar gerenciamento</button></form>`); const form = document.querySelector("#managementForm"); form.onsubmit = async (e) => { e.preventDefault(); const button = form.querySelector("button[type=submit]"); busy(button, true); try { await FirebaseService.createManagement(Object.fromEntries(new FormData(form)), state.user); closeModal(); toast("Gerenciamento criado."); } catch (err) { firebaseError(err); busy(button, false); } }; }
function openShareModal() { showModal(`<form class="modal" id="shareForm"><button class="modal-close" type="button">×</button><span class="eyebrow">ACESSO COMPARTILHADO</span><h2>Compartilhar gerenciamento</h2><p>A pessoa precisa ter uma conta criada pelo master.</p><label>E-mail do usuário<input name="email" type="email" required></label><label>Permissão<select name="role"><option value="editor">Pode adicionar e editar</option><option value="viewer">Somente visualizar</option></select></label><button class="btn btn-primary wide">Compartilhar acesso</button></form>`); const form = document.querySelector("#shareForm"); form.onsubmit = async (e) => { e.preventDefault(); try { await FirebaseService.shareManagement({ managementId: state.selected.id, ...Object.fromEntries(new FormData(form)) }); closeModal(); toast("Gerenciamento compartilhado."); } catch (err) { firebaseError(err); } }; }
function openUserModal() { showModal(`<form class="modal" id="userForm"><button class="modal-close" type="button">×</button><span class="eyebrow">ACESSO</span><h2>Criar novo usuário</h2><label>Nome<input name="name" required maxlength="100"></label><label>E-mail<input name="email" type="email" required></label><label>Senha temporária<input name="password" type="password" minlength="8" required></label><label class="check"><input name="canCreateManagement" type="checkbox"> Pode criar seus próprios gerenciamentos</label><button class="btn btn-primary wide">Criar usuário</button></form>`); const form = document.querySelector("#userForm"); form.onsubmit = async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.canCreateManagement = form.canCreateManagement.checked; try { await FirebaseService.createManagedUser(data); closeModal(); toast("Usuário criado com sucesso."); } catch (err) { firebaseError(err); } }; }

function openRecordModal(item = {}) {
  const type = item.type || "expense"; const paid = item.status === "paid";
  showModal(`<form class="modal modal-large" id="recordForm"><button class="modal-close" type="button">×</button><span class="eyebrow">${item.id ? "EDITAR" : "NOVO"} LANÇAMENTO</span><h2>${item.id ? esc(item.description) : "Adicionar ao calendário"}</h2><div class="type-toggle"><label><input type="radio" name="type" value="expense" ${type === "expense" ? "checked" : ""}> Débito</label><label><input type="radio" name="type" value="income" ${type === "income" ? "checked" : ""}> Entrada</label></div><div class="form-grid"><label>Descrição<input name="description" value="${attr(item.description || "")}" required maxlength="120"></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" value="${item.amount || ""}" required></label><label>Categoria<select name="category" id="categorySelect"></select></label><label>Data de vencimento/recebimento<input name="dueDate" type="date" value="${item.dueDate || ""}" required></label><label>Data que deseja pagar/receber<input name="plannedDate" type="date" value="${item.plannedDate || item.dueDate || ""}"></label><label>Status<select name="status" id="status"><option value="pending" ${!paid ? "selected" : ""}>Pendente</option><option value="paid" ${paid ? "selected" : ""}>${type === "income" ? "Recebido" : "Pago"}</option></select></label><label id="paidDateLabel">Data real do pagamento/recebimento<input name="paidDate" type="date" value="${item.paidDate || ""}"></label><label class="full">Observações<textarea name="notes" maxlength="500">${esc(item.notes || "")}</textarea></label><label class="full file-label">Comprovante (imagem ou PDF, até 10 MB)<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">${item.attachment?.url ? `<a href="${attr(item.attachment.url)}" target="_blank" rel="noopener">Abrir comprovante atual: ${esc(item.attachment.name)}</a>` : ""}</label></div><div class="modal-actions">${item.id ? '<button class="btn btn-danger" type="button" id="deleteRecord">Excluir</button>' : ""}<button class="btn btn-primary" type="submit">Salvar lançamento</button></div></form>`);
  const form = document.querySelector("#recordForm"); const category = form.querySelector("#categorySelect");
  const fillCategories = () => { const current = category.value || item.category; category.innerHTML = categories[form.type.value].map((c) => `<option ${c === current ? "selected" : ""}>${c}</option>`).join(""); };
  form.querySelectorAll('[name="type"]').forEach((i) => i.onchange = fillCategories); fillCategories();
  form.status.onchange = () => form.paidDate.required = form.status.value === "paid"; form.status.onchange();
  form.onsubmit = async (e) => { e.preventDefault(); const button = form.querySelector('button[type="submit"]'); busy(button, true); try { const data = Object.fromEntries(new FormData(form)); delete data.attachment; if (form.attachment.files[0]) data.attachment = await FirebaseService.uploadAttachment(state.selected.id, form.attachment.files[0], state.user.uid); else data.attachment = item.attachment || null; await FirebaseService.saveTransaction(state.selected.id, data, state.user.uid, item.id); closeModal(); toast("Lançamento salvo."); } catch (err) { firebaseError(err); busy(button, false); } };
  document.querySelector("#deleteRecord")?.addEventListener("click", async () => { if (!confirm("Excluir este lançamento?")) return; try { await FirebaseService.deleteTransaction(state.selected.id, item.id); await FirebaseService.deleteAttachment(item.attachment?.path); closeModal(); toast("Lançamento excluído."); } catch (err) { firebaseError(err); } });
}

function showModal(html) { document.querySelector("#modalRoot").innerHTML = `<div class="modal-backdrop">${html}</div>`; document.querySelector(".modal-close").onclick = closeModal; }
function closeModal() { const root = document.querySelector("#modalRoot"); if (root) root.innerHTML = ""; else renderPublic(); }
function busy(button, value) { button.disabled = value; if (value) { button.dataset.text = button.textContent; button.textContent = "Aguarde..."; } else button.textContent = button.dataset.text || button.textContent; }
function toast(message, type = "success") { const el = document.createElement("div"); el.className = `toast ${type}`; el.textContent = message; toastArea.append(el); setTimeout(() => el.remove(), 4000); }
function firebaseError(error) { console.error(error); toast(error?.message || "Não foi possível concluir a operação.", "danger"); }
function formatDate(value) { return value ? dateLabel.format(new Date(`${value}T12:00:00Z`)) : "Sem data"; }
function initials(name = "") { return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "U"; }
function esc(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
const attr = esc;
