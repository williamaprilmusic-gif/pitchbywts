(() => {
  'use strict';

  const FALLBACK_TEAMS = [
    'Liverpool Portland U14',
    'Bayhill United U14',
    'Saringa FC U14',
    'Mitchells Plain City U14',
    'Cape Lions U14',
  ];
  const FALLBACK_VENUES = ['Portland Sports Ground', 'Saringa Community Field'];
  const TIME_PRESETS = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

  let teams = [...FALLBACK_TEAMS];
  let venues = [...FALLBACK_VENUES];
  let loaded = false;

  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function textOf(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function inFixtureContext(input) {
    const root = input.closest('form, .card, .admin-panel, .dashboard-grid, .content') || document.body;
    const text = textOf(root);
    return /fixture generator|schedule a fixture|add fixture|automated competition engine|round-robin generator|reschedule|fixture programme|schedule the fixture/i.test(text);
  }

  function fieldKey(input) {
    return [input.name, input.id, input.placeholder, input.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
  }

  function isHome(input) {
    const key = fieldKey(input);
    return /home club|home team|home opponent|\bhome\b/.test(key) && !/score/.test(key);
  }

  function isAway(input) {
    const key = fieldKey(input);
    return /away club|away team|away opponent|\baway\b/.test(key) && !/score/.test(key);
  }

  function isVenue(input) {
    const key = fieldKey(input);
    return /venue/.test(key) && !/score/.test(key);
  }

  function isKickoff(input) {
    const key = fieldKey(input);
    return /kick-off|kickoff|time/.test(key) && !/date/.test(key);
  }

  function isDisciplineMember(input) {
    return /member reference|member ref|player reference|player ref/.test(fieldKey(input));
  }

  function makeSelect(className, aria, options, current, onChange) {
    const select = document.createElement('select');
    select.className = className;
    select.setAttribute('aria-label', aria);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Select ${aria.toLowerCase()}`;
    select.appendChild(placeholder);
    [...new Set(options)].filter(Boolean).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === current) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function decorateTeamInput(input) {
    if (input.dataset.pitchTeamPickerReady === '1' || !inFixtureContext(input)) return;
    if (!isHome(input) && !isAway(input)) return;

    input.dataset.pitchTeamPickerReady = '1';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.position = 'absolute';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';

    const homeInput = [...input.parentElement.querySelectorAll('input')].find(isHome) || input.closest('.admin-panel')?.querySelector('input[placeholder="Home club"]');
    const awayInput = [...input.parentElement.querySelectorAll('input')].find(isAway) || input.closest('.admin-panel')?.querySelector('input[placeholder="Away club"]');
    const home = isHome(input);
    const current = input.value || (home ? teams[0] : teams[1] || teams[0]);
    if (!input.value && current) setReactInputValue(input, current);

    const select = makeSelect('pitch-click-select pitch-team-select', home ? 'Home club' : 'Away club', teams, current, value => {
      if (!value) return;
      setReactInputValue(input, value);
      const other = home ? awayInput : homeInput;
      if (other && other.value === value) {
        const replacement = teams.find(team => team !== value);
        if (replacement) setReactInputValue(other, replacement);
      }
      refreshPickers();
    });
    input.insertAdjacentElement('afterend', select);
    select.value = current;
  }

  function decorateVenueInput(input) {
    if (input.dataset.pitchVenuePickerReady === '1' || !inFixtureContext(input) || !isVenue(input)) return;
    input.dataset.pitchVenuePickerReady = '1';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.position = 'absolute';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    const current = input.value || venues[0] || '';
    if (!input.value && current) setReactInputValue(input, current);
    const select = makeSelect('pitch-click-select', 'Venue', venues, current, value => {
      if (value) setReactInputValue(input, value);
    });
    input.insertAdjacentElement('afterend', select);
  }

  function decorateKickoff(input) {
    if (input.dataset.pitchKickoffPickerReady === '1' || !inFixtureContext(input) || !isKickoff(input)) return;
    input.dataset.pitchKickoffPickerReady = '1';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.position = 'absolute';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    const current = input.value || '15:00';
    if (!input.value) setReactInputValue(input, current);
    const select = makeSelect('pitch-click-select', 'Kick-off', TIME_PRESETS, current, value => {
      if (value) setReactInputValue(input, value);
    });
    input.insertAdjacentElement('afterend', select);
  }

  async function loadReferenceData() {
    try {
      const [teamResponse, venueResponse] = await Promise.all([
        fetch('/api/teams', { credentials: 'include' }),
        fetch('/api/venues', { credentials: 'include' }),
      ]);
      if (teamResponse.ok) {
        const data = await teamResponse.json();
        const names = Array.isArray(data) ? data.map(x => String(x?.name || '').trim()).filter(Boolean) : [];
        if (names.length) teams = [...new Set(names)];
      }
      if (venueResponse.ok) {
        const data = await venueResponse.json();
        const names = Array.isArray(data) ? data.map(x => String(x?.name || '').trim()).filter(Boolean) : [];
        if (names.length) venues = [...new Set(names)];
      }
    } catch (_) {
      // The app's existing fallback data remains usable offline/demo-first.
    } finally {
      loaded = true;
      refreshPickers();
    }
  }

  function refreshPickers() {
    document.querySelectorAll('input').forEach(input => {
      decorateTeamInput(input);
      decorateVenueInput(input);
      decorateKickoff(input);
    });

    document.querySelectorAll('.pitch-team-select').forEach(select => {
      const existing = select.value;
      const isHomeSelect = select.getAttribute('aria-label') === 'Home club';
      const allowed = teams.filter(team => {
        if (!isHomeSelect) {
          const homeSelect = [...document.querySelectorAll('.pitch-team-select')].find(s => s.getAttribute('aria-label') === 'Home club');
          return !homeSelect || team !== homeSelect.value || team === existing;
        }
        return true;
      });
      const value = existing;
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = isHomeSelect ? 'Select home club' : 'Select away club';
      select.appendChild(placeholder);
      [...new Set(allowed)].forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        option.selected = team === value;
        select.appendChild(option);
      });
    });
  }

  const observer = new MutationObserver(() => refreshPickers());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  refreshPickers();
  if (!loaded) void loadReferenceData();
})();
