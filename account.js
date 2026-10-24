/* paysums accounts (client). Session token lives in localStorage; the API lives at /api/v1/. Exposes window.PS_ACCT
   for other scripts (payroll sync, alerts box) and renders the /account/ page when #acct-app exists. */
(function () {
  'use strict';
  const API = '/api/v1'; const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  // a magic link lands here as #session=…; keep it and clean the URL
  const m = location.hash.match(/session=([a-z0-9]{40,})/); if (m) { store.set('ps_session', m[1]); history.replaceState(null, '', location.pathname + location.search); }
  const session = () => store.get('ps_session');
  const api = async (path, opt) => {
    const o = Object.assign({ headers: {} }, opt || {}); const t = session(); if (t) o.headers.authorization = 'Bearer ' + t;
    if (o.body && typeof o.body !== 'string') { o.body = JSON.stringify(o.body); o.headers['content-type'] = 'application/json'; }
    const r = await fetch(API + path, o); let d = null; try { d = await r.json(); } catch (e) {} if (!r.ok) throw Object.assign(new Error((d && d.error) || ('HTTP ' + r.status)), { status: r.status, data: d }); return d;
  };
  const beacon = (n, d) => { try { const body = JSON.stringify({ n, d: d || '' }); if (navigator.sendBeacon) navigator.sendBeacon(API + '/e', new Blob([body], { type: 'application/json' })); else fetch(API + '/e', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }); } catch (e) {} };
  const me = async () => { if (!session()) return null; try { const d = await api('/me'); return d.user ? d : null; } catch (e) { if (e.status === 401) store.set('ps_session', null); return null; } };
  const signIn = (email, next) => api('/auth/start', { method: 'POST', body: { email, next: next || location.pathname } });
  const signOut = async () => { try { await api('/logout', { method: 'POST' }); } catch (e) {} store.set('ps_session', null); };
  const subscribe = (email, topics, source) => api('/subscribe', { method: 'POST', body: { email, topics, source: source || location.pathname } });
  const sync = { get: kind => api('/sync/' + kind), put: (kind, data) => api('/sync/' + kind, { method: 'PUT', body: { data } }), del: kind => api('/sync/' + kind, { method: 'DELETE' }) };
  window.PS_ACCT = { session, api, beacon, me, signIn, signOut, subscribe, sync };

  /* ---------- alerts box under every US calculator ---------- */
  const res = $('#pc-result'); const form = $('#pc-form');
  if (res && form && !$('#ps-alert')) {
    const st = form.querySelector('select[name=state]'); const state = st ? st.value : '';
    const box = document.createElement('form'); box.id = 'ps-alert'; box.className = 'sub'; box.autocomplete = 'off';
    box.innerHTML = `<b>Tell me when ${state ? esc(state) + "'s" : 'the'} tax tables change</b><span class="muted small">The tables are checked against the official sources weekly; you get one email when a rate, bracket or deduction actually changes — a few times a year, nothing else.</span><div class="sub-row"><input type="email" name="email" placeholder="you@example.com" required aria-label="Email address"><button class="btn sm" type="submit">Alert me</button></div><p class="sub-msg muted small" aria-live="polite"></p>`;
    res.insertAdjacentElement('afterend', box);
    box.addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('.sub-msg', box); const email = $('input', box).value.trim(); const s = form.querySelector('select[name=state]'); const topics = 'changes' + (s && s.value ? ',' + s.value : '');
      msg.textContent = 'Sending…';
      try { const d = await subscribe(email, topics, location.pathname); msg.textContent = d.status === 'confirmed' ? 'You are already subscribed — ' + (s && s.value ? s.value + ' added.' : 'thanks.') : 'Check your inbox and click the confirmation link.'; beacon('alert_signup', s ? s.value : ''); }
      catch (err) { msg.textContent = err.message || 'Could not subscribe right now.'; }
    });
  }

  /* ---------- /account/ page ---------- */
  const app = $('#acct-app'); if (!app) return;
  const q = new URLSearchParams(location.search);
  const notice = q.get('sub') === 'confirmed' ? 'Subscription confirmed. You will hear from us only when a table changes.' : q.get('sub') === 'gone' ? 'Unsubscribed. Sorry to see you go.' : q.get('sub') === 'invalid' ? 'That confirmation link is not valid any more.' : q.get('auth') === 'expired' ? 'That sign-in link has expired or was already used — request a new one below.' : '';
  const render = async () => {
    const u = await me();
    if (!u) {
      app.innerHTML = `${notice ? `<p class="note">${esc(notice)}</p>` : ''}<h2>Sign in</h2><p class="muted">No password. Enter your email and we send a one-time link; it works on this device for as long as you stay signed in.</p><form id="acct-login" class="sub" autocomplete="off"><div class="sub-row"><input type="email" name="email" placeholder="you@example.com" required aria-label="Email address"><button class="btn" type="submit">Email me a sign-in link</button></div><p class="sub-msg muted small" aria-live="polite"></p></form>
<h2>What an account is for</h2><ul class="prose"><li><b>Payroll</b> — your employees and pay runs synced across devices and safe from a cleared browser, plus 941 / Schedule H and W-2 deadline reminders.</li><li><b>Tax-table alerts</b> — one email when your state's tables change.</li><li><b>Saved calculations</b> — keep a paycheck, mortgage or offer comparison to come back to.</li></ul><p class="muted small">The calculators themselves still run in your browser; nothing you type on them is sent to us unless you press Save. Delete the account at any time — everything goes with it.</p>`;
      $('#acct-login').addEventListener('submit', async e => { e.preventDefault(); const msg = $('.sub-msg', app); const email = $('input', app).value.trim(); msg.textContent = 'Sending…'; try { await signIn(email, '/account/'); msg.textContent = 'Sent — open the link in that email on this device.'; } catch (err) { msg.textContent = err.message; } });
      return;
    }
    const saved = (u.saved || []).map(b => `<li><b>${esc(b.kind)}</b> — ${(b.bytes / 1024).toFixed(1)} KB, updated ${esc(b.updated)} UTC <button class="btn sm ghost" data-del="${esc(b.kind)}">Delete</button></li>`).join('') || '<li class="muted">Nothing saved yet. The payroll page has a Sync button; calculators get Save next.</li>';
    const al = u.alerts ? `${esc(u.alerts.status)} — ${esc(u.alerts.topics || 'changes')}` : 'none';
    app.innerHTML = `${notice ? `<p class="note">${esc(notice)}</p>` : ''}<h2>Signed in as ${esc(u.user.email)}</h2><p class="muted small">Account created ${esc(u.user.created)} UTC.</p>
<h3>Saved to this account</h3><ul>${saved}</ul>
<h3>Tax-table alerts</h3><p>Status: <b>${al}</b>. <button class="btn sm" id="acct-alert">${u.alerts && u.alerts.status === 'confirmed' ? 'Add all-states alerts' : 'Subscribe this email'}</button></p>
<h3>Payroll</h3><p><a class="btn sm" href="/payroll/#backup">Open payroll sync</a></p>
<p style="margin-top:22px"><button class="btn sm ghost" id="acct-out">Sign out</button> <button class="btn sm ghost" id="acct-del">Delete account and all saved data</button></p>`;
    $('#acct-out').addEventListener('click', async () => { await signOut(); render(); });
    $('#acct-del').addEventListener('click', async () => { if (!confirm('Delete your account, saved payroll and alerts? This cannot be undone.')) return; await api('/me/delete', { method: 'POST' }); store.set('ps_session', null); render(); });
    $('#acct-alert').addEventListener('click', async e => { e.target.disabled = true; try { await subscribe(u.user.email, 'changes', '/account/'); e.target.textContent = 'Check your inbox'; } catch (err) { e.target.textContent = err.message; } });
    app.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Delete ' + b.dataset.del + ' from your account?')) return; await sync.del(b.dataset.del); render(); }));
  };
  render();
})();
