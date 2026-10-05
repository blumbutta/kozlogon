import { CHARACTERS } from './racers.js';
import { resolveWorld } from './worlds.js';

const speciesIcons = { goat: '🐐', cow: '🐄', deer: '🦌', moose: '🫎' };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const characterFor = id => CHARACTERS.find(character => character.id === id) || CHARACTERS[0];
const racerName = racer => `${racer.isBot ? '🤖 ' : ''}${racer.nickname || characterFor(racer.characterId).name}`;
const randomName = () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name;
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const countWord = (count, one, few, many) => count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;
const loadNickname = () => { try { return localStorage.getItem('kozlogon-nickname'); } catch { return null; } };
const saveNickname = name => { try { localStorage.setItem('kozlogon-nickname', name); } catch { /* Names still work when private browsing blocks storage. */ } };

/** DOM-only multiplayer screens. The game owns connections and simulation. */
export function createMultiplayerUI(callbacks = {}) {
  const parent = document.getElementById('game');
  const shell = el('section', 'multiplayer-overlay hidden');
  shell.id = 'multiplayer-panel';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-labelledby', 'multiplayer-title');
  const card = el('div', 'multiplayer-card');
  shell.append(card);
  parent.append(shell);

  const connection = el('div', 'multiplayer-connection hidden');
  connection.id = 'multiplayer-connection';
  connection.setAttribute('role', 'status');
  parent.append(connection);

  const raceBar = el('div', 'multiplayer-racebar hidden');
  const raceClock = el('span', 'multiplayer-raceclock');
  raceClock.setAttribute('role', 'timer');
  const exitRace = el('button', 'multiplayer-exit', 'Выйти');
  exitRace.type = 'button';
  exitRace.addEventListener('click', () => callbacks.leave?.());
  raceBar.append(raceClock, exitRace);
  parent.append(raceBar);

  const spectator = el('section', 'multiplayer-spectator hidden');
  spectator.id = 'multiplayer-spectator';
  spectator.setAttribute('aria-label', 'Наблюдение за участниками');
  const spectatorLabel = el('span', 'multiplayer-spectator-label', 'НАБЛЮДАЕШЬ');
  const previous = el('button', 'multiplayer-spectator-arrow', '‹');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Предыдущий участник');
  const target = el('select', 'multiplayer-spectator-select');
  target.setAttribute('aria-label', 'За кем наблюдать');
  const next = el('button', 'multiplayer-spectator-arrow', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Следующий участник');
  spectator.append(spectatorLabel, previous, target, next);
  parent.append(spectator);

  let room = null;
  let self = {};
  let currentView = '';
  let selectedTarget = null;
  let spectating = false;
  let pending = false;
  let errorNode = null;
  let timerNode = null;
  let noticeNode = null;
  let status = '';
  let nickname = loadNickname() || randomName();
  let rosterSignature = '';
  let resultsSignature = '';
  let lastRoomId = null;
  let formSubmit = null;
  let formSubmitLabel = '';

  function run(callback, payload) {
    try {
      const operation = callback?.(payload);
      if (operation?.catch) operation.catch(error => setError(error.message || 'Не удалось подключиться. Попробуй ещё раз.'));
    } catch (error) {
      setError(error.message || 'Не удалось подключиться. Попробуй ещё раз.');
    }
  }

  function title(eyebrow, heading, caption = '') {
    card.replaceChildren();
    card.append(el('div', 'eyebrow', eyebrow));
    const h = el('h2', '', heading);
    h.id = 'multiplayer-title';
    card.append(h);
    if (caption) card.append(el('p', 'multiplayer-caption', caption));
    errorNode = el('p', 'multiplayer-error');
    errorNode.setAttribute('role', 'alert');
    timerNode = null;
    noticeNode = null;
    formSubmit = null;
  }

  function button(text, className, listener) {
    const b = el('button', className, text);
    b.type = 'button';
    b.addEventListener('click', listener);
    return b;
  }

  function showJoinPrompt({ roomId, worldId = 'alps', characterId, defaultName } = {}) {
    openName({ roomId, worldId, characterId, defaultName: defaultName || randomName(), joining: true });
  }

  function openCreate(selection = callbacks.getSelection?.() || {}) {
    openName({ ...selection, joining: false });
  }

  function openName({ roomId, worldId = 'alps', characterId = CHARACTERS[0].id, defaultName, joining }) {
    currentView = 'name';
    pending = false;
    const fallbackName = defaultName || nickname || randomName();
    title(joining ? 'ДРУЗЬЯ ЖДУТ НА ВЕРШИНЕ' : 'СОБЕРИ СВОЙ ЗАЕЗД', joining ? 'Как тебя зовут?' : 'Погнали вместе?', joining ? 'Если заезд уже начался или мест нет, ты сможешь наблюдать.' : `Создадим комнату на горе «${resolveWorld(worldId).title}». Отправь друзьям её ссылку.`);
    const form = el('form', 'multiplayer-name-form');
    const label = el('label', '', 'Твоё имя');
    label.htmlFor = 'multiplayer-nickname';
    const input = el('input', 'multiplayer-name-input');
    input.id = 'multiplayer-nickname';
    input.type = 'text';
    input.name = 'nickname';
    input.autocomplete = 'nickname';
    input.maxLength = 24;
    input.value = fallbackName;
    input.placeholder = fallbackName;
    input.enterKeyHint = 'go';
    const hint = el('small', 'multiplayer-name-hint', 'Имя можно поменять в комнате.');
    const submit = el('button', 'primary', joining ? 'Войти в комнату' : 'Создать комнату');
    submit.type = 'submit';
    formSubmit = submit;
    formSubmitLabel = submit.textContent;
    form.append(label, input, hint, errorNode, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (pending) return;
      nickname = input.value.trim() || fallbackName;
      saveNickname(nickname);
      pending = true;
      submit.disabled = true;
      submit.textContent = 'Подключаемся…';
      errorNode.textContent = '';
      // The server assigns a free character on invitation entry; it can be changed in the lobby.
      run(joining ? callbacks.join : callbacks.create, joining ? { roomId, nickname } : { worldId, characterId, nickname });
    });
    form.append(button('Назад', 'secondary', () => { hide(); callbacks.cancel?.(); }));
    card.append(form);
    shell.classList.remove('hidden');
    raceBar.classList.add('hidden');
    spectator.classList.add('hidden');
    // Do not open the phone keyboard until the player taps the name.
    if (!matchMedia('(pointer: coarse)').matches) queueMicrotask(() => input.focus());
  }

  function inviteUrl() {
    if (callbacks.inviteUrl) return callbacks.inviteUrl(room);
    const url = new URL(location.href);
    url.searchParams.set('room', room.roomId);
    url.searchParams.set('mountain', room.worldId);
    url.searchParams.delete('character');
    return url.href;
  }

  async function copyInvite(copyButton, invite) {
    try {
      await navigator.clipboard.writeText(invite.value);
      copyButton.textContent = 'Ссылка скопирована ✓';
    } catch {
      invite.focus();
      invite.select();
      copyButton.textContent = 'Выделено — скопируй ссылку';
    }
  }

  function isHost() {
    return room?.hostId === self.memberId;
  }

  function humanRacers() {
    return (room?.racers || []).filter(racer => !racer.isBot);
  }

  function showLobby() {
    currentView = 'lobby';
    rosterSignature = '';
    title('КОМНАТА ДРУЗЕЙ', resolveWorld(room.worldId).title);
    const invite = el('input', 'multiplayer-invite');
    invite.type = 'text';
    invite.readOnly = true;
    invite.value = inviteUrl();
    invite.setAttribute('aria-label', 'Ссылка-приглашение');
    const copy = button('Пригласить друзей · скопировать ссылку', 'multiplayer-copy', () => copyInvite(copy, invite));
    const inviteRow = el('div', 'multiplayer-invite-row');
    inviteRow.append(invite, copy);
    card.append(inviteRow);
    timerNode = el('div', 'multiplayer-lobby-timer');
    timerNode.setAttribute('role', 'timer');
    noticeNode = el('p', 'multiplayer-lobby-notice');
    card.append(timerNode, noticeNode);

    const racer = room.racers?.find(entry => entry.id === self.playerId);
    if (racer && self.role !== 'spectator') {
      const nameRow = el('form', 'multiplayer-edit-name');
      const nameInput = el('input', 'multiplayer-name-input');
      nameInput.type = 'text';
      nameInput.value = racer.nickname || nickname;
      nameInput.maxLength = 24;
      nameInput.autocomplete = 'nickname';
      nameInput.setAttribute('aria-label', 'Твоё имя в комнате');
      const save = el('button', 'secondary', 'Сменить имя');
      save.type = 'submit';
      nameRow.append(nameInput, save);
      nameRow.addEventListener('submit', event => {
        event.preventDefault();
        nickname = nameInput.value.trim() || characterFor(racer.characterId).name;
        saveNickname(nickname);
        run(callbacks.select, { nickname, characterId: room.racers.find(entry => entry.id === self.playerId)?.characterId });
      });
      card.append(nameRow);
      card.append(el('div', 'multiplayer-section-label', 'ТВОЙ ПЕРСОНАЖ'));
      const picker = el('div', 'multiplayer-characters');
      picker.id = 'multiplayer-characters';
      picker.setAttribute('role', 'group');
      picker.setAttribute('aria-label', 'Выбор свободного персонажа');
      for (const character of CHARACTERS) {
        const select = button('', 'multiplayer-character', () => {
          callbacks.playCharacterSound?.(character);
          run(callbacks.select, { characterId: character.id, nickname });
        });
        select.dataset.characterId = character.id;
        select.title = `${character.name} · ${character.speciesName}`;
        const portrait = callbacks.getPortrait?.(character.id);
        if (portrait) {
          const image = el('img');
          image.src = portrait;
          image.alt = '';
          select.append(image);
        } else select.append(el('span', 'multiplayer-species', speciesIcons[character.species]));
        select.append(el('span', '', character.name));
        picker.append(select);
      }
      card.append(picker);
    }
    const rosterHeading = el('div', 'multiplayer-section-label');
    rosterHeading.id = 'multiplayer-roster-heading';
    const roster = el('ol', 'multiplayer-roster');
    roster.id = 'multiplayer-roster';
    card.append(rosterHeading, roster, errorNode);
    const actions = el('div', 'multiplayer-lobby-actions');
    if (isHost()) actions.append(button('Начать заезд', 'primary', () => run(callbacks.start)));
    else actions.append(el('div', 'multiplayer-wait', 'Создатель комнаты может начать в любой момент.'));
    actions.append(button('Выйти из комнаты', 'secondary', () => callbacks.leave?.()));
    card.append(actions);
    shell.classList.remove('hidden');
    spectator.classList.add('hidden');
    raceBar.classList.add('hidden');
    refreshLobby();
  }

  function refreshLobby() {
    const racers = room.racers || [];
    const humans = humanRacers();
    const connected = humans.filter(racer => room.members?.some(member => member.playerId === racer.id && member.role === 'player' && member.connected));
    const watching = room.members?.filter(member => member.role === 'spectator' && member.connected).length || 0;
    const heading = document.getElementById('multiplayer-roster-heading');
    const botCount = racers.filter(racer => racer.isBot).length;
    if (heading) heading.textContent = `${connected.length} ${countWord(connected.length, 'ИГРОК', 'ИГРОКА', 'ИГРОКОВ')} · ${botCount} ${countWord(botCount, 'БОТ', 'БОТА', 'БОТОВ')}${watching ? ` · ${watching} НАБЛЮДАЮТ` : ''}`;
    const signature = JSON.stringify([racers, room.members, self.playerId]);
    if (signature !== rosterSignature) {
      rosterSignature = signature;
      const list = document.getElementById('multiplayer-roster');
      list?.replaceChildren();
      for (const racer of racers) {
        const li = el('li', racer.id === self.playerId ? 'you' : '');
        const dot = el('span', 'racer-dot');
        dot.style.background = `#${characterFor(racer.characterId).color.toString(16).padStart(6, '0')}`;
        const member = room.members?.find(entry => entry.playerId === racer.id && entry.role === 'player');
        li.append(dot, el('span', '', racerName(racer)), el('small', '', racer.id === self.playerId ? 'ТЫ' : member && !member.connected ? 'вернётся…' : ''));
        list?.append(li);
      }
      const mine = racers.find(racer => racer.id === self.playerId);
      for (const select of card.querySelectorAll('[data-character-id]')) {
        const owned = racers.find(racer => !racer.isBot && racer.characterId === select.dataset.characterId && racer.id !== self.playerId);
        select.disabled = Boolean(owned);
        select.classList.toggle('selected', select.dataset.characterId === mine?.characterId);
        select.setAttribute('aria-pressed', String(select.dataset.characterId === mine?.characterId));
        select.setAttribute('aria-label', `${characterFor(select.dataset.characterId).name}${owned ? ' — занят' : ''}`);
      }
    }
    refreshClock();
  }

  function updateTargets() {
    const racers = room?.racers || [];
    if (!racers.length) return;
    const old = selectedTarget;
    if (!racers.some(racer => racer.id === selectedTarget)) selectedTarget = racers[0].id;
    const signature = racers.map(racer => `${racer.id}:${racerName(racer)}`).join('|');
    if (target.dataset.signature !== signature) {
      target.dataset.signature = signature;
      target.replaceChildren();
      for (const racer of racers) {
        const option = el('option', '', racerName(racer));
        option.value = String(racer.id);
        target.append(option);
      }
    }
    target.value = String(selectedTarget);
    if (old !== selectedTarget && spectating) callbacks.spectate?.(selectedTarget);
  }

  function chooseTarget(id) {
    const racer = room?.racers.find(entry => String(entry.id) === String(id));
    if (!racer) return;
    selectedTarget = racer.id;
    target.value = String(racer.id);
    callbacks.spectate?.(racer.id);
  }

  function rotateTarget(direction) {
    const racers = room?.racers || [];
    if (!racers.length) return;
    const index = racers.findIndex(racer => racer.id === selectedTarget);
    chooseTarget(racers[(Math.max(0, index) + direction + racers.length) % racers.length].id);
  }
  previous.addEventListener('click', () => rotateTarget(-1));
  next.addEventListener('click', () => rotateTarget(1));
  target.addEventListener('change', () => chooseTarget(target.value));

  function setSpectating(enabled) {
    spectating = Boolean(enabled);
    spectator.classList.toggle('hidden', !spectating || !['racing', 'countdown'].includes(room?.phase));
    if (spectating) updateTargets();
  }

  function showRace() {
    currentView = 'race';
    errorNode = null;
    shell.classList.add('hidden');
    raceBar.classList.remove('hidden');
    setSpectating(self.role === 'spectator' || Boolean(self.finished));
    refreshClock();
  }

  function showResults() {
    currentView = 'results';
    title('ЗАЕЗД ЗАВЕРШЁН', 'Вот это спуск!', 'Комната остаётся открытой. Можно выбрать другого персонажа и снова скатиться вместе.');
    const results = callbacks.getResults?.();
    const mine = results?.ranking?.find(racer => racer.id === self.playerId);
    if (mine) {
      const stats = mine.stats || {};
      const totals = el('div', 'finish-totals');
      for (const [value, label] of [[mine.kills ?? Object.values(stats.kills || {}).reduce((sum, count) => sum + Number(count || 0), 0), 'Убийств'], [stats.bombsThrown ?? stats.bombs ?? 0, 'Бомб'], [stats.trapsDropped ?? stats.traps ?? 0, 'Капканов']]) {
        const stat = el('div');
        stat.append(el('b', '', String(value)), el('span', '', label));
        totals.append(stat);
      }
      card.append(totals);
      const labels = { racers: 'Участники', racer: 'Участники', goat: 'Участники', bear: 'Медведи', hunter: 'Охотники', yeti: 'Йети', skier: 'Лыжники', squirrel: 'Белки', marmot: 'Сурки', wildlife: 'Зверьки' };
      const kills = stats.kills || stats.killBreakdown;
      if (kills && typeof kills === 'object') {
        const breakdown = el('div', 'kill-breakdown');
        for (const [kind, count] of Object.entries(kills)) {
          if (!count) continue;
          const line = el('span');
          line.append(el('span', '', callbacks.killLabel?.(kind) || labels[kind] || kind), el('b', '', String(count)));
          breakdown.append(line);
        }
        if (breakdown.childElementCount) card.append(breakdown);
      }
      card.append(el('p', 'multiplayer-personal-score', `Очки: ${mine.score || 0} · Возрождений: ${stats.deaths || 0}`));
      if (Object.keys(stats.deathReasons || {}).length) {
        const details = el('details', 'multiplayer-death-details');
        details.append(el('summary', '', 'Причины гибели'));
        for (const [reason, count] of Object.entries(stats.deathReasons)) details.append(el('p', '', `${callbacks.deathLabel?.(reason) || reason}: ${count}`));
        card.append(details);
      }
    }
    const list = el('ol', 'multiplayer-results');
    const racers = results?.ranking || room.results || room.racers || [];
    for (const [index, racer] of [...racers].sort((a, b) => (a.finishPlace || a.place || 999) - (b.finishPlace || b.place || 999)).entries()) {
      const li = el('li', racer.id === self.playerId ? 'you' : '');
      const place = racer.finishPlace || racer.place || (Number.isFinite(racer.finishTime) ? index + 1 : null);
      const time = racer.finishTime;
      li.append(el('span', 'multiplayer-result-place', place ? String(place) : '—'), el('span', 'multiplayer-result-name', racerName({ ...racer, nickname: racer.nickname || racer.name })), el('small', '', Number.isFinite(time) ? clock(Math.floor(time)) : 'Не финишировал'));
      list.append(li);
    }
    card.append(list, errorNode);
    if (isHost()) card.append(button('Вернуться в лобби', 'primary', () => run(callbacks.returnLobby)));
    else card.append(el('div', 'multiplayer-wait', 'Ждём, когда создатель вернёт всех в комнату.'));
    card.append(button('Выйти', 'secondary', () => callbacks.leave?.()));
    shell.classList.remove('hidden');
    raceBar.classList.add('hidden');
    spectator.classList.add('hidden');
    resultsSignature = JSON.stringify([room.results || room.racers, room.hostId]);
  }

  function refreshClock() {
    if (!room) return;
    if (currentView === 'lobby' && timerNode) {
      if (room.startAt) {
        timerNode.textContent = `Автостарт через ${clock(Math.max(0, Math.ceil((room.startAt - Date.now()) / 1000)))}`;
        timerNode.classList.add('counting');
        noticeNode.textContent = 'Четыре игрока собрались. Если кто-то выйдет, отсчёт начнётся заново, когда снова будет хотя бы четыре игрока.';
      } else {
        timerNode.textContent = 'Ждём друзей на вершине';
        timerNode.classList.remove('counting');
        noticeNode.textContent = 'Когда соберутся 4 игрока, начнётся отсчёт: 1 минута до старта.';
      }
    }
    if (currentView === 'race') {
      if (room.finishAt) raceClock.textContent = `До конца заезда ${clock(Math.max(0, Math.ceil((room.finishAt - Date.now()) / 1000)))}`;
      else raceClock.textContent = spectating ? 'Наблюдение за заездом' : '';
      raceClock.classList.toggle('hidden', !raceClock.textContent);
    }
  }

  function update(nextRoom, nextSelf = self) {
    const oldHost = room?.hostId;
    const oldRole = self.role;
    room = nextRoom;
    self = nextSelf;
    pending = false;
    if (!room) return hide();
    const changedRoom = room.roomId !== lastRoomId;
    lastRoomId = room.roomId;
    if (room.phase === 'lobby') {
      if (currentView !== 'lobby' || changedRoom || oldHost !== room.hostId || oldRole !== self.role) showLobby();
      else refreshLobby();
    } else if (['countdown', 'racing'].includes(room.phase)) {
      if (currentView !== 'race') showRace();
      else {
        setSpectating(self.role === 'spectator' || Boolean(self.finished));
        updateTargets();
        refreshClock();
      }
    } else if (['results', 'finished'].includes(room.phase)) {
      const signature = JSON.stringify([room.results || room.racers, room.hostId]);
      if (currentView !== 'results' || signature !== resultsSignature) showResults();
    }
  }

  function setConnection(nextStatus) {
    status = nextStatus;
    const labels = { connecting: 'Подключаемся…', reconnecting: 'Связь потеряна. Возвращаем тебя в заезд…', disconnected: 'Нет связи с сервером', connected: '' };
    connection.textContent = labels[status] ?? status ?? '';
    connection.classList.toggle('hidden', !connection.textContent);
  }

  function setError(message) {
    pending = false;
    if (formSubmit) {
      formSubmit.disabled = false;
      formSubmit.textContent = formSubmitLabel;
    }
    if (errorNode) errorNode.textContent = message;
    else {
      connection.textContent = message;
      connection.classList.remove('hidden');
    }
  }

  function hide() {
    currentView = '';
    room = null;
    lastRoomId = null;
    pending = false;
    spectating = false;
    shell.classList.add('hidden');
    spectator.classList.add('hidden');
    raceBar.classList.add('hidden');
    connection.classList.add('hidden');
  }

  const createButton = document.getElementById('multiplayer-create');
  const onCreate = () => callbacks.openOnline ? callbacks.openOnline() : openCreate();
  createButton?.addEventListener('click', onCreate);
  const interval = setInterval(refreshClock, 250);
  return {
    openCreate, showJoinPrompt, update, setConnection, setError, hide, setSpectating,
    setSpectatedPlayer(id) { selectedTarget = id; updateTargets(); },
    destroy() { clearInterval(interval); createButton?.removeEventListener('click', onCreate); shell.remove(); connection.remove(); raceBar.remove(); spectator.remove(); }
  };
}
