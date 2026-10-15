// SPDX-License-Identifier: AGPL-3.0-or-later
(selection) => {
  if (location.origin !== 'https://myapps.hs-coburg.de' ||
      !/^\/raumbuchung(?:\/|$)/.test(location.pathname) || document.querySelector('input[type=password]')) {
    return JSON.stringify({ filled: [] });
  }
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const caption = label => {
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, button').forEach(node => node.remove());
    return clean(copy.textContent);
  };
  const fields = Array.from(document.querySelectorAll('input:not([type=hidden]), select')).filter(node => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && !node.disabled && !node.readOnly;
  });
  const definitions = [
    ['day', 'Datum', selection.day],
    ['persons', 'Personenanzahl', String(selection.persons)],
    ['startTime', 'Uhrzeit', selection.startTime],
    ['duration', 'Dauer', selection.duration === 30 ? '30 min' : `${Math.floor(selection.duration / 60)}:${String(selection.duration % 60).padStart(2, '0')} h`],
    ['room', 'Bitte wählen Sie einen Raum aus:', selection.room],
  ];
  const filled = [];
  for (const [key, label, value] of definitions) {
    if (!value) continue;
    const matches = fields.filter(node => clean(node.getAttribute('aria-label')) === label ||
      Array.from(node.labels || []).some(entry => caption(entry) === label));
    if (matches.length !== 1) continue;
    const node = matches[0];
    if (node.tagName === 'SELECT') {
      const options = Array.from(node.options).filter(option => !option.disabled &&
        (clean(option.textContent) === value || (key === 'room' && clean(option.textContent).startsWith(`${value} (`))));
      if (options.length !== 1) continue;
      node.value = options[0].value;
    } else if (['text', 'number', 'date', 'time'].includes(node.type)) {
      node.value = key === 'day' && node.type !== 'date' ? selection.day.split('-').reverse().join('.') : value;
    } else continue;
    // Deliberately no click, submit, or input/change event: a university handler could submit on change.
    filled.push(key);
  }
  return JSON.stringify({ filled });
}
