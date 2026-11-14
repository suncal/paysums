/* paysums documents, part 2 — renderers registered into docs.js (loaded before it). Each renderer is (v, H) → HTML,
   where v is the form values and H the shared helpers (esc, fmt, fdate, PD data, PC engine…). Same rules as part 1:
   every tax figure is computed by the engine; every document says who prepared it and for what. */
window.PS_R_EXTRA = (function () {
  'use strict';
  const X = {};
  const n0 = x => Math.round((+x || 0) * 100) / 100;
  const money = (x, c) => (c === 'GBP' ? '£' : c === 'INR' ? '₹' : '$') + Math.abs(n0(x)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const words = (n) => { // 1234.56 → "One thousand two hundred thirty-four and 56/100"
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const w = x => x < 20 ? a[x] : x < 100 ? b[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '') : a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + w(x % 100) : '');
    let d = Math.floor(Math.abs(+n || 0)), c = Math.round((Math.abs(+n || 0) - d) * 100); if (c === 100) { d++; c = 0; }
    if (!d) return 'Zero and ' + String(c).padStart(2, '0') + '/100';
    const parts = []; const sc = ['', ' thousand', ' million', ' billion']; let i = 0;
    while (d > 0) { const ch = d % 1000; if (ch) parts.unshift(w(ch) + sc[i]); d = Math.floor(d / 1000); i++; }
    const s = parts.join(' '); return s.charAt(0).toUpperCase() + s.slice(1) + ' and ' + String(c).padStart(2, '0') + '/100';
  };
  const sign = (label) => `<div class="sig"><div><span class="line"></span>${label}</div><div><span class="line"></span>Date</div></div>`;
  const clause = (n, t, body) => `<p class="cl"><b>${n}. ${t}.</b> ${body}</p>`;
  const monthsElapsed = (iso) => { if (!iso) return 0; const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return 0; return d.getMonth() + d.getDate() / 30.4; };
  const yr = () => new Date().getFullYear();

  /* ================= W-4 optimizer + filled form ================= */
  X.w4 = (v, H) => {
    const { esc, fmt, PD, PC, nl2br, today } = H; const D = PD.us; const F = D.federal; const filing = v.filing || 'single';
    const per = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[v.payFreq] || 26;
    const j1 = +v.job1 || 0, j2 = +v.job2 || 0, kids = Math.max(0, Math.floor(+v.kids || 0)), oth = Math.max(0, Math.floor(+v.others || 0));
    const credits = kids * (F.ctc || 2200) + oth * (F.odc || 500); const otherInc = +v.otherIncome || 0, extraDed = +v.deductions || 0, refund = Math.max(0, +v.refund || 0);
    const br = F.brackets[filing], std = F.std[filing]; const tax = t => PC.bracketTax(Math.max(0, t), br);
    const liability = Math.max(0, tax(j1 + j2 + otherInc - std - extraDed) - credits);
    const t2 = j2 ? tax(j2 - std) : 0;                                   // job 2 / spouse: Step 1 only (default withholding)
    const t1plain = tax(j1 - std);                                       // job 1 if left at the default
    const t1 = Math.max(0, tax(j1 + otherInc - std - extraDed) - credits); // job 1 with Steps 3 and 4(a)/(b) filled
    let gap = liability + refund - (t1 + t2); let extra = 0, moreDed = 0;
    if (gap > 0) extra = Math.ceil(gap / per); else if (gap < 0) { const m = (PC.marginalOf ? PC.marginalOf(Math.max(0, j1 + otherInc - std - extraDed), br) : 0.22) || 0.22; moreDed = Math.ceil(-gap / m / 10) * 10; }
    const projected = t1 + t2 + extra * per - (moreDed ? tax(j1 + otherInc - std - extraDed) - tax(j1 + otherInc - std - extraDed - moreDed) : 0);
    const owe = liability - (t1plain + t2);
    const box = (on) => `<span class="w4box">${on ? '☒' : '☐'}</span>`;
    const ssn = String(v.ssn || '').replace(/[^0-9]/g, ''); const ssnf = ssn.length === 9 ? ssn.slice(0, 3) + '-' + ssn.slice(3, 5) + '-' + ssn.slice(5) : (ssn ? esc(v.ssn) : '___-__-____');
    return `<div class="stub-head"><div><div class="stub-co">Form W-4 (${esc(D.year)}) — Employee's Withholding Certificate</div><div class="stub-addr">Department of the Treasury · Internal Revenue Service · Give Form W-4 to your employer. Your withholding is subject to review by the IRS.</div></div><div class="stub-meta"><div>OMB No. 1545-0074</div><div><b>${esc(D.year)}</b></div></div></div>
<div class="w4">
<div class="w4s"><b>Step 1: Enter Personal Information</b>
<table class="stub-t w2"><tr><td>(a) First name and middle initial · Last name<br><b>${esc(v.name) || '____________________'}</b></td><td>(b) Social security number<br><b>${ssnf}</b></td></tr><tr><td colspan="2">Address · City or town, state, ZIP<br><b>${nl2br(v.address) || '____________________'}</b></td></tr>
<tr><td colspan="2">(c) ${box(filing === 'single')} Single or Married filing separately &nbsp; ${box(filing === 'married')} Married filing jointly or Qualifying surviving spouse &nbsp; ${box(filing === 'head')} Head of household</td></tr></table></div>
<div class="w4s"><b>Step 2: Multiple Jobs or Spouse Works</b><p>${box(false)} (c) Leave unchecked — the figures below already account for ${j2 ? 'the second job (' + fmt(j2) + ' a year)' : 'a single job'}${j2 ? ' by adding the shortfall as extra withholding in Step 4(c) on this, the higher-paying job' : ''}.</p></div>
<div class="w4s"><b>Step 3: Claim Dependent and Other Credits</b><table class="stub-t w2"><tr><td>Qualifying children under 17: ${kids} × ${fmt(F.ctc || 2200)}</td><td class="n"><b>${fmt(kids * (F.ctc || 2200))}</b></td></tr><tr><td>Other dependents: ${oth} × ${fmt(F.odc || 500)}</td><td class="n"><b>${fmt(oth * (F.odc || 500))}</b></td></tr><tr class="tot"><td>Line 3 — total credits</td><td class="n"><b>${fmt(credits)}</b></td></tr></table></div>
<div class="w4s"><b>Step 4 (optional): Other Adjustments</b><table class="stub-t w2"><tr><td>(a) Other income (not from jobs)</td><td class="n"><b>${fmt(otherInc)}</b></td></tr><tr><td>(b) Deductions (beyond the standard deduction)</td><td class="n"><b>${fmt(extraDed + moreDed)}</b></td></tr><tr><td>(c) Extra withholding per pay period</td><td class="n"><b>${fmt(extra)}</b></td></tr></table></div>
<div class="w4s"><b>Step 5: Sign Here</b><p class="small">Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.</p>${sign("Employee's signature")}</div>
<div class="w4s muted"><b>Employers Only</b> — Employer's name and address: ${esc(v.employer) || '________'} · First date of employment: ______ · EIN: ______</div>
</div>
<div class="w4why"><b>Why these numbers</b><ul>
<li>Household federal tax for ${esc(D.year)}: <b>${fmt(liability)}</b> on ${fmt(j1 + j2)} of wages${otherInc ? ' + ' + fmt(otherInc) + ' other income' : ''} (standard deduction ${fmt(std)}${extraDed ? ' + ' + fmt(extraDed) + ' extra' : ''}, ${esc(filing)} brackets, minus ${fmt(credits)} credits).</li>
<li>If you left every W-4 at the default you would ${owe > 0 ? 'owe about <b>' + fmt(owe) + '</b> in April' : 'get a refund of about <b>' + fmt(-owe) + '</b>'}.${j2 ? ' Two jobs each get a full standard deduction by default — the usual reason couples and second-job earners under-withhold.' : ''}</li>
<li>With this form at ${j2 ? 'the higher-paying job' : 'your job'} (${fmt(j1)}, ${esc(v.payFreq || 'biweekly')})${j2 ? ' and the other job\'s W-4 left at Step 1 only' : ''}, projected withholding is <b>${fmt(projected)}</b> → expected refund about <b>${fmt(Math.max(0, projected - liability))}</b>${refund ? ' (you asked for ' + fmt(refund) + ')' : ''}.</li>
<li>About <b>${fmt(Math.max(0, (t1 + extra * per) / per))}</b> federal tax will come out of each of your ${per} paychecks at this job.</li></ul>
<p class="small muted">Copy these values onto your employer's W-4 (paper or payroll portal) — the form and the values are identical — or sign and hand in this printed copy where your employer accepts substitute forms. State withholding forms are separate. Figures computed with paysums.com on ${today()} from the ${esc(D.year)} federal tables; assumes wages are taxed at ordinary rates and no other credits.</p></div>`;
  };

  /* ================= 1040-ES estimated-tax vouchers ================= */
  X.vouchers = (v, H) => {
    const { esc, fmt, PD, PC, nl2br, today } = H; const D = PD.us; const F = D.federal; const year = +v.taxYear || D.year; const filing = v.filing || 'single';
    const profit = Math.max(0, +v.profit || 0), wages = Math.max(0, +v.wages || 0), other = +v.other || 0, wh = +v.withheld || 0;
    const seBase = profit * 0.9235; const ssRoom = Math.max(0, F.ss.wageBase - wages); const se = Math.min(seBase, ssRoom) * 0.124 + seBase * 0.029 + Math.max(0, seBase + wages - F.medicare.addlThreshold) * 0.009;
    const half = se / 2; const qbi = v.qbi === 'no' ? 0 : 0.2 * Math.max(0, profit - half);
    const taxable = Math.max(0, profit - half - qbi + wages + other - F.std[filing]); const fed = PC.bracketTax(taxable, F.brackets[filing]);
    let state = 0, stName = ''; try { const r = PC.calc('US', { amount: Math.max(0, profit - half + wages + other), period: 'annual', state: v.state || 'TX', filing }, D); const it = r.items.find(i => i.key === 'state'); state = it ? it.amount : 0; stName = r.state; } catch (e) {}
    const total = fed + se - wh; const safe = +v.lastYearTax ? Math.min(total, (+v.lastYearTax) * (v.highIncome === 'yes' ? 1.1 : 1) - wh) : total;
    const q = Math.max(0, Math.ceil(safe / 4)); const sq = Math.max(0, Math.ceil(state / 4));
    const due = [['1', 'April 15, ' + year], ['2', 'June 15, ' + year], ['3', 'September 15, ' + year], ['4', 'January 15, ' + (year + 1)]];
    const ssn = String(v.ssn || '').replace(/[^0-9]/g, ''); const ssnf = ssn.length === 9 ? '***-**-' + ssn.slice(5) : '';
    const voucher = ([k, d]) => `<div class="receipt vch"><div class="stub-head"><div><div class="stub-co">${year} Form 1040-ES — Payment Voucher ${k}</div><div class="stub-addr">Due ${d} · Estimated tax payment · Calendar year ${year}</div></div><div class="stub-meta"><div>Amount of estimated tax you are paying by check or money order</div><div><b>${fmt(q)}</b></div></div></div>
<table class="stub-t w2"><tr><td>Your name${v.spouse ? ' · Spouse' : ''}<br><b>${esc(v.name) || '________'}${v.spouse ? ' · ' + esc(v.spouse) : ''}</b></td><td>Your SSN${v.spouse ? ' · Spouse SSN' : ''}<br><b>${ssnf || '___-__-____'}</b></td></tr><tr><td colspan="2">Address<br><b>${nl2br(v.address) || '________'}</b></td></tr></table>
<p class="small">Pay online at IRS Direct Pay (irs.gov/payments) or by IRS Online Account and this voucher is not needed. To pay by check: payable to “United States Treasury”, write “${year} Form 1040-ES” and your SSN on it, and mail with this voucher to the address for your state listed in the Form 1040-ES instructions. Do not staple.</p></div>`;
    return `<div class="receipt"><div class="stub-head"><div><div class="stub-co">Estimated tax schedule ${year}</div><div class="stub-addr">${esc(v.name) || 'Taxpayer'} · ${esc(filing)} · ${esc(stName || v.state)}</div></div><div class="stub-meta"><div>Federal per quarter</div><div><b>${fmt(q)}</b></div>${sq ? '<div>State per quarter</div><div><b>' + fmt(sq) + '</b></div>' : ''}</div></div>
<table class="stub-t"><thead><tr><th>Federal</th><th class="n">Amount</th></tr></thead><tbody><tr><td>Net profit (Schedule C)</td><td class="n">${fmt(profit)}</td></tr><tr><td>Self-employment tax (Schedule SE: 92.35% × 15.3%, SS capped at ${fmt(F.ss.wageBase)})</td><td class="n">${fmt(se)}</td></tr><tr><td>Income tax on ${fmt(taxable)} taxable (profit − ½ SE${qbi ? ' − 20% QBI ' + fmt(qbi) : ''}${wages ? ' + wages ' + fmt(wages) : ''}${other ? ' + other ' + fmt(other) : ''} − standard deduction ${fmt(F.std[filing])})</td><td class="n">${fmt(fed)}</td></tr>${wh ? '<tr><td>Less withholding from W-2 wages</td><td class="n">−' + fmt(wh) + '</td></tr>' : ''}<tr class="tot"><td>Total to pay in ${year}${+v.lastYearTax ? ' (safe-harbour: ' + (v.highIncome === 'yes' ? '110' : '100') + '% of last year\'s ' + fmt(+v.lastYearTax) + ' applies if lower)' : ''}</td><td class="n">${fmt(Math.max(0, safe))}</td></tr>${state ? '<tr><td>' + esc(stName) + ' estimated income tax (pay through the state\'s own system)</td><td class="n">' + fmt(state) + '</td></tr>' : ''}</tbody></table>
<table class="stub-t"><thead><tr><th>Payment</th><th>Due</th><th class="n">Federal</th>${sq ? '<th class="n">State</th>' : ''}</tr></thead><tbody>${due.map(([k, d]) => `<tr><td>Payment ${k}</td><td>${d}</td><td class="n">${fmt(q)}</td>${sq ? '<td class="n">' + fmt(sq) + '</td>' : ''}</tr>`).join('')}</tbody></table>
<p class="stub-foot">Computed with paysums.com on ${today()} from the ${esc(D.year)} federal tables for planning purposes; no penalty applies if you pay at least 90% of this year's tax or 100% (110% over $150,000 AGI) of last year's, in equal instalments. Not tax advice.</p></div>${due.map(voucher).join('')}`;
  };

  /* ================= Form 941 quarterly worksheet (free) ================= */
  X.f941 = (v, H) => {
    const { esc, fmt, nl2br, today, ein } = H;
    const w = +v.wages || 0, fit = +v.fit || 0, ssw = Math.min(+v.ssWages || 0, w || 1e12), tips = +v.ssTips || 0, mw = +v.medWages || w, add = +v.addlWages || 0, dep = +v.deposits || 0;
    const l5a = ssw * 0.124, l5b = tips * 0.124, l5c = mw * 0.029, l5d = add * 0.009, l5e = l5a + l5b + l5c + l5d, l6 = fit + l5e, bal = l6 - dep;
    const m = [+v.m1 || 0, +v.m2 || 0, +v.m3 || 0]; const msum = m[0] + m[1] + m[2];
    return `<div class="stub-head"><div><div class="stub-co">Form 941 worksheet — Quarter ${esc(v.quarter || '1')}, ${esc(v.year || yr())}</div><div class="stub-addr"><b>${esc(v.name) || 'Employer'}</b> · EIN ${ein(v.ein) || '__-_______'}<br>${nl2br(v.addr)}</div></div><div class="stub-meta"><div>Employer's QUARTERLY Federal Tax Return</div><div>Line values to copy onto the IRS form</div></div></div>
<table class="stub-t"><tbody>
<tr><td>1 Number of employees who received wages in the pay period including the 12th of the last month</td><td class="n"><b>${esc(v.employees || 0)}</b></td></tr>
<tr><td>2 Wages, tips, and other compensation</td><td class="n"><b>${fmt(w)}</b></td></tr>
<tr><td>3 Federal income tax withheld from wages, tips, and other compensation</td><td class="n"><b>${fmt(fit)}</b></td></tr>
<tr><td>5a Taxable social security wages ${fmt(ssw)} × 0.124</td><td class="n"><b>${fmt(l5a)}</b></td></tr>
<tr><td>5b Taxable social security tips ${fmt(tips)} × 0.124</td><td class="n"><b>${fmt(l5b)}</b></td></tr>
<tr><td>5c Taxable Medicare wages &amp; tips ${fmt(mw)} × 0.029</td><td class="n"><b>${fmt(l5c)}</b></td></tr>
<tr><td>5d Taxable wages &amp; tips subject to Additional Medicare Tax withholding ${fmt(add)} × 0.009</td><td class="n"><b>${fmt(l5d)}</b></td></tr>
<tr><td>5e Total social security and Medicare taxes (5a + 5b + 5c + 5d)</td><td class="n"><b>${fmt(l5e)}</b></td></tr>
<tr><td>6 Total taxes before adjustments (3 + 5e)</td><td class="n"><b>${fmt(l6)}</b></td></tr>
<tr><td>10 / 12 Total taxes after adjustments and credits (no adjustments entered)</td><td class="n"><b>${fmt(l6)}</b></td></tr>
<tr><td>13 Total deposits for this quarter</td><td class="n"><b>${fmt(dep)}</b></td></tr>
<tr class="tot"><td>${bal >= 0 ? '14 Balance due' : '15 Overpayment'}</td><td class="n"><b>${fmt(Math.abs(bal))}</b></td></tr></tbody></table>
<p><b>Part 2 — deposit schedule.</b> ${l6 < 2500 ? 'Line 12 is under $2,500: check box 1 (pay with the return) — no deposits required for the quarter.' : msum ? 'Monthly schedule depositor — tax liability: month 1 ' + fmt(m[0]) + ', month 2 ' + fmt(m[1]) + ', month 3 ' + fmt(m[2]) + ' = ' + fmt(msum) + (Math.abs(msum - l6) > 1 ? ' <b>(does not equal line 12 ' + fmt(l6) + ' — fix before filing)</b>' : ' ✓ equals line 12') + '.' : 'Line 12 is $2,500 or more: enter the tax liability for each month of the quarter (must total line 12) if you are a monthly depositor, or attach Schedule B if semiweekly.'}</p>
<p class="stub-foot">Worksheet prepared by the employer with paysums.com on ${today()}. Line 5 amounts are the statutory rates applied to the wages entered (both employee and employer shares); federal income tax withheld is a fact from the employer's payroll records. File Form 941 by the last day of the month after the quarter (April 30, July 31, October 31, January 31); deposit through EFTPS. Employers whose annual liability is $1,000 or less may be told by the IRS to file Form 944 instead.</p>`;
  };

  /* ================= Schedule H household employer (free) ================= */
  X.schedh = (v, H) => {
    const { esc, fmt, PD, today } = H; const F = PD.us.federal; const thr = F.householdThreshold || 3000;
    const emps = H.rows(v, ['hname', 'hcash', 'hfit', 'hq']).filter(e => e.hname || +e.hcash);
    let ssw = 0, fit = 0, anyQ = false; emps.forEach(e => { const c = +e.hcash || 0; if (c >= thr) ssw += c; fit += +e.hfit || 0; if ((+e.hq || 0) >= 1000) anyQ = true; });
    const ss = ssw * 0.124, med = ssw * 0.029, futaW = anyQ ? emps.reduce((a, e) => a + Math.min(+e.hcash || 0, F.futa.base), 0) : 0, futa = futaW * F.futa.rate;
    const total = ss + med + fit + futa;
    return `<div class="stub-head"><div><div class="stub-co">Schedule H (Form 1040) worksheet — Household Employment Taxes ${esc(v.year || yr())}</div><div class="stub-addr"><b>${esc(v.name) || 'Household employer'}</b>${v.ein ? ' · EIN ' + H.ein(v.ein) : ''}</div></div><div class="stub-meta"><div>Total household employment tax</div><div><b>${fmt(total)}</b></div></div></div>
<table class="stub-t"><thead><tr><th>Employee</th><th class="n">Cash wages</th><th class="n">SS/Medicare wages</th><th class="n">Federal income tax withheld</th></tr></thead><tbody>${emps.map(e => `<tr><td>${esc(e.hname)}</td><td class="n">${fmt(+e.hcash || 0)}</td><td class="n">${(+e.hcash || 0) >= thr ? fmt(+e.hcash) : '0.00 (under ' + fmt(thr) + ')'}</td><td class="n">${fmt(+e.hfit || 0)}</td></tr>`).join('') || '<tr><td colspan="4">Add employees on the left.</td></tr>'}</tbody></table>
<table class="stub-t"><tbody>
<tr><td>Part I, line 1a Total cash wages subject to social security tax</td><td class="n"><b>${fmt(ssw)}</b></td></tr>
<tr><td>2a Social security tax (line 1a × 12.4%)</td><td class="n"><b>${fmt(ss)}</b></td></tr>
<tr><td>3 Total cash wages subject to Medicare tax</td><td class="n"><b>${fmt(ssw)}</b></td></tr>
<tr><td>4 Medicare tax (line 3 × 2.9%)</td><td class="n"><b>${fmt(med)}</b></td></tr>
<tr><td>7 Federal income tax withheld</td><td class="n"><b>${fmt(fit)}</b></td></tr>
<tr><td>8 Total social security, Medicare, and federal income taxes</td><td class="n"><b>${fmt(ss + med + fit)}</b></td></tr>
<tr><td>Part II FUTA: ${anyQ ? 'you paid $1,000+ in a quarter → wages up to ' + fmt(F.futa.base) + ' per employee ' + fmt(futaW) + ' × ' + (F.futa.rate * 100).toFixed(1) + '% (after full state credit)' : 'no quarter with $1,000+ cash wages → no FUTA'}</td><td class="n"><b>${fmt(futa)}</b></td></tr>
<tr class="tot"><td>Line 26 Total household employment taxes → Schedule 2 (Form 1040)</td><td class="n"><b>${fmt(total)}</b></td></tr></tbody></table>
<p class="stub-foot">Prepared by the household employer with paysums.com on ${today()}. Threshold: an employee paid ${fmt(thr)} or more in cash wages in ${esc(v.year || yr())} owes social security and Medicare on all of it; the employer share is included above (the employee share of 7.65% is withheld from pay or paid by the employer). FUTA assumes state unemployment tax was paid in full; some states levy their own household unemployment tax. Pay through Form 1040 with the return, or raise your own withholding / estimated payments during the year to avoid an underpayment penalty.</p>`;
  };

  /* ================= Independent contractor agreement ================= */
  X.contract = (v, H) => {
    const { esc, fmt, fdate, nl2br, today } = H; const C = esc(v.client) || 'Client', K = esc(v.contractor) || 'Contractor';
    const comp = v.compType === 'hourly' ? `an hourly rate of ${fmt(+v.rate || 0)} for hours actually worked, invoiced ${esc(v.invoiceFreq || 'monthly')}` : v.compType === 'milestone' ? `the fixed fees for each milestone listed in Exhibit A, invoiced on completion of each milestone` : `a fixed fee of ${fmt(+v.rate || 0)} for the Services, invoiced ${esc(v.invoiceFreq || 'on completion')}`;
    let n = 0; const c = (t, b) => clause(++n, t, b);
    return `<div class="doc-legal"><h3 class="doc-title">Independent Contractor Agreement</h3>
<p>This Independent Contractor Agreement (the “Agreement”) is made on <b>${fdate(v.date) || '________'}</b> between <b>${C}</b>${v.clientEntity ? ', a ' + esc(v.clientEntity) : ''}, of ${nl2br(v.clientAddr) || '________'} (the “Client”), and <b>${K}</b>${v.contractorEntity ? ', a ' + esc(v.contractorEntity) : ''}, of ${nl2br(v.contractorAddr) || '________'} (the “Contractor”).</p>
${c('Services', `The Contractor will perform the following services (the “Services”): ${esc(v.services) || '________'}. The Contractor determines the means, manner and method of performing the Services; the Client is entitled to the results.`)}
${c('Term', `This Agreement begins on ${fdate(v.start) || '________'} and ${v.end ? 'ends on ' + fdate(v.end) : 'continues until the Services are complete or either party terminates it under Section ' + (n + 6)}.`)}
${c('Compensation', `The Client will pay the Contractor ${comp}. Invoices are payable within ${esc(v.netDays || '15')} days of receipt. ${v.expenses === 'yes' ? 'Reasonable pre-approved expenses are reimbursed at cost against receipts.' : 'The Contractor bears its own expenses unless agreed in writing in advance.'}`)}
${c('Independent contractor status', `The Contractor is an independent contractor, not an employee, partner or agent of the Client. The Contractor is responsible for all taxes on compensation under this Agreement (including self-employment tax) and will receive a Form 1099-NEC where required; no income tax, social security or Medicare will be withheld. The Contractor is not entitled to employee benefits, workers' compensation or unemployment insurance from the Client, may work for others, and supplies its own tools, equipment and place of work${v.insurance === 'yes' ? ', and will maintain general liability insurance for the term' : ''}.`)}
${c('Intellectual property', v.ip === 'contractor' ? `The Contractor retains ownership of the work product and grants the Client a perpetual, worldwide, royalty-free licence to use it for the Client's business upon payment in full.` : `Work product created for the Client under this Agreement is “work made for hire” to the extent permitted by law; to the extent it is not, the Contractor assigns all right, title and interest in it to the Client upon payment in full. The Contractor retains its pre-existing tools, know-how and generic components and grants the Client a licence to use them as part of the deliverables.`)}
${c('Confidentiality', `Each party will keep the other's non-public business, technical and customer information confidential, use it only for this Agreement, and return or destroy it on request. This obligation survives for ${esc(v.confYears || '3')} years after the Agreement ends (indefinitely for trade secrets).`)}
${v.nonSolicit ? c('Non-solicitation', `For ${esc(v.nonSolicit)} months after the Agreement ends, neither party will solicit for employment the other party's employees with whom it worked under this Agreement. Nothing in this Agreement restricts the Contractor from providing services to other clients.`) : ''}
${c('Termination', `Either party may terminate this Agreement on ${esc(v.notice || '14')} days' written notice, or immediately for material breach not cured within 7 days of notice. On termination the Client pays for Services performed to the termination date${v.compType === 'milestone' ? ' and for milestones completed' : ''}, and the Contractor delivers work product paid for.`)}
${c('Warranties and liability', `The Contractor warrants that the Services will be performed in a professional manner and that the work product will not knowingly infringe third-party rights. Except for confidentiality and IP obligations, neither party is liable for indirect or consequential damages, and each party's total liability is limited to the fees paid or payable under this Agreement.`)}
${c('General', `This Agreement is governed by the laws of the State of ${esc(v.state) || '________'}${v.dispute === 'arbitration' ? ', and disputes will be resolved by binding arbitration in that state' : ', and the courts of that state have jurisdiction'}. It is the entire agreement between the parties on its subject, replaces prior discussions, may be amended only in writing signed by both parties, and may be signed in counterparts, including electronically.`)}
${v.exhibit ? `<p class="cl"><b>Exhibit A — Deliverables and fees.</b><br>${nl2br(v.exhibit)}</p>` : ''}
<div class="sig2"><div><b>Client</b>${sign('Signature · ' + C)}<div class="small">Name / title: ${esc(v.clientSigner) || '________'}</div></div><div><b>Contractor</b>${sign('Signature · ' + K)}<div class="small">Name / title: ${esc(v.contractorSigner) || '________'}</div></div></div>
<p class="stub-foot">Generated with paysums.com on ${today()} from the parties' own entries. A general-purpose template, not legal advice; the parties are responsible for its suitability, and worker-classification rules (IRS common-law test, state ABC tests) turn on the actual working relationship, not on this document.</p></div>`;
  };

  /* ================= Offer letter ================= */
  X.offer = (v, H) => {
    const { esc, fmt, fdate, nl2br, today, PD, PC } = H; const D = PD.us;
    const salary = +v.salary || 0, hourly = v.payType === 'hourly'; const annual = hourly ? salary * (+v.hours || 40) * 52 : salary;
    let net = ''; try { if (v.showNet === 'yes' && annual) { const r = PC.calc('US', { amount: annual, period: 'annual', state: v.state || 'TX', filing: 'single' }, D); net = ` For reference, a single filer in ${esc(r.state)} would take home about ${fmt(r.periods.monthly)} a month after federal, FICA and state taxes at this pay (paysums.com estimate, ${esc(D.year)} tables; your withholding will depend on your W-4).`; } } catch (e) {}
    const benefits = String(v.benefits || '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
    return `<div class="doc-legal letterhead"><div class="stub-co">${esc(v.company) || 'Company'}</div><div class="stub-addr">${nl2br(v.companyAddr)}</div>
<p>${fdate(v.date) || today()}</p><p>${esc(v.candidate) || 'Candidate'}<br>${nl2br(v.candidateAddr)}</p>
<p>Dear ${esc((v.candidate || 'Candidate').split(' ')[0])},</p>
<p>We are pleased to offer you the position of <b>${esc(v.position) || '________'}</b> at ${esc(v.company) || 'Company'}, reporting to ${esc(v.manager) || '________'}${v.location ? ', based ' + esc(v.location) : ''}. Your anticipated start date is <b>${fdate(v.start) || '________'}</b>.</p>
<p><b>Compensation.</b> This is a ${esc(v.empType || 'full-time')}, ${v.exempt === 'yes' ? 'exempt' : 'non-exempt'} position. ${hourly ? `You will be paid <b>${fmt(salary)} per hour</b>${v.hours ? ' for a regular schedule of about ' + esc(v.hours) + ' hours a week' : ''}, with overtime as required by law` : `Your base salary will be <b>${fmt(salary)} per year</b>`}, paid ${esc(v.payFreq || 'bi-weekly')} in accordance with the company's normal payroll practices and subject to applicable withholdings.${v.bonus ? ' ' + esc(v.bonus) : ''}${v.equity ? ' ' + esc(v.equity) : ''}${net}</p>
${benefits.length ? `<p><b>Benefits.</b> You will be eligible for the company's benefit programs, currently including:</p><ul>${benefits.map(b => '<li>' + esc(b) + '</li>').join('')}</ul>` : ''}
${v.pto ? `<p><b>Time off.</b> ${esc(v.pto)}</p>` : ''}
${v.contingencies ? `<p><b>Conditions.</b> This offer is contingent on ${esc(v.contingencies)}.</p>` : ''}
<p><b>At-will employment.</b> Your employment will be at will: either you or the company may end it at any time, with or without cause or notice. This letter is not a contract of employment for any fixed term, and it supersedes any prior discussions about the terms of your employment. Any change to at-will status must be in writing and signed by ${esc(v.signerTitle) || 'an officer of the company'}.</p>
<p>${v.respondBy ? 'Please confirm your acceptance by signing below and returning this letter by <b>' + fdate(v.respondBy) + '</b>. ' : 'Please confirm your acceptance by signing below. '}We are excited to have you join us.</p>
<p>Sincerely,</p><div class="sig2"><div>${sign(esc(v.signer) || 'Signature')}<div class="small">${esc(v.signerTitle) || ''}</div></div><div><b>Accepted and agreed</b>${sign(esc(v.candidate) || 'Candidate')}</div></div>
<p class="stub-foot">Prepared by the employer with paysums.com on ${today()}. The employer is responsible for the offer's terms and for state-specific requirements (some states require written pay-rate notices or restrict non-compete and pay-history terms).</p></div>`;
  };

  /* ================= Loan-officer income calculation worksheet ================= */
  X.lo = (v, H) => {
    const { esc, fmt, fdate, today } = H;
    const hourly = v.payType === 'hourly'; const base = hourly ? (+v.rate || 0) * (+v.hours || 40) * 52 / 12 : (+v.salary || 0) / 12;
    const me = monthsElapsed(v.ytdThrough) || 0; const ytd = +v.ytd || 0, py = +v.prior || 0, py2 = +v.prior2 || 0;
    const ytdAvg = me ? ytd / me : 0; const varYtd = +v.varYtd || 0, varPy = +v.varPrior || 0, varPy2 = +v.varPrior2 || 0;
    const var24 = (me + 12) ? (varYtd + varPy) / (me + 12) : 0, var12 = varPy / 12, varYtdM = me ? varYtd / me : 0;
    const declining = varPy2 > 0 && varPy < varPy2 * 0.9 || (varPy > 0 && varYtdM < var12 * 0.9);
    const varUse = v.varInclude === 'no' ? 0 : declining ? Math.min(var24, varYtdM || var24) : var24;
    const baseUse = Math.min(base, ytdAvg || base); const total = baseUse + varUse;
    const flag = (ok, t) => `<span class="flag ${ok ? 'ok' : 'warn'}">${t}</span>`;
    return `<div class="stub-head"><div><div class="stub-co">Income calculation worksheet — wage earner</div><div class="stub-addr">Borrower <b>${esc(v.borrower) || '________'}</b>${v.loanNo ? ' · Loan ' + esc(v.loanNo) : ''} · Employer ${esc(v.employer) || '________'}${v.position ? ' · ' + esc(v.position) : ''}${v.startDate ? ' · since ' + fdate(v.startDate) : ''}</div></div><div class="stub-meta"><div>Qualifying monthly income</div><div><b>${fmt(total)}</b></div></div></div>
<table class="stub-t"><thead><tr><th>I. Base income</th><th class="n">Monthly</th><th>Check</th></tr></thead><tbody>
<tr><td>${hourly ? `Hourly ${fmt(+v.rate || 0)} × ${esc(v.hours || 40)} h/wk × 52 ÷ 12` : `Salary ${fmt(+v.salary || 0)} ÷ 12`}</td><td class="n">${fmt(base)}</td><td></td></tr>
<tr><td>YTD base ${fmt(ytd)} through ${fdate(v.ytdThrough)} ÷ ${me.toFixed(2)} months</td><td class="n">${fmt(ytdAvg)}</td><td>${me ? (Math.abs(ytdAvg - base) / (base || 1) < 0.05 ? flag(true, 'consistent with stated pay') : ytdAvg < base ? flag(false, 'YTD runs ' + Math.round((1 - ytdAvg / base) * 100) + '% below stated pay — use lower, document') : flag(true, 'YTD above stated pay (raise, OT or bonus in YTD?)')) : ''}</td></tr>
${py ? `<tr><td>Prior year W-2 box 5 ${fmt(py)} ÷ 12</td><td class="n">${fmt(py / 12)}</td><td>${py / 12 < base * 0.9 ? flag(false, 'prior year lower — verify raise date') : flag(true, 'supports current pay')}</td></tr>` : ''}
${py2 ? `<tr><td>Year before W-2 ${fmt(py2)} ÷ 12</td><td class="n">${fmt(py2 / 12)}</td><td></td></tr>` : ''}
<tr class="tot"><td>Base income used (lower of stated and YTD average)</td><td class="n">${fmt(baseUse)}</td><td></td></tr></tbody></table>
<table class="stub-t"><thead><tr><th>II. Variable income (overtime, bonus, commission)</th><th class="n">Monthly</th><th>Check</th></tr></thead><tbody>
<tr><td>YTD ${fmt(varYtd)} ÷ ${me.toFixed(2)} months</td><td class="n">${fmt(varYtdM)}</td><td></td></tr>
<tr><td>Prior year ${fmt(varPy)} ÷ 12</td><td class="n">${fmt(var12)}</td><td></td></tr>
${varPy2 ? `<tr><td>Year before ${fmt(varPy2)} ÷ 12</td><td class="n">${fmt(varPy2 / 12)}</td><td></td></tr>` : ''}
<tr><td>24-month average (YTD + prior year) ÷ ${(me + 12).toFixed(2)}</td><td class="n">${fmt(var24)}</td><td>${varYtd || varPy ? (declining ? flag(false, 'declining trend — use the lower figure or exclude; needs an explanation') : flag(true, 'stable or increasing')) : ''}</td></tr>
<tr class="tot"><td>Variable income used ${v.varInclude === 'no' ? '(excluded by underwriter)' : declining ? '(lower of YTD and 24-month average)' : '(24-month average)'}</td><td class="n">${fmt(varUse)}</td><td></td></tr></tbody></table>
<div class="stub-net"><span>III. Total qualifying monthly income</span><b>${fmt(total)}</b></div>
${v.notes ? '<p><b>Notes.</b> ' + esc(v.notes) + '</p>' : ''}
<p class="stub-foot">Prepared by ${esc(v.preparer) || 'the loan originator'} with paysums.com on ${today()} from the pay stubs and W-2s in the file. Method follows the usual agency approach for salaried/hourly borrowers (base: stated pay verified against YTD; variable: 24-month average, declining trends not averaged up); the lender's own guidelines and the AUS findings govern. For self-employed or bank-statement income use the bank-statement income calculator.</p>`;
  };

  /* ================= Total compensation statement ================= */
  X.totalcomp = (v, H) => {
    const { esc, fmt, PD, today, rows } = H; const F = PD.us.federal;
    const emps = rows(v, ['tname', 'tsalary', 'tbonus', 'tmatch', 'thealth', 'tdental', 'thsa', 'tlife', 'tpto', 'tother']).filter(e => e.tname || +e.tsalary);
    const suta = (+v.sutaRate || 0) / 100, sutaBase = +v.sutaBase || 7000, wc = (+v.wcRate || 0) / 100;
    const one = e => { const sal = +e.tsalary || 0, bonus = +e.tbonus || 0, cash = sal + bonus; const match = cash * (+e.tmatch || 0) / 100; const health = (+e.thealth || 0) * 12, dental = (+e.tdental || 0) * 12, hsa = +e.thsa || 0, life = +e.tlife || 0, pto = sal / 260 * (+e.tpto || 0), other = +e.tother || 0;
      const ss = Math.min(cash, F.ss.wageBase) * F.ss.rate, med = cash * F.medicare.rate, futa = Math.min(cash, F.futa.base) * F.futa.rate, sutaT = Math.min(cash, sutaBase) * suta, wcT = cash * wc;
      const ben = match + health + dental + hsa + life + other, tax = ss + med + futa + sutaT + wcT, total = cash + ben + tax + pto;
      const bar = (l, a, cls) => a > 0 ? `<tr><td>${l}</td><td class="n">${fmt(a)}</td><td class="bar"><i class="${cls}" style="width:${Math.max(1, a / total * 100).toFixed(1)}%"></i></td></tr>` : '';
      return `<div class="receipt"><div class="stub-head"><div><div class="stub-co">Total compensation statement · ${esc(v.year || yr())}</div><div class="stub-addr"><b>${esc(e.tname)}</b> · ${esc(v.company) || 'Employer'}</div></div><div class="stub-meta"><div>Total value of your employment</div><div><b>${fmt(total)}</b></div><div class="small">${fmt(cash)} in cash pay + ${fmt(total - cash)} more</div></div></div>
<table class="stub-t tc"><thead><tr><th>Component</th><th class="n">Annual value</th><th>Share</th></tr></thead><tbody>${bar('Base salary', sal, 'c1')}${bar('Bonus / commission', bonus, 'c1')}${bar('401(k) employer match (' + esc(e.tmatch || 0) + '% of pay)', match, 'c2')}${bar('Health insurance — employer share', health, 'c2')}${bar('Dental and vision — employer share', dental, 'c2')}${bar('HSA employer contribution', hsa, 'c2')}${bar('Life and disability insurance', life, 'c2')}${bar('Other benefits and perks', other, 'c2')}${bar('Paid time off (' + esc(e.tpto || 0) + ' days at your daily rate)', pto, 'c3')}${bar('Social Security and Medicare — employer share (7.65%)', ss + med, 'c4')}${bar('Federal and state unemployment insurance', futa + sutaT, 'c4')}${bar("Workers' compensation insurance", wcT, 'c4')}<tr class="tot"><td>Total</td><td class="n">${fmt(total)}</td><td></td></tr></tbody></table>
<p class="stub-foot">Prepared by the employer with paysums.com on ${today()}. Employer payroll taxes are computed at the ${esc(PD.us.year)} statutory rates (Social Security ${(F.ss.rate * 100).toFixed(1)}% to ${fmt(F.ss.wageBase)}, Medicare ${(F.medicare.rate * 100).toFixed(2)}%, FUTA ${(F.futa.rate * 100).toFixed(1)}% of the first ${fmt(F.futa.base)}); benefit values are the employer's own cost figures. This statement is informational and is not a contract.</p></div>`; };
    return emps.length ? emps.map(one).join('') : '<p>Add employees on the left.</p>';
  };

  /* ================= India Form 16 Part B ================= */
  X.form16 = (v, H) => {
    const { esc, fmt, PD, PC, nl2br, today } = H; const D = PD['in']; const old = v.regime === 'old'; const R = old ? D.old : D.new; const inr = x => fmt(x, 'INR');
    const s171 = +v.s171 || 0, s172 = +v.s172 || 0, s173 = +v.s173 || 0; const gross = s171 + s172 + s173;
    const ex10 = old ? (+v.hraEx || 0) + (+v.ltaEx || 0) + (+v.otherEx || 0) : 0; const pt = old ? (+v.pt || 0) : 0;
    const via = old ? { c: Math.min(R.sec80cLimit || 150000, +v.s80c || 0), ccd: Math.min(50000, +v.s80ccd || 0), d: +v.s80d || 0, e: +v.s80e || 0, g: +v.s80g || 0, o: +v.s80o || 0 } : { c: 0, ccd: 0, d: 0, e: 0, g: 0, o: 0 };
    const viaTot = via.c + via.ccd + via.d + via.e + via.g + via.o;
    const income = Math.max(0, gross - ex10 - R.std - pt); const taxable = Math.max(0, income - viaTot);
    let r = null; try { r = PC.calc('IN', { amount: taxable + R.std, period: 'annual', regime: old ? 'old' : 'new', pf: 'no', professionalTax: 0, basicPct: 50 }, D); } catch (e) {}
    const total = r ? r.taxes : 0, taxBefore = r ? (r.taxBeforeCess || 0) : 0, sur = r ? (r.surcharge || 0) : 0, cess = total - taxBefore - sur; const tds = +v.tds || 0;
    return `<div class="stub-head"><div><div class="stub-co">FORM NO. 16 — PART B (Annexure)</div><div class="stub-addr">Details of salary paid and any other income and tax deducted · [See rule 31(1)(a)]</div></div><div class="stub-meta"><div>Financial year ${esc(v.fy || D.year)}</div><div>Assessment year ${esc(v.ay || '')}</div></div></div>
<table class="stub-t w2"><tr><td>Name and address of the Employer<br><b>${esc(v.employer)}</b><br>${nl2br(v.employerAddr)}</td><td>Name and address of the Employee<br><b>${esc(v.employee)}</b>${v.designation ? ' · ' + esc(v.designation) : ''}<br>${nl2br(v.employeeAddr)}</td></tr><tr><td>TAN of the Deductor <b>${esc(v.tan)}</b> · PAN of the Deductor <b>${esc(v.employerPan)}</b></td><td>PAN of the Employee <b>${esc(String(v.pan || '').toUpperCase())}</b>${v.empRef ? ' · Ref. ' + esc(v.empRef) : ''}</td></tr><tr><td colspan="2">Period with the employer: ${esc(v.periodFrom)} to ${esc(v.periodTo)} · Tax regime opted: <b>${old ? 'Old (section 115BAC not opted)' : 'New (section 115BAC)'}</b></td></tr></table>
<table class="stub-t"><tbody>
<tr><td>1. Gross salary — (a) Salary as per section 17(1) ${inr(s171)} · (b) Perquisites u/s 17(2) ${inr(s172)} · (c) Profits in lieu u/s 17(3) ${inr(s173)}</td><td class="n"><b>${inr(gross)}</b></td></tr>
<tr><td>2. Less: allowances exempt under section 10 ${old ? '(HRA ' + inr(+v.hraEx || 0) + ', LTA ' + inr(+v.ltaEx || 0) + ', other ' + inr(+v.otherEx || 0) + ')' : '(not applicable under the new regime, except as permitted)'}</td><td class="n">${inr(ex10)}</td></tr>
<tr><td>3. Total amount of salary received from the employer (1 − 2)</td><td class="n">${inr(gross - ex10)}</td></tr>
<tr><td>4. Less: deductions under section 16 — (a) standard deduction ${inr(R.std)}${old ? ' · (c) tax on employment ' + inr(pt) : ''}</td><td class="n">${inr(R.std + pt)}</td></tr>
<tr><td>6. Income chargeable under the head “Salaries”</td><td class="n"><b>${inr(income)}</b></td></tr>
<tr><td>9. Gross total income</td><td class="n">${inr(income)}</td></tr>
${old ? `<tr><td>10. Deductions under Chapter VI-A — 80C ${inr(via.c)} · 80CCD(1B) ${inr(via.ccd)} · 80D ${inr(via.d)} · 80E ${inr(via.e)} · 80G ${inr(via.g)} · other ${inr(via.o)}</td><td class="n">${inr(viaTot)}</td></tr>` : '<tr><td>10. Deductions under Chapter VI-A (not available under the new regime, except 80CCD(2))</td><td class="n">0.00</td></tr>'}
<tr><td>12. Total taxable income</td><td class="n"><b>${inr(taxable)}</b></td></tr>
<tr><td>13. Tax on total income (slabs of the ${old ? 'old' : 'new'} regime, after rebate u/s 87A where due)</td><td class="n">${inr(taxBefore)}</td></tr>
<tr><td>15. Surcharge</td><td class="n">${inr(sur)}</td></tr>
<tr><td>16. Health and education cess @ 4%</td><td class="n">${inr(cess)}</td></tr>
<tr><td>17. Tax payable (13 + 15 + 16)</td><td class="n"><b>${inr(total)}</b></td></tr>
<tr><td>19. Net tax payable</td><td class="n"><b>${inr(total)}</b></td></tr>
<tr class="tot"><td>Tax deducted at source by the employer during the year (as reported in Form 24Q)</td><td class="n">${inr(tds)}${Math.abs(tds - total) > 1 ? ' <span class="small">(' + (tds > total ? 'excess ' + inr(tds - total) + ' refundable on the return' : 'short by ' + inr(total - tds) + ' — payable on the return') + ')</span>' : ''}</td></tr></tbody></table>
<p><b>Verification.</b> I, ${esc(v.signer) || '________'}, son/daughter of ________, working in the capacity of ${esc(v.signerTitle) || '________'}, do hereby certify that the information given above is true, complete and correct and is based on the books of account, documents, TDS statements and other available records.</p>
<div class="sig2"><div>${sign('Signature of the person responsible for deduction of tax')}</div><div class="small">Place: ${esc(v.place) || '______'} · Date: ${today()}<br>Full name: ${esc(v.signer) || '________'}</div></div>
<p class="stub-foot">Part B prepared by the employer with paysums.com; tax computed from the FY ${esc(D.year)} slabs, rebate, surcharge and cess. Part A (the TDS certificate with the TRACES logo and challan details) must be downloaded from TRACES by the deductor; this Part B is issued together with it. Figures for salary and TDS are the employer's payroll records.</p>`;
  };

  /* ================= Payroll check printer (pre-printed stock only) ================= */
  X.check = (v, H) => {
    const { esc, fmt, fdate, nl2br, today, rows } = H;
    const cks = rows(v, ['payee', 'amount', 'memo', 'stubText']).filter(c => c.payee || +c.amount);
    const start = parseInt(v.checkNo, 10) || 1001; const layout = v.layout || 'voucher';
    const face = (c, i) => `<div class="chk"><div class="chk-top"><div><b>${esc(v.payer) || 'Payer name'}</b><br><span class="small">${nl2br(v.payerAddr)}</span></div><div class="chk-no">${start + i}</div></div>
<div class="chk-date">Date <u>${fdate(v.date) || '__________'}</u></div>
<div class="chk-pay"><span>Pay to the order of</span> <u>${esc(c.payee) || '____________________'}</u> <span class="chk-amt">$ ${(+c.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
<div class="chk-words"><u>${esc(words(+c.amount || 0))}</u> Dollars</div>
<div class="chk-bot"><div>${v.bank ? esc(v.bank) + '<br>' : ''}Memo <u>${esc(c.memo) || '______________'}</u></div><div class="chk-sig"><span class="line"></span>Authorised signature</div></div>
<div class="chk-micr">— printed on pre-printed check stock; the bank's MICR line (routing · account · check no.) is on the stock —</div></div>`;
    const stub = (c, i) => `<div class="chk-stub"><b>${esc(v.payer)}</b> · Check ${start + i} · ${fdate(v.date)} · ${esc(c.payee)} · ${fmt(+c.amount || 0)}${c.memo ? ' · ' + esc(c.memo) : ''}${c.stubText ? '<br>' + nl2br(c.stubText) : ''}</div>`;
    return `<div class="chk-sheet ${layout}">${cks.map((c, i) => layout === 'voucher' ? `<div class="chk-page">${face(c, i)}${stub(c, i)}${stub(c, i)}</div>` : face(c, i)).join('') || '<p>Add a check on the left.</p>'}</div>
<p class="stub-foot">Printed by the payer with paysums.com on ${today()} onto the payer's own bank-issued check stock. This page prints no routing or account numbers — those, and the MICR line, come from the pre-printed stock — so it cannot produce a check on an account the printer does not hold. ${layout === 'voucher' ? 'Layout: check on top, two vouchers below (QuickBooks-style voucher stock).' : 'Layout: three checks per page (wallet/3-up stock).'}</p>`;
  };

  /* ================= Sales receipt (seller-issued) ================= */
  X.receipt = (v, H) => {
    const { esc, fdate, nl2br, today, PD, docId } = H; const cur = v.currency || 'USD'; const fmt = x => H.fmt(x, cur);
    const items = (v['desc[]'] || []).map((d, i) => ({ d, q: +(v['qty[]'] || [])[i] || 0, p: +(v['price[]'] || [])[i] || 0 })).filter(i => i.d || i.p);
    const sub = items.reduce((a, i) => a + i.q * i.p, 0); const disc = +v.discount || 0; const rate = +v.taxRate || 0; const tax = Math.max(0, sub - disc) * rate / 100; const total = sub - disc + tax;
    const no = v.receiptNo || ('R-' + (v.date || '').replace(/-/g, '') + '-' + docId(v).slice(-4));
    return `<div class="receipt"><div class="stub-head"><div><div class="stub-co">${esc(v.business) || 'Business name'}</div><div class="stub-addr">${nl2br(v.businessAddr)}${v.phone ? '<br>' + esc(v.phone) : ''}${v.taxId ? '<br>Tax / registration no. ' + esc(v.taxId) : ''}</div></div><div class="stub-meta"><div><b>RECEIPT</b></div><div>No. ${esc(no)}</div><div>Date ${fdate(v.date)}</div>${v.customer ? '<div>Customer: ' + esc(v.customer) + '</div>' : ''}</div></div>
<table class="stub-t"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.d)}</td><td class="n">${i.q}</td><td class="n">${fmt(i.p)}</td><td class="n">${fmt(i.q * i.p)}</td></tr>`).join('') || '<tr><td colspan="4">Add items on the left.</td></tr>'}
<tr class="tot"><td colspan="3">Subtotal</td><td class="n">${fmt(sub)}</td></tr>${disc ? `<tr><td colspan="3">Discount</td><td class="n">−${fmt(disc)}</td></tr>` : ''}${rate ? `<tr><td colspan="3">${esc(v.taxLabel || 'Sales tax')} ${rate}%${v.taxPlace ? ' (' + esc(v.taxPlace) + ')' : ''}</td><td class="n">${fmt(tax)}</td></tr>` : ''}<tr class="tot"><td colspan="3"><b>Total paid</b></td><td class="n"><b>${fmt(total)}</b></td></tr></tbody></table>
<p>Paid by <b>${esc(v.method || 'card')}</b>${v.last4 ? ' ending ' + esc(v.last4) : ''}.${v.notes ? ' ' + esc(v.notes) : ''}</p>
<p class="stub-foot">Issued by the seller named above${v.taxPlace ? '; sales tax at the ' + esc(v.taxPlace) + ' combined rate' : ''}. Receipt generated by the seller with paysums.com on ${today()}. <span class="inv-foot">Created with paysums.com/receipt-generator/</span></p></div>`;
  };

  /* ================= UK P60 / P45 (employer-issued) ================= */
  X.p60 = (v, H) => {
    const { esc, PD, PC, nl2br, today } = H; const D = PD.uk; const NI = D.ni; const g = x => H.fmt(x, 'GBP');
    const pay = +v.pay || 0, tax = +v.tax || 0, prevPay = +v.prevPay || 0, prevTax = +v.prevTax || 0, sl = +v.studentLoan || 0, pgl = +v.pgl || 0;
    let ni = 0; try { const r = PC.calc('UK', { amount: pay, period: 'annual', region: 'ruk', studentLoan: 'none', pensionPct: 0 }, D); const it = r.items.find(i => i.key === 'ni'); ni = it ? it.amount : 0; } catch (e) {}
    const lel = NI.lel || 6500, pt = NI.pt, uel = NI.uel; const atLel = pay >= lel ? lel : 0, lelPt = pay >= lel ? Math.min(pay, pt) - lel : 0, ptUel = pay > pt ? Math.min(pay, uel) - pt : 0;
    return `<div class="stub-head"><div><div class="stub-co">P60 End of Year Certificate — Tax year to 5 April ${esc(String(D.year).split('/')[1] ? '20' + String(D.year).split('/')[1] : '')}</div><div class="stub-addr">Employee's details · Works/payroll number ${esc(v.worksNo) || '—'} · National Insurance number ${esc(String(v.ni || '').toUpperCase())}</div></div><div class="stub-meta"><div><b>${esc(v.employee) || 'Employee'}</b></div><div>${nl2br(v.employeeAddr)}</div></div></div>
<table class="stub-t w2"><tbody>
<tr><td colspan="2"><b>Pay and Income Tax details</b></td><td class="n">Pay £</td><td class="n">Tax deducted £</td></tr>
<tr><td colspan="2">In previous employment(s)</td><td class="n">${g(prevPay)}</td><td class="n">${g(prevTax)}</td></tr>
<tr><td colspan="2">In this employment</td><td class="n">${g(pay)}</td><td class="n">${g(tax)}${tax < 0 ? ' R' : ''}</td></tr>
<tr class="tot"><td colspan="2">Total for year</td><td class="n">${g(prevPay + pay)}</td><td class="n">${g(prevTax + tax)}</td></tr>
<tr><td colspan="4">Final tax code <b>${esc(v.taxCode || D.taxCode || '1257L')}</b>${v.week1 === 'yes' ? ' (week 1 / month 1 basis)' : ''}</td></tr></tbody></table>
<table class="stub-t w2"><tbody><tr><td colspan="5"><b>National Insurance contributions in this employment</b></td></tr>
<tr><td>NIC table letter</td><td class="n">Earnings at the LEL (where earnings reach or exceed the LEL)</td><td class="n">Earnings above the LEL, up to and including the PT</td><td class="n">Earnings above the PT, up to and including the UEL</td><td class="n">Employee's contributions due on all earnings above the PT</td></tr>
<tr><td><b>${esc(v.niLetter || 'A')}</b></td><td class="n">${g(atLel)}</td><td class="n">${g(lelPt)}</td><td class="n">${g(ptUel)}</td><td class="n">${g(ni)}</td></tr></tbody></table>
<table class="stub-t w2"><tbody><tr><td>Statutory payments included in the pay “In this employment” figure: SMP ${g(+v.smp || 0)} · SPP ${g(+v.spp || 0)}</td><td>Student Loan deductions in this employment (whole £s only) <b>${Math.floor(sl)}</b> · Postgraduate Loan <b>${Math.floor(pgl)}</b></td></tr></tbody></table>
<table class="stub-t w2"><tbody><tr><td>Employer's name and address<br><b>${esc(v.employer)}</b><br>${nl2br(v.employerAddr)}</td><td>Employer PAYE reference<br><b>${esc(v.payeRef) || '___/________'}</b></td></tr></tbody></table>
<p class="small">To the employee: keep this certificate — you will need it if you have to fill in a tax return, to claim back overpaid tax, or for tax credits and other claims. By law you are required to tell HMRC about any income that is not fully taxed, even if you are not sent a tax return.</p>
<p class="stub-foot">Issued by the employer named above with paysums.com on ${today()}. Pay, tax deducted and student loan figures are the totals reported to HMRC through the employer's RTI submissions; National Insurance earnings bands and the employee contribution are computed from the ${esc(D.year)} thresholds (LEL £${lel.toLocaleString()}, PT £${pt.toLocaleString()}, UEL £${uel.toLocaleString()}) for table letter A. An employee cannot issue their own P60; a certificate that does not match the employer's RTI figures is worthless to HMRC.</p>`;
  };
  X.p45 = (v, H) => {
    const { esc, PD, nl2br, today, fdateGB } = H; const D = PD.uk; const g = x => H.fmt(x, 'GBP');
    const part = (title, sub) => `<div class="receipt"><div class="stub-head"><div><div class="stub-co">P45 ${title} — Details of employee leaving work</div><div class="stub-addr">${sub}</div></div><div class="stub-meta"><div>Employer PAYE reference</div><div><b>${esc(v.payeRef) || '___/________'}</b></div></div></div>
<table class="stub-t w2"><tbody>
<tr><td>2 Employee's National Insurance number<br><b>${esc(String(v.ni || '').toUpperCase())}</b></td><td>3 Title · Surname · First name(s)<br><b>${esc(v.employee)}</b></td></tr>
<tr><td>4 Leaving date<br><b>${fdateGB(v.leaveDate)}</b></td><td>5 Student Loan deductions to continue: ${v.studentLoan === 'yes' ? '☒' : '☐'} · Postgraduate Loan: ${v.pgl === 'yes' ? '☒' : '☐'}</td></tr>
<tr><td>6 Tax code at leaving date<br><b>${esc(v.taxCode || D.taxCode || '1257L')}</b> ${v.week1 === 'yes' ? '· Week 1 / Month 1 ☒' : ''}</td><td>7 Last entries on payroll record: Week number <b>${esc(v.weekNo || '')}</b> · Month number <b>${esc(v.monthNo || '')}</b></td></tr>
<tr><td>7 Total pay to date<br><b>${g(+v.payToDate || 0)}</b></td><td>7 Total tax to date<br><b>${g(+v.taxToDate || 0)}</b></td></tr>
${v.week1 === 'yes' || +v.payThisEmp ? `<tr><td>8 This employment pay<br><b>${g(+v.payThisEmp || +v.payToDate || 0)}</b></td><td>8 This employment tax<br><b>${g(+v.taxThisEmp || +v.taxToDate || 0)}</b></td></tr>` : ''}
<tr><td>9 Works/payroll number<br><b>${esc(v.worksNo) || '—'}</b></td><td>10 Gender ${v.gender === 'F' ? 'Female ☒' : v.gender === 'M' ? 'Male ☒' : '☐'} · 11 Date of birth <b>${fdateGB(v.dob)}</b></td></tr>
<tr><td colspan="2">12 Employee's private address<br><b>${nl2br(v.employeeAddr)}</b></td></tr>
<tr><td colspan="2">13 I certify that the details entered above are correct. Employer name and address<br><b>${esc(v.employer)}</b><br>${nl2br(v.employerAddr)}<br>Date ${today()}</td></tr></tbody></table></div>`;
    return part('Part 1A', 'Copy for employee — keep this; you may need it for a tax return or a claim') + part('Part 2', 'Copy for new employer — hand Parts 2 and 3 to your new employer') + part('Part 3', 'New employer copy — to be completed by the new employer and sent to HMRC') + `<p class="stub-foot">Issued by the employer with paysums.com on ${today()}. Part 1 is sent to HMRC by the employer through the RTI leaver submission (Full Payment Submission with the leaving date); the figures here are that submission's figures. An employee cannot issue their own P45.</p>`;
  };

  /* ================= India salary certificate / experience / relieving letter ================= */
  X.salarycert = (v, H) => {
    const { esc, fdate, nl2br, today, PD, PC } = H; const D = PD['in']; const inr = x => H.fmt(x, 'INR'); const t = v.docType || 'salary';
    const gross = +v.gross || 0; let r = null; try { r = PC.calc('IN', { amount: gross, period: 'monthly', regime: v.regime || 'new', pf: v.pf !== 'no', professionalTax: (+v.pt || 0) * 12, basicPct: +v.basicPct || 50 }, D); } catch (e) {}
    const basic = gross * (+v.basicPct || 50) / 100, hra = +v.hra || 0, other = Math.max(0, gross - basic - hra); const net = r ? r.periods.monthly : gross;
    const head = `<div class="doc-legal letterhead"><div class="stub-co">${esc(v.employer) || 'Employer'}</div><div class="stub-addr">${nl2br(v.employerAddr)}</div><p>Ref: ${esc(v.ref) || 'HR/' + yr() + '/____'} · Date: ${fdate(v.date) || today()}</p>`;
    const foot = `<p>For <b>${esc(v.employer)}</b></p><div class="sig2"><div>${sign(esc(v.signer) || 'Authorised signatory')}<div class="small">${esc(v.signerTitle) || ''}</div></div><div class="small">Company seal</div></div><p class="stub-foot">Issued by the employer with paysums.com on ${today()}. ${t === 'salary' ? 'Deductions are computed from the FY ' + esc(D.year) + ' slabs and EPF rules; the employer’s payroll records and Form 16 govern.' : ''} An employee cannot issue this letter to themselves; verifiers may contact the signatory above.</p></div>`;
    if (t === 'experience') return head + `<h3 class="doc-title">TO WHOMSOEVER IT MAY CONCERN — Experience certificate</h3><p>This is to certify that <b>${esc(v.employee)}</b>${v.empId ? ' (Employee ID ' + esc(v.empId) + ')' : ''} was employed with ${esc(v.employer)} from <b>${fdate(v.doj)}</b> to <b>${fdate(v.dol) || 'date'}</b> as <b>${esc(v.designation)}</b>${v.department ? ' in the ' + esc(v.department) + ' department' : ''}.</p><p>${v.conduct || 'During this period we found them to be sincere, hardworking and professional in the discharge of their duties.'}${v.lastCtc ? ' Their last drawn compensation was ' + inr(+v.lastCtc) + ' per annum (CTC).' : ''}</p><p>We wish them success in their future endeavours.</p>` + foot;
    if (t === 'relieving') return head + `<h3 class="doc-title">Relieving letter</h3><p>To,<br><b>${esc(v.employee)}</b>${v.empId ? '<br>Employee ID ' + esc(v.empId) : ''}<br>${esc(v.designation)}</p><p>Dear ${esc((v.employee || '').split(' ')[0])},</p><p>This is with reference to your resignation dated ${fdate(v.resignDate) || '______'}. We accept the same and confirm that you are relieved from the services of ${esc(v.employer)} with effect from the close of business on <b>${fdate(v.dol)}</b>.</p><p>You have completed the handover of responsibilities and company property, and your full and final settlement ${v.fnf === 'done' ? 'has been processed' : 'will be processed as per company policy'}. Your employment with us was from ${fdate(v.doj)} to ${fdate(v.dol)}.</p><p>We thank you for your contribution and wish you the best for the future.</p>` + foot;
    return head + `<h3 class="doc-title">Salary certificate</h3><p>This is to certify that <b>${esc(v.employee)}</b>${v.empId ? ' (Employee ID ' + esc(v.empId) + ')' : ''} is employed with ${esc(v.employer)} as <b>${esc(v.designation)}</b> since <b>${fdate(v.doj)}</b> on a ${esc(v.empNature || 'permanent')} basis. ${v.purpose ? 'This certificate is issued at the employee’s request for the purpose of ' + esc(v.purpose) + '.' : ''}</p>
<p>Their current monthly salary is as follows:</p><table class="stub-t"><tbody><tr><td>Basic salary</td><td class="n">${inr(basic)}</td></tr><tr><td>House rent allowance</td><td class="n">${inr(hra)}</td></tr><tr><td>Special / other allowances</td><td class="n">${inr(other)}</td></tr><tr class="tot"><td>Gross monthly salary</td><td class="n">${inr(gross)}</td></tr>${r ? r.items.filter(i => i.amount / 12 > 0.5).map(i => `<tr><td>Less: ${esc(i.label.replace('Income tax', 'TDS'))}</td><td class="n">${inr(i.amount / 12)}</td></tr>`).join('') : ''}<tr class="tot"><td>Net monthly salary</td><td class="n"><b>${inr(net)}</b></td></tr><tr><td>Annual cost to company (CTC)</td><td class="n">${inr(+v.ctc || gross * 12)}</td></tr></tbody></table>` + foot;
  };

  /* ================= Residential lease agreement ================= */
  X.lease = (v, H) => {
    const { esc, fmt, fdate, nl2br, today } = H; const L = esc(v.landlord) || 'Landlord', T = esc(v.tenants) || 'Tenant'; const rent = +v.rent || 0, dep = +v.deposit || 0;
    let n = 0; const c = (t, b) => clause(++n, t, b); const mtm = v.termType === 'monthly';
    return `<div class="doc-legal"><h3 class="doc-title">Residential Lease Agreement</h3>
<p>This Residential Lease Agreement (the “Lease”) is made on <b>${fdate(v.date) || '________'}</b> between <b>${L}</b>, of ${nl2br(v.landlordAddr) || '________'} (the “Landlord”), and <b>${T}</b> (the “Tenant”, jointly and severally if more than one).</p>
${c('Premises', `The Landlord leases to the Tenant the residence at <b>${esc(v.property) || '________'}</b>${v.unit ? ', ' + esc(v.unit) : ''} (the “Premises”)${v.included ? ', including ' + esc(v.included) : ''}, for use as a private residence by the Tenant and the following occupants only: ${esc(v.occupants) || 'none other'}.`)}
${c('Term', mtm ? `The tenancy is month-to-month beginning ${fdate(v.start) || '________'} and continues until either party ends it with at least ${esc(v.noticeDays || '30')} days' written notice, effective at the end of a rental period.` : `The term is fixed, from <b>${fdate(v.start) || '________'}</b> to <b>${fdate(v.end) || '________'}</b>. If the Tenant remains after the end date with the Landlord's consent, the tenancy continues month-to-month on the same terms, terminable by either party on ${esc(v.noticeDays || '30')} days' written notice.`)}
${c('Rent', `Rent is <b>${fmt(rent)} per month</b>, payable in advance on the ${esc(v.dueDay || '1st')} day of each month by ${esc(v.payMethod) || 'any method the Landlord accepts in writing'}.${v.prorated ? ' Rent for the first partial month is ' + fmt(+v.prorated) + '.' : ''}${+v.lateFee ? ` Rent received more than ${esc(v.graceDays || '5')} days late incurs a late fee of ${fmt(+v.lateFee)}${v.nsfFee ? ', and a returned-payment fee of ' + fmt(+v.nsfFee) : ''}, to the extent permitted by law.` : ''}`)}
${c('Security deposit', dep ? `The Tenant pays a security deposit of <b>${fmt(dep)}</b> on signing. It may be applied to unpaid rent, damage beyond normal wear and tear, and other amounts the Tenant owes, and the balance is returned with an itemised statement within the period required by the law of the State of ${esc(v.state) || '________'} after the Tenant vacates and returns the keys.` : `No security deposit is required.`)}
${c('Utilities and services', `The Landlord pays: ${esc(v.landlordUtils) || 'none'}. The Tenant pays: ${esc(v.tenantUtils) || 'all utilities and services for the Premises'}.`)}
${c('Use, pets and smoking', `The Premises are for residential use only; no business use that brings customers or deliveries, and nothing unlawful. Pets: ${v.pets === 'yes' ? 'permitted — ' + (esc(v.petTerms) || 'as described by the Tenant on signing') + (+v.petDeposit ? ', with an additional pet deposit of ' + fmt(+v.petDeposit) : '') : 'not permitted without the Landlord’s written consent'}. Smoking${v.smoking === 'yes' ? ' is permitted' : ' (including vaping) is not permitted inside the Premises'}.`)}
${c('Condition, maintenance and repairs', `The Tenant accepts the Premises in their present condition (see any move-in checklist attached), will keep them clean and undamaged, and will promptly report needed repairs. The Landlord maintains the structure, systems and appliances supplied in working order and makes repairs required by law. The Tenant pays for damage caused by the Tenant, occupants or guests. No alterations, painting or locks changes without written consent.`)}
${c('Access', `The Landlord may enter to inspect, repair, or show the Premises with at least ${esc(v.entryNotice || '24')} hours' notice, at reasonable times, and without notice in an emergency.`)}
${c('Assignment and subletting', `The Tenant may not assign this Lease or sublet any part of the Premises (including short-term rentals) without the Landlord's written consent.`)}
${c('Default', `If the Tenant fails to pay rent or breaches this Lease and does not cure within the time allowed by law after written notice, the Landlord may end the tenancy and recover possession, unpaid rent and damages as the law permits. The Tenant is liable for rent through the end of the term subject to the Landlord's duty to mitigate where the law requires it.`)}
${c('Insurance and liability', `The Landlord's insurance does not cover the Tenant's belongings; the Tenant is ${v.rentersIns === 'yes' ? 'required to carry' : 'encouraged to carry'} renter's insurance. The Landlord is not liable for loss to the Tenant's property except as caused by the Landlord's negligence.`)}
${v.leadPaint === 'yes' ? c('Lead-based paint disclosure (housing built before 1978)', `The Landlord ${v.leadKnown === 'yes' ? 'has knowledge of lead-based paint and/or lead-based paint hazards in the housing: ' + (esc(v.leadDetails) || '(see attached)') : 'has no knowledge of lead-based paint and/or lead-based paint hazards in the housing'} and ${v.leadKnown === 'yes' ? 'has provided the Tenant with all available records and reports' : 'has no reports or records pertaining to lead-based paint in the housing'}. The Tenant acknowledges receipt of the EPA pamphlet <i>Protect Your Family From Lead in Your Home</i>. Landlord initials ____ Tenant initials ____`) : ''}
${v.extra ? c('Additional terms', nl2br(v.extra)) : ''}
${c('General', `This Lease is governed by the laws of the State of ${esc(v.state) || '________'}; any provision that conflicts with applicable landlord-tenant law is modified to the minimum extent needed to comply, and any state-required disclosures or addenda attached to this Lease form part of it. Notices are in writing to the addresses above (or the Premises for the Tenant). This is the entire agreement; changes must be in writing and signed by both parties. Time is of the essence.`)}
<div class="sig2"><div><b>Landlord</b>${sign(L)}</div><div><b>Tenant(s)</b>${sign(T)}</div></div>
<p class="stub-foot">Generated with paysums.com on ${today()} from the parties' own entries. A general residential lease template, not legal advice; landlord-tenant law varies by state and city (deposit limits and return deadlines, late-fee caps, required disclosures, rent-control and just-cause rules). Check your state's required disclosures and attach them.</p></div>`;
  };

  /* ================= Child support guideline estimate (free) ================= */
  X.childsupport = (v, H) => {
    const { esc, fmt, PD, PC, today } = H; const D = PD.us; const st = v.state || 'TX'; const kids = Math.max(1, Math.min(6, Math.floor(+v.kids || 1)));
    const grossM = +v.gross || 0; const ins = +v.insurance || 0, dues = +v.dues || 0;
    let net = grossM; try { const r = PC.calc('US', { amount: grossM * 12, period: 'annual', state: st, filing: 'single' }, D); const fed = r.items.filter(i => ['federal', 'ss', 'medicare'].includes(i.key)).reduce((a, i) => a + i.amount, 0) / 12; const stt = r.items.filter(i => i.key === 'state').reduce((a, i) => a + i.amount, 0) / 12; net = grossM - fed - (st === 'MS' || st === 'AK' ? stt : 0); } catch (e) {}
    const M = {
      TX: { name: 'Texas', model: 'percentage of net resources', pct: [20, 25, 30, 35, 40, 40], base: () => Math.min(11700, net - ins - dues), baseLabel: `net resources (gross − federal income tax at single rates − Social Security and Medicare${ins ? ' − children\'s health insurance' : ''}${dues ? ' − union dues' : ''}), capped at $11,700`, src: 'Texas Family Code §154.125 (cap of $11,700 from 1 September 2025; 20% for one child, +5 points per child)' },
      WI: { name: 'Wisconsin', model: 'percentage of gross income', pct: [17, 25, 29, 31, 34, 34], base: () => grossM, baseLabel: 'gross monthly income', src: 'Wis. Admin. Code DCF 150 (17 / 25 / 29 / 31 / 34% for 1–5+ children)' },
      MS: { name: 'Mississippi', model: 'percentage of adjusted gross income', pct: [14, 20, 22, 24, 26, 26], base: () => net, baseLabel: 'adjusted gross income (gross − federal and state income tax − Social Security and Medicare)', src: 'Miss. Code §43-19-101 (14 / 20 / 22 / 24 / 26% for 1–5+ children)' },
      AK: { name: 'Alaska', model: 'percentage of adjusted annual income', pct: [20, 27, 33, 36, 39, 42], base: () => net, baseLabel: 'adjusted income (gross − federal income tax − Social Security and Medicare)', src: 'Alaska Civil Rule 90.3 (20 / 27 / 33% for 1–3 children, +3 points per additional child)' },
      NV: { name: 'Nevada', model: 'tiered percentage of gross income', pct: null, base: () => grossM, baseLabel: 'gross monthly income', src: 'NAC 425.140 (tiers: first $6,000, $6,001–$10,000, above $10,000)' },
    };
    const m = M[st];
    if (!m) return `<div class="receipt"><div class="stub-head"><div><div class="stub-co">Child support in ${esc((D.states[st] || {}).name || st)}</div><div class="stub-addr">Income-shares (or Melson) model</div></div></div><p>${esc((D.states[st] || {}).name || st)} sets support from a schedule that combines <b>both</b> parents' incomes and the number of children, then splits the result in proportion to each parent's share of the combined income, with adjustments for parenting time, health insurance and child-care costs. The schedule is a table, not a percentage, so there is no honest one-parent shortcut — use the state's official guideline calculator (search “${esc((D.states[st] || {}).name || st)} child support guidelines calculator” on the state's .gov site) with both incomes.</p><p>What this page can still give you: the paying parent's <b>after-tax monthly income</b> in ${esc((D.states[st] || {}).name || st)} is about <b>${fmt(net)}</b> on ${fmt(grossM)} gross (federal, FICA and state tax at single rates), which is the figure most income-shares worksheets start from.</p><p class="stub-foot">Estimate computed with paysums.com on ${today()}; not legal advice. Courts can deviate from guidelines.</p></div>`;
    const base = Math.max(0, m.base()); let amt, how;
    if (st === 'NV') { const t = { 1: [16, 8, 4], 2: [22, 11, 6], 3: [26, 13, 6], 4: [28, 14, 7] }[Math.min(kids, 4)].map((p, i) => p + (kids > 4 ? [2, 1, 0.5][i] * (kids - 4) : 0)); const b1 = Math.min(base, 6000), b2 = Math.min(Math.max(0, base - 6000), 4000), b3 = Math.max(0, base - 10000); amt = b1 * t[0] / 100 + b2 * t[1] / 100 + b3 * t[2] / 100; how = `${t[0]}% of the first $6,000 (${fmt(b1 * t[0] / 100)})${b2 ? ' + ' + t[1] + '% of the next $4,000 (' + fmt(b2 * t[1] / 100) + ')' : ''}${b3 ? ' + ' + t[2] + '% above $10,000 (' + fmt(b3 * t[2] / 100) + ')' : ''}`; }
    else { const p = m.pct[kids - 1]; amt = base * p / 100; how = `${p}% × ${fmt(base)}`; }
    return `<div class="receipt"><div class="stub-head"><div><div class="stub-co">Guideline child support — ${m.name}</div><div class="stub-addr">${m.model} · ${kids} child${kids > 1 ? 'ren' : ''} · paying parent earns ${fmt(grossM)} a month gross</div></div><div class="stub-meta"><div>Guideline amount</div><div><b>${fmt(amt)}</b> / month</div></div></div>
<table class="stub-t"><tbody><tr><td>Gross monthly income</td><td class="n">${fmt(grossM)}</td></tr><tr><td>${m.baseLabel}</td><td class="n">${fmt(base)}</td></tr><tr><td>Guideline: ${how}</td><td class="n"><b>${fmt(amt)}</b></td></tr><tr><td>Per year</td><td class="n">${fmt(amt * 12)}</td></tr></tbody></table>
<p class="small">Source: ${m.src}. Taxes deducted are computed by paysums.com from the ${esc(D.year)} tables at single-filer rates, as the guidelines direct. The court may adjust for other children the parent supports, shared or split custody, health insurance, child-care costs, or income above the guideline maximum.</p>
<p class="stub-foot">Estimate computed with paysums.com on ${today()}; not legal advice and not a court order. Use the state's official worksheet for filings.</p></div>`;
  };

  return X;
})();
