// SPDX-License-Identifier: AGPL-3.0-or-later
(() => {
  if (location.origin !== 'https://myapps.hs-coburg.de' ||
      !/^\/raumbuchung(?:\/|$)/.test(location.pathname) || document.querySelector('input[type=password]')) {
    return JSON.stringify({ heading: '', message: '', canBook: false });
  }
  const text = (document.body?.innerText || '').slice(0, 100000);
  const headings = text.split('\n').map(line => line.trim()).filter(line => /^Raumbuchung am /.test(line));
  const messages = [...text.matchAll(/\bDer Raum [\w-]+ steht zur Verfügung\./g)].map(match => match[0]);
  const canBook = Array.from(document.querySelectorAll('button, a, input[type=submit]')).some(node => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && !node.disabled &&
      (node.innerText || node.value || '').trim() === 'Raum verbindlich buchen';
  });
  return JSON.stringify({
    heading: headings.length === 1 ? headings[0].slice(0, 200) : '',
    message: messages.length === 1 ? messages[0] : '',
    canBook
  });
})()
