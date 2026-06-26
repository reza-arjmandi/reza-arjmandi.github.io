/* global $, localStorage, document, window */

class Shell {
  constructor(term, commands) {
    this.commands = commands;
    this.term = term;
    // null = not currently navigating history; otherwise an index into history.
    this.historyIndex = null;
    this.setupListeners(term);

    localStorage.directory = 'root';
    localStorage.history = JSON.stringify([]);

    $('.input').focus();
  }

  // Read command history as an array (kept in localStorage for the `history` command).
  getHistory() {
    const raw = localStorage.history;
    return raw ? Object.values(JSON.parse(raw)) : [];
  }

  setupListeners(term) {
    $('#terminal').mouseup(() => $('.input').last().focus());

    // A single keydown handler (delegated from #terminal) drives the shell.
    // Using `evt.key` rather than the deprecated `keyCode`/`keypress`.
    term.addEventListener('keydown', (evt) => {
      const key = evt.key;

      if (key === 'Tab') {
        evt.preventDefault();
        this.autocomplete(evt.target);
        return;
      }

      if (key === 'Escape') {
        $('.terminal-window').toggleClass('fullscreen');
        return;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        evt.preventDefault();
        this.navigateHistory(key === 'ArrowUp' ? -1 : 1, evt.target);
        return;
      }

      if (key === 'Enter') {
        evt.preventDefault();
        this.historyIndex = null;
        this.handleEnter(term, evt.target);
        return;
      }

      // Any edit to the line restarts history navigation from the end.
      if (key === 'Backspace' || key === 'Delete' || this.isPrintable(evt)) {
        this.historyIndex = null;
      }
    });
  }

  isPrintable(evt) {
    return evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
  }

  handleEnter(term, prompt) {
    const input = prompt.textContent.trim().split(' ');
    const cmd = input[0].toLowerCase();
    const args = input[1];

    if (cmd === 'clear') {
      this.updateHistory(cmd);
      this.clearConsole();
    } else if (cmd && cmd in this.commands) {
      this.runCommand(cmd, args);
      this.resetPrompt(term, prompt);
      $('.root').last().html(localStorage.directory);
    } else {
      this.term.innerHTML += 'Error: command not recognized';
      this.resetPrompt(term, prompt);
    }
  }

  // Replace the current line with an entry from history.
  navigateHistory(direction, input) {
    const history = this.getHistory();
    if (history.length === 0) return;

    if (this.historyIndex === null) {
      this.historyIndex = direction < 0 ? history.length - 1 : history.length;
    } else {
      this.historyIndex += direction;
    }

    if (this.historyIndex < 0) this.historyIndex = 0;

    if (this.historyIndex >= history.length) {
      // Past the newest entry: return to an empty prompt.
      this.historyIndex = null;
      input.textContent = '';
    } else {
      input.textContent = history[this.historyIndex];
    }
    this.placeCaretAtEnd(input);
  }

  // Complete the command word (first token) when it's an unambiguous prefix.
  autocomplete(input) {
    const text = input.textContent;
    if (text.includes(' ')) return; // only the command word is completed

    const fragment = text.trim().toLowerCase();
    if (!fragment) return;

    const names = Object.keys(this.commands).concat(['clear']);
    const matches = names.filter((name) => name.startsWith(fragment));

    if (matches.length === 1) {
      input.textContent = matches[0];
      this.placeCaretAtEnd(input);
    }
  }

  placeCaretAtEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  runCommand(cmd, args) {
    const command = args ? `${cmd} ${args}` : cmd;
    this.updateHistory(command);

    const output = this.commands[cmd](args);
    if (output) {
      this.term.innerHTML += output;
    }
  }

  resetPrompt(term, prompt) {
    const newPrompt = prompt.parentNode.cloneNode(true);
    prompt.setAttribute('contenteditable', false);

    if (this.prompt) {
      newPrompt.querySelector('.prompt').textContent = this.prompt;
    }

    term.appendChild(newPrompt);
    newPrompt.querySelector('.input').innerHTML = '';
    newPrompt.querySelector('.input').focus();
  }

  updateHistory(command) {
    const history = this.getHistory();
    history.push(command);
    localStorage.history = JSON.stringify(history);
    this.historyIndex = null;
  }

  clearConsole() {
    const dir = localStorage.directory;

    $('#terminal').html(
      `<p>
          <span class="prompt">
            <span class="root">${dir}</span>
            <span class="tick">❯</span>
          </span>
          <span contenteditable="true" class="input" spellcheck="false"></span>
        </p>`,
    );

    $('.input').focus();
  }
}
