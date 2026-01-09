/**
 * DOM Helper - Safe DOM manipulation for Firefox
 * Évite les avertissements innerHTML de Firefox
 */

window.FJD_DOM = {
  // Crée un élément avec des attributs et du contenu texte
  create(tag, attrs = {}, textContent = '') {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'cssText') {
        el.style.cssText = value;
      } else if (key === 'className') {
        el.className = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key.startsWith('aria-') || key.startsWith('data-')) {
        el.setAttribute(key, value);
      } else if (key === 'role' || key === 'id') {
        el.setAttribute(key, value);
      } else {
        el.setAttribute(key, value);
      }
    }
    if (textContent) el.textContent = textContent;
    return el;
  },

  // Ajoute plusieurs enfants à un parent
  append(parent, ...children) {
    children.forEach(child => {
      if (child) parent.appendChild(child);
    });
    return parent;
  },

  // Crée un span avec style inline
  span(text, style = '') {
    const el = document.createElement('span');
    if (style) el.style.cssText = style;
    el.textContent = text;
    return el;
  },

  // Crée une div avec style
  div(style = '', children = []) {
    const el = document.createElement('div');
    if (style) el.style.cssText = style;
    children.forEach(c => { if (c) el.appendChild(c); });
    return el;
  },

  // Crée un bouton
  button(text, attrs = {}) {
    const btn = document.createElement('button');
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') btn.style.cssText = v;
      else if (k === 'onclick') btn.onclick = v;
      else if (k === 'className') btn.className = v;
      else btn.setAttribute(k, v);
    }
    btn.textContent = text;
    return btn;
  },

  // Crée un titre (h1-h6)
  heading(level, text, style = '') {
    const el = document.createElement('h' + level);
    if (style) el.style.cssText = style;
    el.textContent = text;
    return el;
  },

  // Crée un élément <p>
  p(text, style = '') {
    const el = document.createElement('p');
    if (style) el.style.cssText = style;
    el.textContent = text;
    return el;
  },

  // Crée une liste <ul>
  ul(items, style = '', itemStyle = '') {
    const ul = document.createElement('ul');
    if (style) ul.style.cssText = style;
    items.forEach(item => {
      const li = document.createElement('li');
      if (itemStyle) li.style.cssText = itemStyle;
      if (typeof item === 'string') {
        li.textContent = item;
      } else if (item instanceof Node) {
        li.appendChild(item);
      } else if (item.text) {
        li.textContent = item.text;
        if (item.style) li.style.cssText = item.style;
      }
      ul.appendChild(li);
    });
    return ul;
  },

  // Crée une section avec header optionnel
  section(headerText, children = [], attrs = {}) {
    const section = document.createElement('section');
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') section.style.cssText = v;
      else if (k === 'className') section.className = v;
      else section.setAttribute(k, v);
    }
    if (headerText) {
      const h = document.createElement('h4');
      h.textContent = headerText;
      h.style.cssText = 'font-size: 13px; font-weight: 600; margin: 0 0 8px 0;';
      section.appendChild(h);
    }
    children.forEach(c => { if (c) section.appendChild(c); });
    return section;
  },

  // Crée une barre de progression
  progressBar(value, color, label = '') {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 8px;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;';

    const labelSpan = document.createElement('span');
    labelSpan.style.color = '#334155';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = `color: ${color}; font-weight: 600;`;
    valueSpan.textContent = value + '%';

    header.appendChild(labelSpan);
    header.appendChild(valueSpan);

    const track = document.createElement('div');
    track.style.cssText = 'height: 6px; background: #e2e8f0; border-radius: 3px;';
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-valuenow', value);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-label', label);

    const fill = document.createElement('div');
    fill.style.cssText = `width: ${value}%; height: 100%; background: ${color}; border-radius: 3px; transition: width 0.3s ease;`;

    track.appendChild(fill);
    container.appendChild(header);
    container.appendChild(track);

    return container;
  },

  // Crée un header de section avec style
  sectionHeader(text, style = '', attrs = {}) {
    const h = document.createElement('h3');
    h.style.cssText = 'font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 10px 0;' + style;
    h.textContent = text;
    for (const [k, v] of Object.entries(attrs)) {
      h.setAttribute(k, v);
    }
    return h;
  },

  // Crée une ligne clé-valeur
  keyValue(key, value, keyStyle = '', valueStyle = '') {
    const div = document.createElement('div');
    const keySpan = document.createElement('span');
    keySpan.style.cssText = 'color: #64748b;' + keyStyle;
    keySpan.textContent = key + ': ';
    const valueSpan = document.createElement('strong');
    valueSpan.style.cssText = 'color: #1e293b;' + valueStyle;
    valueSpan.textContent = value;
    div.appendChild(keySpan);
    div.appendChild(valueSpan);
    return div;
  },

  // Crée un tag/badge
  tag(text, bgColor, textColor) {
    const span = document.createElement('span');
    span.style.cssText = `display: inline-block; background: ${bgColor}; color: ${textColor}; padding: 4px 8px; border-radius: 4px; margin: 3px 6px 3px 0; font-size: 13px;`;
    span.textContent = text;
    return span;
  },

  // Crée un élément avec plusieurs enfants textuels
  textWithChildren(tag, parts) {
    const el = document.createElement(tag);
    parts.forEach(part => {
      if (typeof part === 'string') {
        el.appendChild(document.createTextNode(part));
      } else if (part instanceof Node) {
        el.appendChild(part);
      }
    });
    return el;
  }
};
