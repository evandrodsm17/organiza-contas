import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, hashPassword, verifyPassword } from './store.mjs';
import { fail, text, email, number, date, card, transaction, shiftDateByMonths } from './domain.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const sessionAge = 7 * 24 * 3600;
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
const publicUser = user => ({ uid: user.id, email: user.email, displayName: user.name });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

async function body(req, limit = 256 * 1024, raw = false) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, 'Arquivo ou requisição muito grande.');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (raw) return buffer;
  if (!String(req.headers['content-type']).startsWith('application/json')) fail(415, 'Envie JSON.');
  try {
    const data = JSON.parse(buffer.toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'JSON inválido.');
    return data;
  } catch { fail(400, 'JSON inválido.'); }
}

export async function createApp({ dataDir = process.env.DATA_DIR || './data', origin = process.env.APP_ORIGIN || 'http://localhost:3000', googleClientId = process.env.GOOGLE_CLIENT_ID, googleClientSecret = process.env.GOOGLE_CLIENT_SECRET, trustProxy = process.env.TRUST_PROXY === '1' } = {}) {
  origin = new URL(origin).origin;
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
  const secure = origin.startsWith('https://');
  const cookieName = secure ? '__Host-organiza' : 'organiza';
  const store = openStore(dataDir);
  const uploads = resolve(dataDir, 'uploads');
  await mkdir(uploads, { recursive: true });
  const attempts = new Map();
  const oauthStates = new Map();
  const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const session = (req, res, user) => {
    const old = cookieValue(req, cookieName);
    if (old) store.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(old));
    store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user.id, Date.now() + sessionAge * 1000);
    res.setHeader('Set-Cookie', cookie(cookieName, token, sessionAge));
  };
  const authenticate = req => {
    const token = cookieValue(req, cookieName);
    const entry = token && store.db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(digest(token), Date.now());
    const user = entry && store.user(entry.user_id);
    if (!user?.active) fail(401, 'Sua sessão expirou ou seu acesso foi desativado.');
    return user;
  };
  const master = user => { if (user.role !== 'master') fail(403, 'Acesso exclusivo do master.'); };
  const access = (mid, user, required = 'viewer') => {
    const item = store.management(mid);
    if (!item || !item.memberIds.includes(user.id)) fail(404, 'Gerenciamento não encontrado.');
    const role = item.memberRoles[user.id];
    if (required === 'owner' && item.ownerId !== user.id) fail(403, 'Apenas o proprietário pode fazer isso.');
    if (required === 'editor' && !['owner', 'editor'].includes(role)) fail(403, 'Este acesso permite somente leitura.');
    return item;
  };
  const rateLimit = req => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const ip = trustProxy ? (req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
    if (++entry.count > 30 || attempts.size > 10000) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
    attempts.set(ip, entry);
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const parts = path.split('/').filter(Boolean);
      const method = req.method;
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method)) {
        if (req.headers.origin !== origin) fail(403, 'Origem da requisição inválida.');
        if (req.headers['x-organiza-request'] !== '1') fail(403, 'Requisição inválida.');
      }
      if (path === '/api/health' && method === 'GET') { store.db.prepare('SELECT 1').get(); return json(res, { ok: true, revision: process.env.APP_REVISION || 'local' }); }
      if (path === '/api/auth/config' && method === 'GET') return json(res, { google: Boolean(googleClientId && googleClientSecret) });
      if (path === '/api/auth/login' && method === 'POST') {
        rateLimit(req);
        const data = await body(req);
        const entry = store.db.prepare('SELECT * FROM users WHERE email=?').get(email(data.email));
        const valid = await verifyPassword(data.password, entry?.password);
        const user = entry && store.user(entry.id);
        if (!valid || !entry?.password || !user?.active) fail(401, 'E-mail ou senha inválidos.');
        if (entry.password.startsWith('firebase:') && data.password.length >= 8 && data.password.length <= 256) {
          const upgraded = await hashPassword(data.password);
          store.db.prepare('UPDATE users SET password=? WHERE id=? AND password=?').run(upgraded,user.id,entry.password);
        }
        session(req, res, user); return json(res, publicUser(user));
      }
      if (path === '/api/auth/me' && method === 'GET') {
        try { return json(res, publicUser(authenticate(req))); }
        catch (error) { if (error.status === 401) return json(res, null); throw error; }
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        const token = cookieValue(req, cookieName);
        if (token) store.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
        res.setHeader('Set-Cookie', cookie(cookieName, '', 0)); return json(res, { ok: true });
      }
      if (path === '/api/auth/google/start' && method === 'GET') {
        if (!googleClientId || !googleClientSecret) fail(503, 'Login Google não configurado. Use e-mail e senha.');
        rateLimit(req);
        for (const [key, state] of oauthStates) if (state.expires < Date.now()) oauthStates.delete(key);
        if (oauthStates.size > 1000) fail(429, 'Tente novamente em alguns minutos.');
        const state = randomBytes(32).toString('hex');
        const verifier = randomBytes(32).toString('base64url');
        oauthStates.set(state, { verifier, expires: Date.now() + 600000 });
        res.setHeader('Set-Cookie', cookie('organiza-oauth', state, 600));
        const params = new URLSearchParams({ client_id: googleClientId, redirect_uri: `${origin}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
        res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }); return res.end();
      }
      if (path === '/api/auth/google/callback' && method === 'GET') {
        const state = url.searchParams.get('state');
        const flow = oauthStates.get(state);
        oauthStates.delete(state);
        if (!flow || flow.expires < Date.now() || cookieValue(req, 'organiza-oauth') !== state) fail(400, 'Login expirado. Volte e tente novamente.');
        const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) fail(401, 'O Google não autorizou o login.');
        const tokens = await response.json();
        const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
        if (!profileResponse.ok) fail(401, 'Não foi possível validar sua conta Google.');
        const profile = await profileResponse.json();
        if (!profile.email_verified || !profile.sub) fail(401, 'E-mail Google não verificado.');
        let entry = store.db.prepare('SELECT * FROM users WHERE google_id=?').get(profile.sub);
        // Google is authoritative for Gmail/Workspace, not arbitrary third-party addresses.
        if (!entry && (profile.email?.endsWith('@gmail.com') || profile.hd)) {
          entry = store.db.prepare('SELECT * FROM users WHERE email=?').get(email(profile.email));
          if (entry?.google_id && entry.google_id !== profile.sub) fail(403, 'Conta Google não vinculada.');
        }
        if (!entry || !store.user(entry.id)?.active) fail(403, 'Conta não autorizada. Peça ao master para liberar seu acesso.');
        store.db.prepare('UPDATE users SET google_id=? WHERE id=?').run(profile.sub, entry.id);
        session(req, res, store.user(entry.id));
        res.writeHead(302, { Location: '/' }); return res.end();
      }
      if (path.startsWith('/api/')) {
        const user = authenticate(req);
        if (path === '/api/profile' && method === 'GET') return json(res, user);
        if (path === '/api/users') {
          master(user);
          if (method === 'GET') return json(res, store.users());
          if (method === 'POST') {
            const data = await body(req);
            const id = randomUUID(); const address = email(data.email);
            const name = text(data.name, 100);
            const password = await hashPassword(data.password);
            if (store.db.prepare('SELECT id FROM users WHERE email=?').get(address)) fail(409, 'E-mail já cadastrado.');
            const profile = { name, email: address, role: 'user', active: true, canCreateManagement: data.canCreateManagement === true, createdAt: new Date().toISOString(), createdBy: user.id };
            store.db.prepare('INSERT INTO users(id,email,password,data) VALUES (?,?,?,?)').run(id, address, password, JSON.stringify(profile));
            return json(res, { uid: id }, 201);
          }
        }
        if (parts[1] === 'users' && parts.length === 3 && method === 'PATCH') {
          master(user);
          const target = store.user(parts[2]); if (!target) fail(404, 'Usuário não encontrado.');
          const data = await body(req);
          if (target.role === 'master' && data.active === false) fail(400, 'Não é permitido desativar o master.');
          for (const key of Object.keys(data)) if (!['active','canCreateManagement'].includes(key) || typeof data[key] !== 'boolean') fail(400, 'Permissão inválida.');
          store.db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify({ ...target, ...data }), target.id);
          if (data.active === false) store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
          return json(res, { ok: true });
        }
        if (path === '/api/managements') {
          if (method === 'GET') return json(res, store.managements().filter(m => m.memberIds.includes(user.id)).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')));
          if (method === 'POST') {
            if (user.role !== 'master' && !user.canCreateManagement) fail(403, 'Você não pode criar gerenciamentos.');
            const data = await body(req); const id = randomUUID(); const now = new Date().toISOString();
            store.putManagement(id, { name: text(data.name), description: text(data.description || '', 500, false), currency: 'BRL', ownerId: user.id, memberIds: [user.id], memberRoles: { [user.id]: 'owner' }, createdAt: now, updatedAt: now });
            return json(res, { id }, 201);
          }
        }
        if (parts[1] === 'managements' && parts[2]) {
          const mid = parts[2];
          const current = access(mid, user, method === 'GET' ? 'viewer' : 'editor');
          const now = new Date().toISOString();
          if (parts.length === 3 && method === 'DELETE') {
            access(mid, user, 'owner');
            const files = store.db.prepare('SELECT file FROM attachments WHERE management_id=?').all(mid);
            store.db.prepare('DELETE FROM managements WHERE id=?').run(mid);
            await Promise.all(files.map(f => unlink(resolve(uploads, f.file)).catch(() => {})));
            return json(res, { ok: true });
          }
          if (parts.length === 3 && method === 'PATCH') {
            const data = await body(req); const next = { ...current, updatedAt: now };
            if ('name' in data) next.name = text(data.name);
            if ('description' in data) next.description = text(data.description, 500, false);
            store.putManagement(mid, next); return json(res, { ok: true });
          }
          if (parts[3] === 'share' && parts.length === 4 && method === 'POST') {
            access(mid, user, 'owner'); const data = await body(req);
            if (!['editor','viewer'].includes(data.role)) fail(400, 'Permissão inválida.');
            const target = store.db.prepare('SELECT id FROM users WHERE email=?').get(email(data.email));
            if (!target || !store.user(target.id)?.active) fail(404, 'Nenhum usuário ativo encontrado.');
            if (target.id === current.ownerId) fail(400, 'O proprietário mantém seu acesso.');
            current.memberIds = [...new Set([...current.memberIds, target.id])];
            current.memberRoles[target.id] = data.role; current.updatedAt = now;
            store.putManagement(mid, current); return json(res, { uid: target.id });
          }
          if (parts[3] === 'limit' && parts.length === 4 && method === 'PUT') {
            const data = await body(req);
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)) fail(400, 'Mês inválido.');
            const amount = number(data.amount);
            current.monthlyExpenseLimits ||= {};
            if (amount) current.monthlyExpenseLimits[data.month] = amount; else delete current.monthlyExpenseLimits[data.month];
            store.putManagement(mid, { ...current, updatedAt: now }); return json(res, { ok: true });
          }
          if (parts[3] === 'cash-planning' && parts.length === 4 && method === 'PUT') {
            const data = await body(req);
            if (![30,60,90].includes(Number(data.horizonDays))) fail(400, 'Horizonte inválido.');
            current.cashPlanning = { currentBalance: number(data.currentBalance, -1e12), minimumReserve: number(data.minimumReserve), horizonDays: Number(data.horizonDays), balanceDate: date(data.balanceDate, true) };
            store.putManagement(mid, { ...current, updatedAt: now }); return json(res, { ok: true });
          }
          if (parts[3] === 'attachments' && parts.length === 4 && method === 'POST') {
            const contentType = req.headers['content-type'];
            if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(contentType)) fail(415, 'Envie JPG, PNG, WEBP ou PDF.');
            const buffer = await body(req, 10 * 1024 * 1024, true);
            const signatures = { 'image/jpeg': buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255, 'image/png': buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'image/webp': buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP', 'application/pdf': buffer.subarray(0,5).toString() === '%PDF-' };
            if (!signatures[contentType]) fail(400, 'O conteúdo não corresponde ao tipo de arquivo.');
            const name = text(decodeURIComponent(req.headers['x-file-name'] || 'comprovante'), 255);
            const id = randomUUID(); await writeFile(resolve(uploads, id), buffer, { flag: 'wx', mode: 0o600 });
            try { store.db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?)').run(id, mid, name, contentType, id); }
            catch (error) { await unlink(resolve(uploads, id)); throw error; }
            return json(res, { name, type: contentType, path: id, url: `/api/attachments/${id}` }, 201);
          }
          const kind = parts[3];
          if (['cards','transactions'].includes(kind)) {
            if (parts.length === 4 && method === 'GET') return json(res, store.records(mid, kind).sort((a,b) => String(kind === 'cards' ? a.name : a.dueDate).localeCompare(String(kind === 'cards' ? b.name : b.dueDate))));
            if (kind === 'transactions' && parts[4] === 'recurring' && method === 'POST') {
              const request = await body(req);
              const data = transaction(request.data, store, mid);
              const total = number(request.months, 2, 60);
              if (!Number.isInteger(total) || !['fixed','installment'].includes(request.recurrenceType)) fail(400, 'Recorrência inválida.');
              const groupId = randomUUID();
              store.atomic(() => {
                for (let i = 0; i < total; i++) store.putRecord(mid, kind, randomUUID(), { ...data, description: request.recurrenceType === 'installment' ? `${data.description} (${i + 1}/${total})` : data.description, dueDate: shiftDateByMonths(data.dueDate, i), plannedDate: shiftDateByMonths(data.plannedDate, i), status: i ? 'pending' : data.status, paidDate: i ? '' : data.paidDate, attachment: i ? null : data.attachment, recurrenceGroupId: groupId, recurrenceIndex: i + 1, recurrenceTotal: total, recurrenceType: request.recurrenceType, recurrenceBaseDescription: data.description, createdAt: now, updatedAt: now, createdBy: user.id, updatedBy: user.id });
              });
              return json(res, { count: total, groupId });
            }
            const id = parts[4];
            const existing = id && store.record(mid, kind, id);
            if (id && !existing) fail(404, 'Registro não encontrado.');
            if (kind === 'transactions' && parts[5] === 'series' && parts.length === 6 && ['PATCH','DELETE'].includes(method)) {
              const request = await body(req);
              if (!existing.recurrenceGroupId || !['all','future'].includes(request.scope)) fail(400, 'Série inválida.');
              const targets = store.records(mid, kind).filter(t => t.recurrenceGroupId === existing.recurrenceGroupId && (request.scope === 'all' || t.recurrenceIndex >= existing.recurrenceIndex));
              const data = method === 'PATCH' ? transaction(request.data, store, mid) : null;
              store.atomic(() => {
                for (const target of targets) {
                  if (method === 'DELETE') { store.db.prepare('DELETE FROM records WHERE id=?').run(target.id); continue; }
                  const offset = target.recurrenceIndex - existing.recurrenceIndex;
                  const payload = { ...target, ...data, recurrenceBaseDescription: data.description, description: target.recurrenceType === 'installment' ? `${data.description} (${target.recurrenceIndex}/${target.recurrenceTotal})` : data.description, updatedAt: now, updatedBy: user.id };
                  payload.dueDate = target.id === id || data.dueDate !== existing.dueDate ? shiftDateByMonths(data.dueDate, offset) : target.dueDate;
                  payload.plannedDate = target.id === id || data.plannedDate !== (existing.plannedDate || existing.dueDate || '') ? shiftDateByMonths(data.plannedDate, offset) : target.plannedDate || '';
                  if (target.id !== id) for (const key of ['status','paidDate','attachment']) payload[key] = target[key];
                  store.putRecord(mid, kind, target.id, payload);
                }
              });
              return json(res, { count: targets.length, attachmentPaths: method === 'DELETE' ? targets.map(t => t.attachment?.path).filter(Boolean) : [] });
            }
            if (parts.length === 5 && kind === 'transactions' && method === 'DELETE') {
              store.db.prepare('DELETE FROM records WHERE id=?').run(id); return json(res, { ok: true });
            }
            if ((parts.length === 4 && method === 'POST') || (parts.length === 5 && method === 'PATCH')) {
              const input = await body(req);
              const data = kind === 'cards' ? card({ ...existing, ...input }) : transaction({ ...existing, ...input }, store, mid);
              const recordId = id || randomUUID();
              store.putRecord(mid, kind, recordId, { ...existing, ...data, createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || user.id, updatedAt: now, updatedBy: user.id });
              return json(res, { id: recordId }, id ? 200 : 201);
            }
          }
        }
        if (parts[1] === 'attachments' && parts.length === 3) {
          const entry = store.db.prepare('SELECT * FROM attachments WHERE id=?').get(parts[2]);
          if (!entry) fail(404, 'Comprovante não encontrado.');
          access(entry.management_id, user, method === 'DELETE' ? 'editor' : 'viewer');
          if (method === 'GET') {
            const buffer = await readFile(resolve(uploads, entry.file));
            res.writeHead(200, { 'Content-Type': entry.type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.name)}`, 'Content-Security-Policy': "sandbox; default-src 'none'" }); return res.end(buffer);
          }
          if (method === 'DELETE') {
            const referenced = store.records(entry.management_id, 'transactions').some(t => t.attachment?.path === entry.id);
            if (referenced) fail(409, 'Este comprovante ainda está em uso.');
            await unlink(resolve(uploads, entry.file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
            store.db.prepare('DELETE FROM attachments WHERE id=?').run(entry.id); return json(res, { ok: true });
          }
        }
        fail(404, 'Recurso não encontrado.');
      }
      if (!['GET','HEAD'].includes(method)) fail(405, 'Método não permitido.');
      const relative = path === '/' ? 'index.html' : decodeURIComponent(path).slice(1);
      if (!['index.html','favicon.ico','site.webmanifest'].includes(relative) && !/^assets\/(css|js|icons)\/[a-z0-9._-]+$/i.test(relative) && relative !== 'assets/logo.png') fail(404, 'Arquivo não encontrado.');
      if (relative.includes('firebase-')) fail(404, 'Arquivo não encontrado.');
      const file = resolve(root, relative);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) fail(404, 'Arquivo não encontrado.');
      const content = await readFile(file);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      if (status === 500) console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, { error: status === 500 ? 'Não foi possível concluir a operação.' : error.message }, status);
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, store, close: () => new Promise((resolveClose, reject) => { server.close(error => { store.db.close(); error ? reject(error) : resolveClose(); }); server.closeIdleConnections(); }) };
}
