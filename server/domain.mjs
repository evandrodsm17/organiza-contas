export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function text(value, max = 120, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    fail(400, 'Texto ausente ou inválido.');
  return value.trim();
}
export function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'E-mail inválido.');
  return result;
}
export function number(value, min = 0, max = 1e12) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) fail(400, 'Número inválido.');
  return result;
}
export function date(value, required = false) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    fail(400, 'Data inválida.');
  return value;
}
export function shiftDateByMonths(value, offset) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  target.setUTCDate(Math.min(day, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export function transaction(data, store, mid) {
  if (!['income', 'expense'].includes(data.type) || !['paid', 'pending'].includes(data.status)) fail(400, 'Tipo ou status inválido.');
  const result = {
    type: data.type, status: data.status, description: text(data.description, 160),
    category: text(data.category || 'Outros', 100), amount: number(data.amount, 0.01),
    dueDate: date(data.dueDate, true), plannedDate: date(data.plannedDate),
    paidDate: date(data.paidDate, data.status === 'paid'), notes: text(data.notes || '', 500, false),
    priority: ['essential','important','flexible'].includes(data.priority) ? data.priority : 'important',
    allowLatePayment: data.allowLatePayment === true,
    maxDelayDays: number(data.maxDelayDays || 0, 0, 90), lateFeePercent: number(data.lateFeePercent || 0, 0, 100),
    cardId: '', cardSnapshot: null, attachment: null
  };
  if (!Number.isInteger(result.maxDelayDays) || (result.allowLatePayment && result.maxDelayDays < 1)) fail(400, 'Limite de atraso inválido.');
  if (data.cardId) {
    const card = store.record(mid, 'cards', data.cardId);
    if (!card) fail(400, 'Cartão não encontrado neste gerenciamento.');
    result.cardId = card.id;
    result.cardSnapshot = Object.fromEntries(['id','name','holderName','logoUrl','backgroundColor','closingDay','dueDay'].map(k => [k, card[k]]));
  }
  if (data.attachment) {
    const attachment = store.db.prepare('SELECT * FROM attachments WHERE id=? AND management_id=?').get(data.attachment.path, mid);
    if (!attachment) fail(400, 'Comprovante não encontrado neste gerenciamento.');
    result.attachment = { name: attachment.name, type: attachment.type, path: attachment.id, url: `/api/attachments/${attachment.id}` };
  }
  if (data.recurrenceBaseDescription) result.recurrenceBaseDescription = text(data.recurrenceBaseDescription, 120);
  return result;
}
export function card(data) {
  const result = { name: text(data.name, 60), holderName: text(data.holderName, 100), logoUrl: text(data.logoUrl || '', 2048, false), backgroundColor: text(data.backgroundColor || '#3157D5', 7), active: data.active !== false };
  if (result.logoUrl && !/^https:\/\//i.test(result.logoUrl)) fail(400, 'O logo deve usar HTTPS.');
  if (!/^#[a-f0-9]{6}$/i.test(result.backgroundColor)) fail(400, 'Cor inválida.');
  for (const key of ['closingDay','dueDay']) {
    result[key] = data[key] ? number(data[key], 1, 31) : null;
    if (result[key] !== null && !Number.isInteger(result[key])) fail(400, 'Dia inválido.');
  }
  return result;
}
