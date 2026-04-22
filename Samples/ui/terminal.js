// Terminal UI — command input/output panel.
// Handles text display, input capture, command history, and tab completion.

import { getCompletions, applyCompletion } from './tab-completion.js';

let outputEl, inputEl;
let commandHistory = [];
let historyIndex = -1;
let onCommandCallback = null;
let stateGetter = null;

// ── Tab completion state ─────────────────────────────────────

let tabCandidates = null;
let tabIndex = -1;
let tabBase = '';

// ── Public API ──────────────────────────────────────────────

export function initTerminal(onCommand, getState) {
  outputEl = document.getElementById('terminal-output');
  inputEl = document.getElementById('terminal-input');
  onCommandCallback = onCommand;
  stateGetter = getState ?? null;

  inputEl.addEventListener('keydown', handleKeyDown);

  // Keep focus on input (unless selecting text in output or using overlay)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#overlay')) return;
    if (e.target.closest('#terminal-output')) return;
    if (!e.target.closest('#terminal-input')) {
      inputEl.focus();
    }
  });
}

export function print(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `msg-${type}`;
  line.textContent = message;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

export function printWelcome() {
  print('~ COMMAND DUNGEON ~', 'system');
  print('Type commands to control your mage.', 'system');
  print('Try: move north, move south, move east, move west', 'system');
  print('Type "help" for available commands.', 'system');
  print('', 'system');
}

export function focusInput() {
  inputEl.disabled = false;
  inputEl.focus();
}

export function disableInput() {
  inputEl.disabled = true;
  inputEl.blur();
}

function clearOutput() {
  outputEl.innerHTML = '';
}

// ── Terminal built-in intercepts ────────────────────────────
// These run before DSL dispatch and never reach executeCommand.

// Expand !! and !N before dispatch. Returns { expanded, error } where
// expanded is the resolved command string, or null if not a history ref.
// !1 = most recent, !2 = second most recent, etc.
function expandHistoryRef(text) {
  if (text === '!!') {
    if (commandHistory.length === 0) return { error: '!!' };
    return { expanded: commandHistory[0] };
  }
  const m = text.match(/^!(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    if (n < 1 || n > commandHistory.length) return { error: `!${n}` };
    return { expanded: commandHistory[n - 1] };
  }
  return { expanded: null };
}

function dispatch(text) {
  if (onCommandCallback) onCommandCallback(text);
}

// ── Tab completion ──────────────────────────────────────────

function resetTab() {
  tabCandidates = null;
  tabIndex = -1;
  tabBase = '';
}

function handleTab(reverse) {
  if (tabCandidates === null) {
    tabBase = inputEl.value;
    const state = stateGetter?.();
    tabCandidates = state ? getCompletions(tabBase, state) : [];
    tabIndex = -1;

    // With multiple candidates, show them all so the user knows what's available
    if (tabCandidates.length > 1) {
      print(tabCandidates.join('  '), 'system');
    }
  }

  if (tabCandidates.length === 0) return;

  tabIndex = reverse
    ? (tabIndex <= 0 ? tabCandidates.length - 1 : tabIndex - 1)
    : (tabIndex + 1) % tabCandidates.length;

  inputEl.value = applyCompletion(tabBase, tabCandidates[tabIndex]);
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
}

// ── Input Handling ──────────────────────────────────────────

function handleKeyDown(e) {
  if (e.key !== 'Tab') resetTab();

  if (e.key === 'Enter') {
    const text = inputEl.value.trim();
    if (text === '') return;

    inputEl.value = '';
    historyIndex = -1;

    // clear / cls — terminal built-in, no DSL dispatch
    if (text === 'clear' || text === 'cls') {
      print(`> ${text}`, 'command');
      clearOutput();
      return;
    }

    // !! and !N — expand from history before dispatch
    const { expanded, error } = expandHistoryRef(text);
    if (error != null) {
      print(`> ${text}`, 'command');
      print(`${error}: event not found`, 'error');
      return;
    }
    const resolved = expanded ?? text;

    print(`> ${resolved}`, 'command');
    commandHistory.unshift(resolved);
    if (commandHistory.length > 50) commandHistory.pop();

    dispatch(resolved);

  } else if (e.key === 'Tab') {
    e.preventDefault();
    handleTab(e.shiftKey);

  } else if (e.key === 'c' && e.ctrlKey) {
    e.preventDefault();
    if (inputEl.value !== '') {
      print(`> ${inputEl.value}^C`, 'command');
      inputEl.value = '';
      historyIndex = -1;
    }

  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    clearOutput();

  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      inputEl.value = commandHistory[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      inputEl.value = commandHistory[historyIndex];
    } else {
      historyIndex = -1;
      inputEl.value = '';
    }
  }
}
