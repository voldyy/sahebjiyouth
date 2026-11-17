'use strict';
/* Anoopam Mission security policy acknowledgement - front end.
   The personal token is in the URL fragment (#t=...), which browsers never send to a web server.
   It is sent only in the body of POST requests to the Apps Script backend. */
(function () {
  const API = 'https://script.google.com/macros/s/AKfycby9RnydBu5TgMaVPO52I_uttjeiPEEENpz5iMz7vskKZghiElBM3c2nxe07lhvuGkug/exec';
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || '';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = $('#app');
  const S = {
    info: null, docs: {}, cache: {}, quiz: [], device: [], deviceNote: '', approvals: {},
    checks: { read: false, agree: false, esign: false }, name: '', sigMode: 'draw', strokes: [],
    readerDoc: null, readerMust: false, opener: null, pad: null
  };

  function el(tag, attrs) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function (kv) {
      const k = kv[0], v = kv[1];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
    }
    return e;
  }

  async function api(a, body) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', redirect: 'follow',
        body: JSON.stringify(Object.assign({ a: a, t: token }, body || {}))
      });
    } catch (e) {
      throw new Error('Could not reach the server. Please check your connection and try again.');
    }
    if (!res.ok) throw new Error('The server did not answer (' + res.status + '). Please try again in a minute.');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function fmt(iso) {
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }); } catch (e) { return iso; }
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function message(title, text) {
    app.replaceChildren(el('section', { class: 'card' }, el('h1', { text: title }), el('p', { text: text })));
  }

  async function start() {
    if (!token) {
      message('Please use your personal link', 'This page opens from the personal link in the email sent to you from usayouth@anoopam.org.');
      return;
    }
    try {
      S.info = await api('info');
    } catch (e) {
      message('This page could not be opened', e.message);
      return;
    }
    const i = S.info;
    i.required.concat(i.reference, i.approvals.map(function (a) { return a.doc; })).forEach(function (d) { S.docs[d.id] = d; });
    if (i.signed) renderDone(i.signed.record, i.signed.recordHash);
    else renderAll();
  }

  // ------------------------------------------------------------------ page
  function stepHead(n, title, text, id) {
    return el('div', { class: 'step-head' }, el('div', { class: 'num', id: id, text: String(n) }),
      el('div', {}, el('h2', { text: title }), text ? el('p', { text: text }) : null));
  }

  function renderAll() {
    const i = S.info;
    let total = 5;
    i.required.forEach(function (d) { total += d.minutes; });
    i.approvals.forEach(function (a) { total += a.doc.minutes; });
    total = Math.ceil(total / 5) * 5;
    app.replaceChildren();
    const hero = el('section', { class: 'card' },
      el('h1', { text: 'Hi ' + i.person.first + ',' }),
      el('p', { class: 'role', text: i.person.name + ' · ' + i.person.role }),
      el('p', { text: 'The card industry’s security standard (PCI DSS) asks everyone with access to Anoopam Mission’s donation platform to read the security policy, complete a short training and sign an acknowledgement once a year. This takes about ' + total + ' minutes. Documents you finish and a passed quiz are saved as you go, so you can come back to this link later.' }),
      el('p', { class: 'small muted', text: 'Please finish by ' + i.deadline + '.' }),
      el('div', { class: 'progress' }, el('div', { id: 'bar' })),
      el('div', { id: 'progress-text', class: 'small muted' }));
    (i.person.notes || []).forEach(function (n) { hero.append(el('div', { class: 'note', text: n })); });
    app.append(hero);
    let n = 0;
    app.append(stepDocs(++n));
    if (i.quiz) app.append(stepQuiz(++n));
    if (i.device) app.append(stepDevice(++n));
    if (i.approvals.length) app.append(stepApprovals(++n));
    app.append(stepSign(++n));
    i.required.concat(i.reference, i.approvals.map(function (a) { return a.doc; })).forEach(function (d) { paintDoc(d.id); });
    updateProgress();
  }

  function docRow(d, required) {
    return el('div', { class: 'doc-row' },
      el('div', { class: 't' }, el('b', { text: d.title }), el('span', { text: d.subtitle + ' · about ' + d.minutes + ' min' })),
      el('span', { class: 'chip', 'data-chip': d.id }),
      el('button', { class: 'btn', type: 'button', 'data-open': d.id, onclick: function (ev) { openDoc(d.id, required, ev.currentTarget); } }));
  }

  function paintDoc(id) {
    const d = S.docs[id];
    const required = S.info.required.some(function (x) { return x.id === id; }) || S.info.approvals.some(function (a) { return a.doc.id === id; });
    document.querySelectorAll('[data-chip="' + id + '"]').forEach(function (chip) {
      if (required) { chip.className = 'chip ' + (d.read ? 'ok' : 'todo'); chip.textContent = d.read ? 'Read ✓' : 'To read'; }
      else { chip.className = 'chip' + (d.viewed ? ' ok' : ''); chip.textContent = d.viewed ? 'Opened' : 'Optional'; }
    });
    document.querySelectorAll('[data-open="' + id + '"]').forEach(function (b) { b.textContent = (d.read || d.viewed) ? 'Open again' : 'Open'; });
  }

  function stepDocs(n) {
    const i = S.info;
    const sec = el('section', { class: 'card' },
      stepHead(n, 'Read the documents', 'Open each document, read it to the end, then press “I have read this document”.', 'num-docs'));
    i.required.forEach(function (d) { sec.append(docRow(d, true)); });
    if (i.reference.length) {
      const det = el('details', { class: 'ref' }, el('summary', { text: 'Reference documents for your role (' + i.reference.length + ', optional)' }));
      i.reference.forEach(function (d) { det.append(docRow(d, false)); });
      sec.append(det);
    }
    return sec;
  }

  function stepQuiz(n) {
    const q = S.info.quiz;
    const sec = el('section', { class: 'card' },
      stepHead(n, 'Training quiz', q.total + ' questions about the training slides. ' + q.pass + ' or more correct passes, and you can try again.', 'num-quiz'));
    if (q.passed) {
      sec.append(el('div', { class: 'result ok', text: 'Passed ✓ (best score ' + q.best + ' of ' + q.total + ')' }));
      return sec;
    }
    q.questions.forEach(function (qq, idx) {
      const box = el('div', { class: 'q', id: 'q' + idx }, el('p', { text: (idx + 1) + '. ' + qq.q }));
      qq.options.forEach(function (o) {
        const input = el('input', {
          type: 'radio', name: 'q' + idx, value: o.k, onchange: function () {
            S.quiz[idx] = o.k;
            box.querySelectorAll('.opt').forEach(function (lab) { lab.classList.toggle('chosen', lab.contains(input)); });
            box.classList.remove('right', 'wrong');
          }
        });
        box.append(el('label', { class: 'opt' }, input, el('span', { text: '(' + o.k + ') ' + o.t })));
      });
      sec.append(box);
    });
    const result = el('div', { id: 'quiz-result', 'aria-live': 'polite' });
    const btn = el('button', { class: 'btn primary', type: 'button', text: 'Check my answers' });
    btn.addEventListener('click', async function () {
      if (q.questions.some(function (_, idx) { return !S.quiz[idx]; })) {
        result.replaceChildren(el('div', { class: 'result bad', text: 'Please answer all ' + q.total + ' questions.' }));
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const r = await api('quiz', { answers: S.quiz });
        r.results.forEach(function (ok, idx) {
          const box = $('#q' + idx);
          box.classList.toggle('right', ok);
          box.classList.toggle('wrong', !ok);
          box.querySelectorAll('.why').forEach(function (w) { w.remove(); });
          if (r.explain) box.append(el('div', { class: 'why', text: r.explain[idx] }));
        });
        if (r.passed) {
          q.passed = true;
          q.best = Math.max(q.best || 0, r.score);
          result.replaceChildren(el('div', { class: 'result ok', text: 'Passed ✓ ' + r.score + ' of ' + r.total + ' correct.' }));
          sec.querySelectorAll('input').forEach(function (x) { x.disabled = true; });
          btn.remove();
        } else {
          result.replaceChildren(el('div', { class: 'result bad', text: r.score + ' of ' + r.total + ' correct. Please look at the training slides again and change the answers marked in red.' }));
          btn.disabled = false;
          btn.textContent = 'Check my answers';
        }
        updateProgress();
      } catch (e) {
        result.replaceChildren(el('div', { class: 'result bad', text: e.message }));
        btn.disabled = false;
        btn.textContent = 'Check my answers';
      }
    });
    sec.append(btn, result);
    return sec;
  }

  function stepDevice(n) {
    const sec = el('section', { class: 'card' },
      stepHead(n, 'Device checklist', 'For the computer and the phone you use to sign in to Anoopam systems. If an item is “No”, add a short note and Mihir will help you fix it.', 'num-device'));
    S.info.device.forEach(function (text, idx) {
      const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': text });
      ['yes', 'no'].forEach(function (v) {
        const id = 'dev' + idx + v;
        const inp = el('input', {
          type: 'radio', name: 'dev' + idx, id: id, value: v, onchange: function () {
            S.device[idx] = v;
            seg.querySelectorAll('label').forEach(function (l) { l.className = l.htmlFor === 'dev' + idx + S.device[idx] ? 'on-' + v : ''; });
            $('#dev-note-field').hidden = S.device.indexOf('no') < 0;
            updateProgress();
          }
        });
        seg.append(inp, el('label', { for: id, text: v === 'yes' ? 'Yes' : 'No' }));
      });
      sec.append(el('div', { class: 'dev' }, el('span', { text: (idx + 1) + '. ' + text }), seg));
    });
    const note = el('textarea', { id: 'dev-note', maxlength: '600', placeholder: 'Which item, and what is the situation?' });
    note.addEventListener('input', function () { S.deviceNote = note.value; updateProgress(); });
    sec.append(el('div', { class: 'field', id: 'dev-note-field', hidden: true }, el('label', { class: 'lbl', for: 'dev-note', text: 'Note for the items answered No' }), note));
    return sec;
  }

  function stepApprovals(n) {
    const sec = el('section', { class: 'card' }, stepHead(n, 'Approval', 'Read the document, then tick the approval.', 'num-approve'));
    S.info.approvals.forEach(function (a) {
      sec.append(docRow(a.doc, true));
      const cb = el('input', { type: 'checkbox', onchange: function () { S.approvals[a.id] = cb.checked; updateProgress(); } });
      sec.append(el('label', { class: 'check' }, cb, el('span', { text: a.statement })));
    });
    return sec;
  }

  function stepSign(n) {
    const i = S.info;
    const sec = el('section', { class: 'card' }, stepHead(n, 'Acknowledge and sign', null, 'num-sign'));
    sec.append(el('div', { class: 'statement', text: i.statement }));
    const boxes = [
      ['read', 'I have read the Information Security Policy (AM-PCI-01) and the other required documents on this page.'],
      ['agree', 'I agree to the statement above.'],
      ['esign', i.esign]
    ];
    boxes.forEach(function (b) {
      const cb = el('input', { type: 'checkbox', onchange: function () { S.checks[b[0]] = cb.checked; updateProgress(); } });
      sec.append(el('label', { class: 'check' }, cb, el('span', { text: b[1] })));
    });
    const name = el('input', { type: 'text', id: 'full-name', autocomplete: 'name', placeholder: i.person.name, maxlength: '120' });
    name.addEventListener('input', function () { S.name = name.value; $('#typed').textContent = name.value || i.person.name; updateProgress(); });
    sec.append(el('div', { class: 'field' }, el('label', { class: 'lbl', for: 'full-name', text: 'Your full name' }), name));
    const tDraw = el('button', { type: 'button', class: 'on', text: 'Draw' });
    const tType = el('button', { type: 'button', text: 'Type' });
    const canvas = el('canvas', { class: 'pad', 'aria-label': 'Signature pad: sign with your finger or mouse' });
    const clear = el('button', { type: 'button', class: 'btn pad-clear', text: 'Clear', onclick: function () { S.pad.clear(); } });
    const padWrap = el('div', { class: 'pad-wrap' }, canvas, el('div', { class: 'pad-line' }), el('div', { class: 'pad-hint', text: 'Sign above the line' }), clear);
    const typed = el('div', { class: 'typed', id: 'typed', hidden: true, text: i.person.name });
    function mode(m) {
      S.sigMode = m;
      tDraw.className = m === 'draw' ? 'on' : '';
      tType.className = m === 'type' ? 'on' : '';
      padWrap.hidden = m !== 'draw';
      typed.hidden = m !== 'type';
      if (m === 'draw') S.pad.resize();
      updateProgress();
    }
    tDraw.addEventListener('click', function () { mode('draw'); });
    tType.addEventListener('click', function () { mode('type'); });
    sec.append(el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Your signature' }), el('div', { class: 'tabs', role: 'tablist' }, tDraw, tType), padWrap, typed));
    sec.append(el('ul', { class: 'missing', id: 'missing' }));
    const err = el('div', { id: 'sign-error', 'aria-live': 'assertive' });
    const btn = el('button', { class: 'btn primary big', type: 'button', id: 'sign-btn', text: 'Sign and submit' });
    btn.addEventListener('click', function () { submitSign(btn, err); });
    sec.append(err, btn, el('p', { class: 'small muted', text: 'Your signature is recorded with the date and time, the document versions you read, your quiz result and your browser type. A copy is emailed to you.' }));
    setTimeout(function () { S.pad = pad(canvas); }, 0);
    return sec;
  }

  // ------------------------------------------------------------------ signature pad
  function pad(canvas) {
    const ctx = canvas.getContext('2d');
    let cur = null;
    function rect() { return canvas.getBoundingClientRect(); }
    function redraw() {
      const r = rect();
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d2b53';
      S.strokes.forEach(function (s) {
        ctx.beginPath();
        s.forEach(function (p, j) {
          const x = p[0] / 600 * r.width, y = p[1] / 200 * r.height;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        if (s.length === 1) ctx.lineTo(s[0][0] / 600 * r.width + 0.6, s[0][1] / 200 * r.height + 0.6);
        ctx.stroke();
      });
    }
    function resize() {
      const r = rect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function pt(ev) {
      const r = rect();
      return [Math.max(0, Math.min(600, (ev.clientX - r.left) / r.width * 600)), Math.max(0, Math.min(200, (ev.clientY - r.top) / r.height * 200))];
    }
    canvas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      cur = [pt(ev)];
      S.strokes.push(cur);
      redraw();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!cur) return;
      const p = pt(ev), l = cur[cur.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) >= 2) { cur.push(p); redraw(); }
    });
    function end() { if (cur) { cur = null; updateProgress(); } }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    window.addEventListener('resize', resize);
    resize();
    return { resize: resize, clear: function () { S.strokes = []; redraw(); updateProgress(); } };
  }

  function points() { return S.strokes.reduce(function (n, s) { return n + s.length; }, 0); }

  function sigPath() {
    for (let k = 1; k <= 8; k++) {
      const path = S.strokes.map(function (s) {
        const pts = s.filter(function (_, j) { return j % k === 0 || j === s.length - 1; });
        const m = pts.map(function (p, j) { return (j ? 'L' : 'M') + Math.round(p[0]) + ' ' + Math.round(p[1]); });
        if (pts.length === 1) m.push('L' + (Math.round(pts[0][0]) + 1) + ' ' + Math.round(pts[0][1]));
        return m.join(' ');
      }).join(' ');
      if (path.length <= 4400) return path;
    }
    return null;
  }

  // ------------------------------------------------------------------ progress and signing
  function nameOk() {
    const typed = ' ' + norm(S.name) + ' ';
    return norm(S.info.person.name).split(' ').every(function (w) { return typed.indexOf(' ' + w + ' ') >= 0; });
  }

  function status() {
    const i = S.info;
    const docsDone = i.required.every(function (d) { return S.docs[d.id].read; });
    const quizDone = !i.quiz || i.quiz.passed;
    const devDone = !i.device || (S.device.filter(Boolean).length === i.device.length && (S.device.indexOf('no') < 0 || S.deviceNote.trim().length >= 3));
    const apprDone = i.approvals.every(function (a) { return S.docs[a.doc.id].read && S.approvals[a.id]; });
    const missing = [];
    const unread = i.required.filter(function (d) { return !S.docs[d.id].read; });
    if (unread.length) missing.push('Read: ' + unread.map(function (d) { return d.title; }).join('; '));
    if (!quizDone) missing.push('Pass the training quiz');
    if (!devDone) missing.push(S.device.filter(Boolean).length < (i.device || []).length ? 'Answer every device checklist item' : 'Add a note for the device items answered No');
    i.approvals.forEach(function (a) {
      if (!S.docs[a.doc.id].read) missing.push('Read: ' + a.doc.title);
      if (!S.approvals[a.id]) missing.push('Tick the approval for the ' + a.title);
    });
    if (!(S.checks.read && S.checks.agree && S.checks.esign)) missing.push('Tick the three boxes above');
    if (!nameOk()) missing.push('Type your full name (' + i.person.name + ')');
    if (S.sigMode === 'draw' && points() < 8) missing.push('Draw your signature, or choose “Type”');
    return { docsDone: docsDone, quizDone: quizDone, devDone: devDone, apprDone: apprDone, missing: missing };
  }

  function updateProgress() {
    if (!S.info || S.info.signed) return;
    const st = status();
    const parts = [st.docsDone];
    if (S.info.quiz) parts.push(st.quizDone);
    if (S.info.device) parts.push(st.devDone);
    if (S.info.approvals.length) parts.push(st.apprDone);
    const done = parts.filter(Boolean).length;
    const bar = $('#bar');
    if (bar) bar.style.width = Math.round(done / (parts.length + 1) * 100) + '%';
    const txt = $('#progress-text');
    if (txt) txt.textContent = done + ' of ' + (parts.length + 1) + ' steps done';
    [['num-docs', st.docsDone], ['num-quiz', st.quizDone], ['num-device', st.devDone], ['num-approve', st.apprDone]].forEach(function (x) {
      const node = $('#' + x[0]);
      if (node) node.classList.toggle('done', !!x[1]);
    });
    const ul = $('#missing');
    if (ul) ul.replaceChildren.apply(ul, st.missing.map(function (m) { return el('li', { text: m }); }));
    const btn = $('#sign-btn');
    if (btn) btn.disabled = st.missing.length > 0;
  }

  async function submitSign(btn, err) {
    const st = status();
    if (st.missing.length) return;
    let sig;
    if (S.sigMode === 'draw') {
      const path = sigPath();
      if (!path) { err.replaceChildren(el('div', { class: 'banner', text: 'Your drawing is too detailed to store. Please press Clear and sign again, or choose “Type”.' })); return; }
      sig = { type: 'draw', path: path, width: 600, height: 200 };
    } else {
      sig = { type: 'type' };
    }
    btn.disabled = true;
    btn.textContent = 'Signing…';
    err.replaceChildren();
    try {
      const r = await api('sign', {
        checks: S.checks, name: S.name, sig: sig, device: S.info.device ? S.device : null, deviceNote: S.deviceNote, approvals: S.approvals,
        client: { ua: navigator.userAgent, tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), lang: navigator.language || '', screen: screen.width + 'x' + screen.height }
      });
      S.info.signed = r;
      renderDone(r.record, r.recordHash);
      window.scrollTo(0, 0);
    } catch (e) {
      err.replaceChildren(el('div', { class: 'banner', text: e.message }));
      btn.disabled = false;
      btn.textContent = 'Sign and submit';
    }
  }

  // ------------------------------------------------------------------ done and printable copy
  function title(id) { return (S.docs[id] && S.docs[id].title) || id; }

  function sigNode(sig, name) {
    if (sig.type === 'draw') {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 600 200');
      svg.setAttribute('width', '300');
      svg.setAttribute('height', '100');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', sig.path);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#1d2b53');
      p.setAttribute('stroke-width', '3');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.append(p);
      return svg;
    }
    return el('span', { class: 'typed-inline', style: 'font-family:"Segoe Script","Snell Roundhand","Apple Chancery","Brush Script MT",cursive;font-size:26px;color:#1d2b53', text: name });
  }

  function renderDone(rec, hash) {
    const i = S.info;
    const devAll = rec.device ? rec.device.answers.split(',').every(function (a) { return a === 'yes'; }) : null;
    const rows = [
      ['Signed', fmt(rec.signedAt)], ['Receipt number', rec.receipt], ['Name', rec.typedName], ['Role', rec.role],
      ['Documents read', rec.docs.map(function (d) { return title(d.id); }).join('; ')]
    ];
    if (rec.quiz) rows.push(['Training quiz', rec.quiz.best + ' of ' + rec.quiz.total + ' (passed)']);
    if (rec.device) rows.push(['Device checklist', devAll ? 'All yes' : 'Some items need follow-up (see the copy)']);
    (rec.approvals || []).forEach(function (a) { rows.push(['Approved', title(a.doc)]); });
    rows.push(['Record fingerprint', hash]);
    const kv = el('div', { class: 'kv' });
    rows.forEach(function (r) { kv.append(el('div', { text: r[0] }), el('div', { class: r[0] === 'Record fingerprint' ? 'mono' : '', text: r[1] })); });
    const printBtn = el('button', { class: 'btn primary', type: 'button', text: 'Print or save a copy', onclick: function () { buildPrint(rec, hash); window.print(); } });
    app.replaceChildren(el('section', { class: 'card done-hero' },
      el('div', { class: 'big-check', text: '✓' }),
      el('h1', { text: 'Thank you, ' + i.person.first + '.' }),
      el('p', { text: 'Your acknowledgement is signed and recorded.' }),
      el('div', {}, sigNode(rec.signature, rec.typedName)),
      kv,
      el('p', {}, printBtn),
      el('p', { class: 'small muted', text: 'A copy will be emailed to ' + rec.email + ' within the hour. If you did not sign this yourself, please call Jayesh Shah at 610-636-6548 right away.' })));
    buildPrint(rec, hash);
  }

  function buildPrint(rec, hash) {
    const i = S.info;
    const out = $('#print');
    const t = el('table');
    function row(k, v) { t.append(el('tr', {}, el('th', { text: k }), typeof v === 'string' ? el('td', { text: v }) : el('td', {}, v))); }
    row('Name', rec.typedName + ' (on file: ' + rec.name + ')');
    row('Role', rec.role);
    row('Email', rec.email);
    row('Signed', fmt(rec.signedAt) + ' (' + rec.signedAt + ' UTC)');
    row('Receipt number', rec.receipt);
    row('Statement', i.statement);
    row('Electronic signature consent', i.esign);
    const docs = el('div');
    rec.docs.forEach(function (d) { docs.append(el('div', { text: title(d.id) + ' — read ' + fmt(d.readAt) + ' — SHA-256 ' + d.sha256 })); });
    row('Documents read', docs);
    if (rec.referenceViewed && rec.referenceViewed.length) row('Reference documents opened', rec.referenceViewed.map(title).join('; '));
    if (rec.quiz) row('Training quiz (AM-PCI-T1)', rec.quiz.best + ' of ' + rec.quiz.total + ', passed ' + fmt(rec.quiz.passedAt) + ' (' + rec.quiz.attempts + ' attempt' + (rec.quiz.attempts === 1 ? '' : 's') + ')');
    if (rec.device) {
      const dv = el('div');
      rec.device.answers.split(',').forEach(function (a, idx) { dv.append(el('div', { text: (a === 'yes' ? 'Yes' : 'No') + ' — ' + (i.device || [])[idx] })); });
      if (rec.device.note) dv.append(el('div', { text: 'Note: ' + rec.device.note }));
      row('Device checklist', dv);
    }
    (rec.approvals || []).forEach(function (a) {
      const ap = i.approvals.filter(function (x) { return x.id === a.id; })[0];
      row('Approval', (ap ? ap.statement : a.id) + ' (document SHA-256 ' + a.docSha256 + ')');
    });
    row('Signature', sigNode(rec.signature, rec.typedName));
    row('Record fingerprint (SHA-256)', hash);
    row('Browser', rec.client.ua + ' · ' + rec.client.tz);
    out.replaceChildren(el('h1', { text: 'Anoopam Mission, Inc. — Security policy acknowledgement' }),
      el('p', { text: 'PCI DSS v4.0.1 requirements 12.1.3, 12.6.1 and 12.6.3. Record kept by the Information Security Officer.' }), t);
  }

  // ------------------------------------------------------------------ reader
  const reader = $('#reader'), rBody = $('#reader-body'), rDone = $('#reader-done'), rHint = $('#reader-hint');

  async function openDoc(id, mustRead, opener) {
    S.readerDoc = id;
    S.readerMust = mustRead;
    S.opener = opener || null;
    $('#reader-title').textContent = S.docs[id].title;
    $('#reader-sub').textContent = 'Loading…';
    rBody.replaceChildren();
    rBody.scrollTop = 0;
    reader.hidden = false;
    document.body.style.overflow = 'hidden';
    rDone.disabled = true;
    rDone.textContent = mustRead ? (S.docs[id].read ? 'Close' : 'I have read this document') : 'Close';
    rHint.textContent = '';
    $('#reader-close').focus();
    try {
      const res = S.cache[id] || await api('doc', { d: id });
      S.cache[id] = res;
      if (S.readerDoc !== id) return;
      $('#reader-sub').textContent = S.docs[id].subtitle;
      rBody.innerHTML = res.html; // our own documents, served only to this link
      S.docs[id].viewed = true;
      paintDoc(id);
      checkScroll();
    } catch (e) {
      rBody.replaceChildren(el('div', { class: 'banner', text: e.message }));
    }
  }

  function checkScroll() {
    if (!S.readerDoc) return;
    const d = S.docs[S.readerDoc];
    if (!S.readerMust || d.read) { rDone.disabled = false; rHint.textContent = ''; return; }
    if (!rBody.firstChild) return;
    const atEnd = rBody.scrollTop + rBody.clientHeight >= rBody.scrollHeight - 80;
    rDone.disabled = !atEnd;
    rHint.textContent = atEnd ? '' : 'Scroll to the end to continue.';
  }

  function closeReader() {
    reader.hidden = true;
    document.body.style.overflow = '';
    S.readerDoc = null;
    if (S.opener) S.opener.focus();
  }

  rBody.addEventListener('scroll', checkScroll, { passive: true });
  $('#reader-close').addEventListener('click', closeReader);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !reader.hidden) closeReader(); });
  rDone.addEventListener('click', async function () {
    const id = S.readerDoc;
    if (!id) return;
    if (!S.readerMust || S.docs[id].read) { closeReader(); return; }
    rDone.disabled = true;
    rDone.textContent = 'Saving…';
    try {
      await api('read', { d: id });
      S.docs[id].read = true;
      paintDoc(id);
      updateProgress();
      closeReader();
    } catch (e) {
      rHint.textContent = e.message;
      rDone.disabled = false;
      rDone.textContent = 'I have read this document';
    }
  });

  start();
})();
