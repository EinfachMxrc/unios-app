// SPDX-License-Identifier: AGPL-3.0-or-later
// Fixed read-only provider protocol verified from user-supplied HARs.
// Never follows the booking link, submits forms, or returns HTML/session data.
function (selection, requestId, mode) {
  const key = '__uniosRoomAvailability';
  const reply = status => JSON.stringify({ status });
  if (location.origin !== 'https://myapps.hs-coburg.de' ||
      !/^\/raumbuchung(?:\/|$)/.test(location.pathname) || document.querySelector('input[type=password]')) {
    return reply('login-required');
  }
  if (mode === 'poll') {
    const slot = window[key];
    return slot?.id === requestId ? JSON.stringify(slot.result || { status: 'pending' }) : reply('failed');
  }
  if (mode === 'stop') {
    if (window[key]?.id === requestId) { window[key].controller.abort(); delete window[key]; }
    return reply('stopped');
  }
  const rooms = ['4-030', '4-031', '4-032', '4-034', '4-035', '4-036', '4-037', '4-038', '4-039', '5-U11a'];
  const date = new Date(`${selection.day}T12:00:00Z`);
  const time = /^(\d{2}):([03]0)$/.exec(selection.startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selection.day) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== selection.day || !time ||
      Number(time[1]) < 8 || Number(time[1]) > 21 ||
      !Number.isInteger(selection.persons) || selection.persons < 1 || selection.persons > 1000 ||
      !Number.isInteger(selection.duration) || selection.duration < 30 || selection.duration > 180 ||
      selection.duration % 30 || (selection.room !== '' && !rooms.includes(selection.room))) return reply('failed');
  const path = selection.room ? `/raumbuchung/raum-buchen/${selection.room}/verfuegbarkeit` :
    '/raumbuchung/kategorie-buchen/8/verfuegbarkeit';
  const url = new URL(path, location.origin);
  url.search = new URLSearchParams({ capacity: String(selection.persons), date: selection.day,
    time: String(Number(time[1]) * 3600 + Number(time[2]) * 60), duration: String(selection.duration * 60) }).toString();
  const controller = new AbortController();
  const slot = { id: requestId, controller, result: null };
  window[key] = slot;
  const timer = setTimeout(() => controller.abort(), 10000);
  (async () => {
    try {
      const response = await fetch(url.href, { method: 'GET', credentials: 'same-origin',
        redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (!response.ok || response.url !== url.href || response.redirected ||
          !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '') || !response.body) {
        slot.result = { status: response.status === 401 || response.status === 403 ? 'login-required' : 'failed' };
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let html = '', size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 262144) { await reader.cancel(); throw new Error('size'); }
        html += decoder.decode(part.value, { stream: true });
      }
      html += decoder.decode();
      // A disconnected template keeps scripts, images and iframes inert.
      // Do not insert provider HTML into either visible window.
      const template = document.createElement('template');
      template.innerHTML = html;
      const page = template.content;
      if (page.querySelector('input[type=password]')) { slot.result = { status: 'login-required' }; return; }
      const clean = node => (node.textContent || '').replace(/\s+/g, ' ').trim();
      const modals = Array.from(page.querySelectorAll('.modal')).map(clean);
      if (modals.some(text => text.includes('Räume dürfen maximal 14 Tage im voraus gebucht werden'))) {
        slot.result = { status: 'advance-limit' }; return;
      }
      const headings = Array.from(page.querySelectorAll('h1,h2,h3')).map(clean).filter(text =>
        /^Raumbuchung am \d{2}\.\d{2}\. \d{2}:\d{2} für (?:\d:[03]0 h|30 min)$/.test(text));
      const messages = Array.from(page.querySelectorAll('p')).map(clean).filter(text =>
        /^Der Raum [\w-]+ steht zur Verfügung\.$/.test(text));
      const links = Array.from(page.querySelectorAll('a[href]')).filter(node => clean(node) === 'Raum verbindlich buchen');
      if (headings.length !== 1 || messages.length !== 1 || links.length !== 1) { slot.result = { status: 'unknown' }; return; }
      const room = /^Der Raum ([\w-]+) steht zur Verfügung\.$/.exec(messages[0])[1];
      const target = new URL(links[0].getAttribute('href'), location.origin);
      const epoch = target.searchParams.get('from');
      if (!rooms.includes(room) || (selection.room && room !== selection.room) ||
          target.origin !== location.origin || target.username || target.password ||
          target.pathname !== `/raumbuchung/buchen/${room}/` || !/^\d{10}$/.test(epoch || '') || Number(epoch) % 60 !== 0 ||
          target.searchParams.get('duration') !== String(selection.duration * 60)) { slot.result = { status: 'unknown' }; return; }
      // The heading omits the year; verify the full date/time from the offered timestamp.
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric',
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(Number(epoch) * 1000));
      const value = type => parts.find(part => part.type === type)?.value;
      if (`${value('year')}-${value('month')}-${value('day')}` !== selection.day ||
          `${value('hour')}:${value('minute')}` !== selection.startTime) { slot.result = { status: 'unknown' }; return; }
      slot.result = { status: 'offered', snapshot: { heading: headings[0], message: messages[0], canBook: true } };
    } catch { slot.result = { status: 'failed' }; }
    finally { clearTimeout(timer); }
  })();
  return reply('pending');
}
