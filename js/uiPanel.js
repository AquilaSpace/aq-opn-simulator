/**
 * uiPanel.js — Sidebar panel management, control bindings, slider↔input sync.
 */

/**
 * Create a synchronised slider + number input pair.
 * Returns a container element with both controls.
 *
 * @param {object} opts
 * @param {string} opts.label    — label text
 * @param {string} opts.id       — base id for elements
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {number} opts.step
 * @param {number} opts.value    — initial value
 * @param {string} [opts.unit]   — unit suffix to display
 * @param {function} opts.onChange — callback(newValue)
 * @returns {HTMLElement}
 */
export function createSliderControl(opts) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = opts.label;
    label.setAttribute('for', opts.id + '-slider');
    row.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = opts.id + '-slider';
    slider.min = opts.min;
    slider.max = opts.max;
    slider.step = opts.step;
    slider.value = opts.value;
    slider.setAttribute('aria-label', opts.label);
    row.appendChild(slider);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.id = opts.id + '-input';
    numInput.min = opts.min;
    numInput.max = opts.max;
    numInput.step = opts.step;
    numInput.value = opts.value;
    row.appendChild(numInput);

    if (opts.unit) {
        const unitSpan = document.createElement('span');
        unitSpan.style.fontSize = '10px';
        unitSpan.style.color = 'var(--text-dim)';
        unitSpan.textContent = opts.unit;
        row.appendChild(unitSpan);
    }

    // Bidirectional sync
    slider.addEventListener('input', () => {
        numInput.value = slider.value;
        if (opts.onChange) opts.onChange(parseFloat(slider.value));
    });

    numInput.addEventListener('input', () => {
        slider.value = numInput.value;
        if (opts.onChange) opts.onChange(parseFloat(numInput.value));
    });

    row._setValue = (v) => {
        slider.value = v;
        numInput.value = v;
    };

    return row;
}

/**
 * Create a dropdown select control.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} opts.id
 * @param {Array<{value: string, label: string}>} opts.options
 * @param {string} opts.value — initial value
 * @param {function} opts.onChange
 * @returns {HTMLElement}
 */
export function createSelectControl(opts) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = opts.label;
    label.setAttribute('for', opts.id);
    row.appendChild(label);

    const select = document.createElement('select');
    select.id = opts.id;
    for (const opt of opts.options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === opts.value) option.selected = true;
        select.appendChild(option);
    }
    row.appendChild(select);

    select.addEventListener('change', () => {
        if (opts.onChange) opts.onChange(select.value);
    });

    row._setValue = (v) => { select.value = v; };

    return row;
}

/**
 * Create a text input control.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} opts.id
 * @param {string} opts.value
 * @param {function} opts.onChange
 * @returns {HTMLElement}
 */
export function createTextControl(opts) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = opts.label;
    label.setAttribute('for', opts.id);
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = opts.id;
    input.value = opts.value || '';
    input.style.flex = '1';
    row.appendChild(input);

    input.addEventListener('change', () => {
        if (opts.onChange) opts.onChange(input.value);
    });

    row._setValue = (v) => { input.value = v; };

    return row;
}

/**
 * Create a button.
 *
 * @param {string} text
 * @param {string} className — extra CSS classes (e.g. 'btn-danger')
 * @param {function} onClick
 * @returns {HTMLButtonElement}
 */
export function createButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (className || '');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Create a section title.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function createSectionTitle(text) {
    const el = document.createElement('div');
    el.className = 'section-title';
    el.textContent = text;
    return el;
}

/**
 * Update the network overview stats.
 * @param {object} stats
 */
export function updateNetworkStats(stats) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('stat-nodes', stats.nodeCount || 0);
    set('stat-links', stats.linkCount || 0);
    set('stat-active', stats.activeLinks || 0);
    set('stat-marginal', stats.marginalLinks || 0);
    set('stat-broken', stats.brokenLinks || 0);
    set('stat-power-gen', (stats.powerGenerated || 0).toFixed(1) + ' kW');
}
