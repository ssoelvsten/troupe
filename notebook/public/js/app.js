import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { keymap, Decoration } from '@codemirror/view';
import { troupe } from './troupe-lang.js';
import { undo, redo } from '@codemirror/commands';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ---- Constants ----

const DEFAULT_TIMEOUT_SECONDS = 10;

// ---- Error Highlighting ----

const setErrorLines = StateEffect.define();

const errorLineField = StateField.define({
    create() { return Decoration.none; },
    update(decorations, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setErrorLines)) {
                return effect.value;
            }
        }
        return decorations.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f),
});

const errorLineDeco = Decoration.line({ class: 'cm-error-line' });

function highlightErrorLines(cell, lineNumbers) {
    if (!cell.editor) return;
    const doc = cell.editor.state.doc;
    const decorations = [];
    for (const lineNo of lineNumbers) {
        if (lineNo >= 1 && lineNo <= doc.lines) {
            const line = doc.line(lineNo);
            decorations.push(errorLineDeco.range(line.from));
        }
    }
    cell.editor.dispatch({
        effects: setErrorLines.of(Decoration.set(decorations, true)),
    });
}

function clearErrorHighlights(cell) {
    if (!cell.editor) return;
    cell.editor.dispatch({
        effects: setErrorLines.of(Decoration.none),
    });
}

function parseErrorLines(errorText, fragmentLineCount) {
    const lines = new Set();
    // Pattern: file:line:col: parse error
    const parseErrorRe = /\S+?:(\d+):(\d+):\s*parse error/g;
    // Pattern: Invalid literal ... at line:col
    const literalRe = /Invalid literal .+? at (\d+):(\d+)/g;
    // Pattern: Invalid lexeme at position line:col
    const lexemeRe = /Invalid lexeme at position (\d+):(\d+)/g;
    // Pattern: Duplicate ... at file:line:col
    const duplicateRe = /at \S+?:(\d+):(\d+)/g;

    for (const re of [parseErrorRe, literalRe, lexemeRe, duplicateRe]) {
        let match;
        while ((match = re.exec(errorText)) !== null) {
            const rawLine = parseInt(match[1], 10);
            const adjusted = rawLine - fragmentLineCount;
            if (adjusted >= 1) {
                lines.add(adjusted);
            }
        }
    }
    return [...lines];
}

// ---- Runtime Options ----

function getRuntimeOptions() {
    return {
        nmifc: document.getElementById('opt-nmifc').checked,
        labelFormat: document.getElementById('opt-label-format').value,
        timeout: Math.max(1, parseInt(document.getElementById('opt-timeout').value, 10) || DEFAULT_TIMEOUT_SECONDS),
        resultStyle: document.getElementById('opt-result-style').value,
    };
}

function setRuntimeOptions(options) {
    if (!options) return;
    if (typeof options.nmifc === 'boolean') {
        document.getElementById('opt-nmifc').checked = options.nmifc;
    }
    if (options.labelFormat) {
        document.getElementById('opt-label-format').value = options.labelFormat;
    }
    if (typeof options.timeout === 'number' && options.timeout > 0) {
        document.getElementById('opt-timeout').value = options.timeout;
    } else {
        document.getElementById('opt-timeout').value = DEFAULT_TIMEOUT_SECONDS;
    }
    if (options.resultStyle) {
        document.getElementById('opt-result-style').value = options.resultStyle;
        applyResultStyle(options.resultStyle);
    } else {
        document.getElementById('opt-result-style').value = 'plain';
        applyResultStyle('plain');
    }
}

// ---- State ----

let ws = null;
let cells = [];
let cellIdCounter = 0;
let currentNotebookPath = null; // e.g. "foo.tpnb"
let currentNotebookVersion = null; // server mtime version for conflict detection

// ---- Auto-Save & Dirty State ----

let dirty = false;
let autoSaveEnabled = false;
let autoSaveTimer = null;
let executingCount = 0; // number of cells currently executing

function markDirty() {
    if (!dirty) {
        dirty = true;
        updateSaveStatus();
    }
    scheduleAutoSave();
}

function markClean() {
    dirty = false;
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    updateSaveStatus();
}

function scheduleAutoSave() {
    if (!autoSaveEnabled || !currentNotebookPath) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        if (executingCount > 0) return; // defer until execution completes
        if (dirty) autoSave();
    }, 2000);
}

async function autoSave() {
    if (!dirty || !autoSaveEnabled || !currentNotebookPath) return;
    updateSaveStatus('saving');
    const data = getNotebookData();
    const headers = { 'Content-Type': 'application/json' };
    if (currentNotebookVersion) {
        headers['If-Match'] = currentNotebookVersion;
    }
    try {
        const res = await fetch(`/api/notebook?path=${encodeURIComponent(currentNotebookPath)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        });
        if (res.status === 409) {
            setAutoSave(false);
            updateSaveStatus('conflict');
            return;
        }
        if (res.ok) {
            const result = await res.json();
            currentNotebookVersion = result.version || null;
            markClean();
        } else {
            updateSaveStatus('error');
        }
    } catch {
        updateSaveStatus('error');
    }
}

function setAutoSave(on) {
    autoSaveEnabled = on;
    const cb = document.getElementById('opt-autosave');
    if (cb) cb.checked = on;
    if (on && dirty) scheduleAutoSave();
}

function updateSaveStatus(override) {
    const el = document.getElementById('save-status');
    if (!el) return;
    if (override === 'conflict') {
        el.innerHTML = 'Conflict — modified elsewhere. <a href="#" class="conflict-force-save">Force save</a> · <a href="#" class="conflict-reload">Reload</a>';
        el.className = 'save-status conflict';
        el.querySelector('.conflict-force-save').onclick = (e) => {
            e.preventDefault();
            saveNotebook(true);
        };
        el.querySelector('.conflict-reload').onclick = async (e) => {
            e.preventDefault();
            if (currentNotebookPath) {
                const ok = await loadNotebook(currentNotebookPath);
                if (ok) setAutoSave(true);
            }
        };
    } else if (override === 'saving') {
        el.textContent = 'Auto-saving...';
        el.className = 'save-status saving';
    } else if (override === 'error') {
        el.textContent = 'Save failed';
        el.className = 'save-status error';
    } else if (dirty) {
        el.textContent = 'Unsaved changes';
        el.className = 'save-status dirty';
    } else {
        el.textContent = 'Saved';
        el.className = 'save-status clean';
        // Fade out "Saved" after a moment
        setTimeout(() => {
            if (!dirty && el.textContent === 'Saved') {
                el.className = 'save-status clean faded';
            }
        }, 2000);
    }
}

// Warn on page close with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (dirty) {
        e.preventDefault();
    }
});

// ---- Drag and Drop State ----

let draggedCell = null;
let dropIndicator = null;

function initDropIndicator() {
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    dropIndicator.style.display = 'none';
    document.body.appendChild(dropIndicator);
}

function handleDragStart(cell, e) {
    draggedCell = cell;
    cell.el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cell.id);
}

function handleDragEnd(cell) {
    draggedCell = null;
    cell.el.classList.remove('dragging');
    if (dropIndicator) dropIndicator.style.display = 'none';
}

function findClosestCell(clientY) {
    const notebookEl = document.getElementById('notebook');
    const cellElements = [...notebookEl.children].filter(el => el.classList.contains('cell'));

    let closestCell = null;
    let insertBefore = true;
    let closestDist = Infinity;

    for (const cellEl of cellElements) {
        if (cellEl === draggedCell.el) continue;
        const rect = cellEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const dist = Math.abs(clientY - midY);
        if (dist < closestDist) {
            closestDist = dist;
            closestCell = cellEl;
            insertBefore = clientY < midY;
        }
    }

    return { closestCell, insertBefore };
}

function handleDragOver(e) {
    if (!draggedCell) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const notebookEl = document.getElementById('notebook');
    const { closestCell, insertBefore } = findClosestCell(e.clientY);

    if (closestCell && dropIndicator) {
        const rect = closestCell.getBoundingClientRect();
        const notebookRect = notebookEl.getBoundingClientRect();
        dropIndicator.style.display = 'block';
        dropIndicator.style.left = notebookRect.left + 'px';
        dropIndicator.style.width = notebookRect.width + 'px';
        dropIndicator.style.top = (insertBefore ? rect.top - 2 : rect.bottom + 2) + 'px';
    }
}

function handleDrop(e) {
    if (!draggedCell) return;
    e.preventDefault();
    if (dropIndicator) dropIndicator.style.display = 'none';

    const notebookEl = document.getElementById('notebook');
    const { closestCell, insertBefore } = findClosestCell(e.clientY);

    if (!closestCell) return;

    const targetCell = cells.find(c => c.el === closestCell);
    if (!targetCell || targetCell === draggedCell) return;

    // Update DOM
    if (insertBefore) {
        notebookEl.insertBefore(draggedCell.el, closestCell);
    } else {
        closestCell.after(draggedCell.el);
    }

    // Update cells array to match DOM order
    const oldIdx = cells.indexOf(draggedCell);
    cells.splice(oldIdx, 1);
    const newIdx = cells.indexOf(targetCell);
    if (insertBefore) {
        cells.splice(newIdx, 0, draggedCell);
    } else {
        cells.splice(newIdx + 1, 0, draggedCell);
    }

    draggedCell.el.classList.remove('dragging');
    draggedCell = null;
    markDirty();
}

// ---- WebSocket Connection ----

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => console.log('WebSocket connected');

    ws.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            console.warn('Invalid WebSocket message from server');
            return;
        }
        const cell = cells.find(c => c.id === msg.cellId);
        if (!cell) return;

        switch (msg.type) {
            case 'stdout':
                cell.outputs.push({ type: 'stdout', data: msg.data });
                appendOutput(cell, msg.data, 'stdout');
                break;
            case 'stderr':
                cell.outputs.push({ type: 'stderr', data: msg.data });
                appendOutput(cell, msg.data, 'stderr');
                break;
            case 'compile_error':
                cell.outputs.push({ type: 'compile_error', data: msg.data });
                appendOutput(cell, msg.data, 'compile-error');
                cell.el.classList.add('error');
                const errorLines = parseErrorLines(msg.data, cell.fragmentLineCount);
                if (errorLines.length > 0) {
                    highlightErrorLines(cell, errorLines);
                }
                break;
            case 'result':
                cell.outputs.push({ type: 'result', data: msg.data });
                appendOutput(cell, msg.data, 'result');
                cell.lastResult = msg.data;
                break;
            case 'done':
                cell.el.classList.remove('running');
                cell.running = false;
                const exitCode = parseInt(msg.data, 10);
                if (exitCode === 124) {
                    cell.el.classList.add('timed-out');
                } else {
                    cell.el.classList.remove('timed-out');
                }
                if (exitCode !== 0) {
                    const label = exitCode === 124
                        ? 'Exited with code 124 (timeout)'
                        : `Exited with code ${exitCode}`;
                    cell.outputs.push({ type: 'exit-code', data: label });
                    appendOutput(cell, label, 'exit-code');
                }
                executingCount = Math.max(0, executingCount - 1);
                updateCellHeader(cell);
                markDirty(); // outputs changed
                // If auto-save was deferred during execution, trigger now
                if (executingCount === 0 && autoSaveEnabled && dirty) {
                    scheduleAutoSave();
                }
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 2s...');
        // Reset any cells stuck in running state — server lost the connection
        for (const cell of cells) {
            if (cell.running) {
                cell.running = false;
                cell.el.classList.remove('running');
                executingCount = Math.max(0, executingCount - 1);
                updateCellHeader(cell);
                appendOutput(cell, 'Disconnected — execution interrupted\n', 'stderr');
                cell.outputs.push({ type: 'stderr', data: 'Disconnected — execution interrupted\n' });
            }
        }
        if (executingCount === 0 && autoSaveEnabled && dirty) {
            scheduleAutoSave();
        }
        setTimeout(connectWS, 2000);
    };
}

connectWS();

// ---- Cell Model ----

function generateId() {
    return 'cell-' + (++cellIdCounter) + '-' + Math.random().toString(36).slice(2, 8);
}

function createCell(type = 'code', source = '', opts = {}) {
    const cell = {
        id: opts.id || generateId(),
        type,
        source,
        editor: null,
        el: null,
        outputEl: null,
        running: false,
        lastResult: null,
        outputs: [],             // full output history for persistence
        fragment: false,         // fragment mode toggle
        fragmentName: '',        // optional label for fragment cells
        includedFragments: null, // null = auto (all preceding), or array of cell IDs
        fragmentLineCount: 0,    // line count of fragment source prepended to last execution
        cellTimeout: 0,          // per-cell timeout in seconds (0 = use global default)
    };
    if (opts.insertAtIndex != null && opts.insertAtIndex < cells.length) {
        cells.splice(opts.insertAtIndex, 0, cell);
    } else {
        cells.push(cell);
    }
    renderCell(cell, opts.insertAtIndex);

    // Restore saved outputs if provided
    if (opts.outputs && opts.outputs.length > 0) {
        for (const out of opts.outputs) {
            cell.outputs.push(out);
            const cssClass = out.type === 'compile_error' ? 'compile-error' : out.type;
            appendOutput(cell, out.data, cssClass);
        }
    }

    return cell;
}

// ---- Fragment Picker Helpers ----

function getPrecedingFragments(cell) {
    const idx = cells.indexOf(cell);
    return cells.slice(0, idx).filter(c => c.type === 'code' && c.fragment);
}

function getFragmentDisplayName(fragmentCell, index) {
    return fragmentCell.fragmentName || `Fragment ${index + 1}`;
}

function updatePickerLabel(cell, labelEl) {
    const preceding = getPrecedingFragments(cell);
    if (preceding.length === 0) {
        labelEl.textContent = 'No fragments';
        return;
    }
    if (cell.includedFragments === null) {
        labelEl.textContent = `Includes: all fragments (${preceding.length})`;
    } else {
        const count = cell.includedFragments.filter(id =>
            preceding.some(c => c.id === id)).length;
        labelEl.textContent = `Includes: ${count} of ${preceding.length}`;
    }
}

function rebuildFragmentPicker(cell, dropdown, labelEl) {
    dropdown.innerHTML = '';
    const preceding = getPrecedingFragments(cell);

    if (preceding.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fragment-picker-empty';
        empty.textContent = 'No fragment cells above this cell.';
        dropdown.appendChild(empty);
        return;
    }

    preceding.forEach((pc, i) => {
        const row = document.createElement('label');
        row.className = 'fragment-picker-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        if (cell.includedFragments === null) {
            cb.checked = true;
        } else {
            cb.checked = cell.includedFragments.includes(pc.id);
        }
        cb.onchange = () => {
            // Switch from auto to explicit mode on first uncheck
            if (cell.includedFragments === null) {
                cell.includedFragments = preceding.map(c => c.id);
            }
            if (cb.checked) {
                if (!cell.includedFragments.includes(pc.id)) {
                    cell.includedFragments.push(pc.id);
                }
            } else {
                cell.includedFragments = cell.includedFragments.filter(id => id !== pc.id);
            }
            // If all are selected, revert to auto mode
            const allSelected = preceding.every(c => cell.includedFragments.includes(c.id));
            if (allSelected) {
                cell.includedFragments = null;
            }
            updatePickerLabel(cell, labelEl);
            markDirty();
        };
        row.appendChild(cb);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = getFragmentDisplayName(pc, i);
        row.appendChild(nameSpan);
        dropdown.appendChild(row);
    });

    // Select all / Select none links
    const links = document.createElement('div');
    links.className = 'fragment-picker-links';
    const selectAll = document.createElement('a');
    selectAll.textContent = 'Select all';
    selectAll.href = '#';
    selectAll.onclick = (e) => {
        e.preventDefault();
        cell.includedFragments = null;
        rebuildFragmentPicker(cell, dropdown, labelEl);
        updatePickerLabel(cell, labelEl);
    };
    const selectNone = document.createElement('a');
    selectNone.textContent = 'Select none';
    selectNone.href = '#';
    selectNone.onclick = (e) => {
        e.preventDefault();
        cell.includedFragments = [];
        rebuildFragmentPicker(cell, dropdown, labelEl);
        updatePickerLabel(cell, labelEl);
    };
    links.appendChild(selectAll);
    links.appendChild(document.createTextNode(' | '));
    links.appendChild(selectNone);
    dropdown.appendChild(links);

    updatePickerLabel(cell, labelEl);
}

// ---- Cell Rendering ----

const notebook = document.getElementById('notebook');

function renderCodeCellHeaderControls(cell, header) {
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'cell-mode-toggle';

    const runnableOpt = document.createElement('span');
    runnableOpt.className = 'toggle-option' + (cell.fragment ? '' : ' active');
    runnableOpt.textContent = 'runnable';

    const fragmentOpt = document.createElement('span');
    fragmentOpt.className = 'toggle-option' + (cell.fragment ? ' active' : '');
    fragmentOpt.textContent = 'fragment';

    function setFragmentMode(isFragment) {
        cell.fragment = isFragment;
        runnableOpt.classList.toggle('active', !isFragment);
        fragmentOpt.classList.toggle('active', isFragment);
        const runBtn = cell.el.querySelector('.run-btn');
        const clearBtn = cell.el.querySelector('.clear-btn');
        if (runBtn) runBtn.style.display = isFragment ? 'none' : '';
        if (clearBtn) clearBtn.style.display = isFragment ? 'none' : '';
        const nameInput = cell.el.querySelector('.fragment-name');
        const pickerWrap = cell.el.querySelector('.fragment-picker-wrap');
        const timeoutWrap = cell.el.querySelector('.cell-timeout-wrap');
        if (nameInput) nameInput.style.display = isFragment ? '' : 'none';
        if (pickerWrap) pickerWrap.style.display = isFragment ? 'none' : '';
        if (timeoutWrap) timeoutWrap.style.display = isFragment ? 'none' : '';
    }

    runnableOpt.onclick = () => { setFragmentMode(false); markDirty(); };
    fragmentOpt.onclick = () => { setFragmentMode(true); markDirty(); };

    toggleWrap.appendChild(runnableOpt);
    toggleWrap.appendChild(fragmentOpt);
    toggleWrap.title = 'Fragment cells provide definitions to subsequent cells (not independently runnable)';
    header.appendChild(toggleWrap);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'fragment-name';
    nameInput.placeholder = 'unnamed';
    nameInput.value = cell.fragmentName;
    nameInput.style.display = cell.fragment ? '' : 'none';
    nameInput.oninput = () => { cell.fragmentName = nameInput.value; markDirty(); };
    header.appendChild(nameInput);

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'fragment-picker-wrap';
    pickerWrap.style.display = cell.fragment ? 'none' : '';

    const pickerLabel = document.createElement('span');
    pickerLabel.className = 'fragment-picker-label';
    pickerLabel.textContent = 'Includes: all fragments';
    pickerWrap.appendChild(pickerLabel);

    const pickerDropdown = document.createElement('div');
    pickerDropdown.className = 'fragment-picker-dropdown';
    pickerDropdown.style.display = 'none';
    pickerWrap.appendChild(pickerDropdown);

    pickerLabel.onclick = () => {
        const isOpen = pickerDropdown.style.display !== 'none';
        if (!isOpen) {
            rebuildFragmentPicker(cell, pickerDropdown, pickerLabel);
        }
        pickerDropdown.style.display = isOpen ? 'none' : '';
    };

    header.appendChild(pickerWrap);

    const cellTimeoutWrap = document.createElement('span');
    cellTimeoutWrap.className = 'cell-timeout-wrap';
    cellTimeoutWrap.title = 'Per-cell timeout override (empty = use global)';
    cellTimeoutWrap.style.display = cell.fragment ? 'none' : '';
    const cellTimeoutLabel = document.createElement('span');
    cellTimeoutLabel.className = 'cell-timeout-label';
    cellTimeoutLabel.textContent = 'T/O:';
    cellTimeoutWrap.appendChild(cellTimeoutLabel);
    const cellTimeoutInput = document.createElement('input');
    cellTimeoutInput.type = 'number';
    cellTimeoutInput.className = 'cell-timeout-input';
    cellTimeoutInput.min = '1';
    cellTimeoutInput.step = '1';
    cellTimeoutInput.value = cell.cellTimeout > 0 ? cell.cellTimeout : '';
    cellTimeoutInput.placeholder = '';
    cellTimeoutInput.oninput = () => {
        const v = parseInt(cellTimeoutInput.value, 10);
        cell.cellTimeout = v > 0 ? v : 0;
        markDirty();
    };
    cellTimeoutWrap.appendChild(cellTimeoutInput);
    const cellTimeoutUnit = document.createElement('span');
    cellTimeoutUnit.textContent = 's';
    cellTimeoutWrap.appendChild(cellTimeoutUnit);
    header.appendChild(cellTimeoutWrap);
}

function renderCodeCellActions(cell, actions) {
    const runBtn = document.createElement('button');
    runBtn.className = 'run-btn';
    runBtn.textContent = 'Run';
    runBtn.onclick = () => executeCell(cell);
    actions.appendChild(runBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear output';
    clearBtn.onclick = () => {
        clearOutput(cell);
        clearErrorHighlights(cell);
        cell.outputs = [];
        cell.lastResult = null;
        cell.el.classList.remove('error');
    };
    actions.appendChild(clearBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy source to clipboard';
    copyBtn.onclick = () => {
        const source = cell.editor ? cell.editor.state.doc.toString() : cell.source;
        navigator.clipboard.writeText(source).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {});
    };
    actions.appendChild(copyBtn);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.title = 'Undo edit';
    undoBtn.onclick = () => { if (cell.editor) undo(cell.editor); };
    actions.appendChild(undoBtn);

    const redoBtn = document.createElement('button');
    redoBtn.className = 'redo-btn';
    redoBtn.textContent = 'Redo';
    redoBtn.title = 'Redo edit';
    redoBtn.onclick = () => { if (cell.editor) redo(cell.editor); };
    actions.appendChild(redoBtn);

    const dupBtn = document.createElement('button');
    dupBtn.className = 'dup-btn';
    dupBtn.textContent = 'Dup';
    dupBtn.title = 'Duplicate cell';
    dupBtn.onclick = () => duplicateCell(cell);
    actions.appendChild(dupBtn);

    if (cell.fragment) {
        runBtn.style.display = 'none';
        clearBtn.style.display = 'none';
    }
}

function renderCodeCellBody(cell, el) {
    const editorDiv = document.createElement('div');
    editorDiv.className = 'cell-editor';
    el.appendChild(editorDiv);

    const editorState = EditorState.create({
        doc: cell.source,
        extensions: [
            basicSetup,
            troupe(),
            errorLineField,
            keymap.of([
                {
                    key: 'Shift-Enter',
                    run: () => { executeCell(cell); return true; },
                },
            ]),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    cell.source = update.state.doc.toString();
                    markDirty();
                }
            }),
        ],
    });

    cell.editor = new EditorView({
        state: editorState,
        parent: editorDiv,
    });

    const outputWrap = document.createElement('div');
    outputWrap.className = 'cell-output-wrap';

    const outputEl = document.createElement('div');
    outputEl.className = 'cell-output';
    outputWrap.appendChild(outputEl);

    const copyOutBtn = document.createElement('button');
    copyOutBtn.className = 'copy-output-btn';
    copyOutBtn.textContent = 'Copy';
    copyOutBtn.title = 'Copy output to clipboard';
    copyOutBtn.onclick = () => {
        const text = cell.outputEl ? cell.outputEl.innerText : '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            copyOutBtn.textContent = 'Copied!';
            setTimeout(() => { copyOutBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {});
    };
    outputWrap.appendChild(copyOutBtn);

    el.appendChild(outputWrap);
    cell.outputEl = outputEl;

    if (cell.fragment) {
        copyOutBtn.style.display = 'none';
    }
}

function renderMarkdownCellBody(cell, el, actions) {
    const renderedDiv = document.createElement('div');
    renderedDiv.className = 'cell-rendered';
    renderedDiv.innerHTML = DOMPurify.sanitize(marked.parse(cell.source || '*Click to edit*'));
    el.appendChild(renderedDiv);

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Edit markdown (or double-click)';
    actions.appendChild(editBtn);

    const doneBtn = document.createElement('button');
    doneBtn.className = 'done-btn';
    doneBtn.textContent = 'Done';
    doneBtn.title = 'Finish editing (Escape or Shift+Enter)';
    doneBtn.style.display = 'none';
    actions.appendChild(doneBtn);

    function startEditing() {
        if (cell.editor) return;
        renderedDiv.style.display = 'none';
        editBtn.style.display = 'none';
        doneBtn.style.display = '';
        const editorDiv = document.createElement('div');
        editorDiv.className = 'cell-editor';
        el.insertBefore(editorDiv, renderedDiv);

        function finishEditing() {
            cell.source = cell.editor.state.doc.toString();
            renderedDiv.innerHTML = DOMPurify.sanitize(marked.parse(cell.source || '*Click to edit*'));
            renderedDiv.style.display = '';
            editBtn.style.display = '';
            doneBtn.style.display = 'none';
            cell.editor.destroy();
            cell.editor = null;
            editorDiv.remove();
            updateTitle();
        }

        doneBtn.onclick = finishEditing;

        const editorState = EditorState.create({
            doc: cell.source,
            extensions: [
                basicSetup,
                EditorView.lineWrapping,
                keymap.of([
                    {
                        key: 'Escape',
                        run: () => { finishEditing(); return true; },
                    },
                    {
                        key: 'Shift-Enter',
                        run: () => { finishEditing(); return true; },
                    },
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        cell.source = update.state.doc.toString();
                        markDirty();
                    }
                }),
            ],
        });

        cell.editor = new EditorView({
            state: editorState,
            parent: editorDiv,
        });
        cell.editor.focus();
    }

    editBtn.onclick = startEditing;
    renderedDiv.addEventListener('dblclick', startEditing);
}

function renderCell(cell, insertAtIndex) {
    const el = document.createElement('div');
    el.className = `cell ${cell.type}-cell`;
    el.dataset.cellId = cell.id;
    el.draggable = false; // only drag via handle

    // Header
    const header = document.createElement('div');
    header.className = 'cell-header';

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '\u2847'; // braille dots for grip icon
    dragHandle.title = 'Drag to reorder';
    dragHandle.draggable = true;
    dragHandle.addEventListener('dragstart', (e) => {
        // Transfer drag to the cell element
        e.stopPropagation();
        el.classList.add('dragging');
        handleDragStart(cell, e);
    });
    dragHandle.addEventListener('dragend', () => {
        handleDragEnd(cell);
    });
    header.appendChild(dragHandle);

    if (cell.type === 'code') {
        renderCodeCellHeaderControls(cell, header);
    } else {
        const typeLabel = document.createElement('span');
        typeLabel.className = 'cell-type';
        typeLabel.textContent = 'MD';
        header.appendChild(typeLabel);
    }

    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    if (cell.type === 'code') {
        renderCodeCellActions(cell, actions);
    }

    const upBtn = document.createElement('button');
    upBtn.className = 'move-btn';
    upBtn.textContent = '\u2191';
    upBtn.onclick = () => moveCell(cell, -1);
    actions.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'move-btn';
    downBtn.textContent = '\u2193';
    downBtn.onclick = () => moveCell(cell, 1);
    actions.appendChild(downBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '\u00d7';
    delBtn.onclick = () => deleteCell(cell);
    actions.appendChild(delBtn);

    header.appendChild(actions);
    el.appendChild(header);

    if (cell.type === 'code') {
        renderCodeCellBody(cell, el);
    } else {
        renderMarkdownCellBody(cell, el, actions);
    }

    cell.el = el;
    if (insertAtIndex != null && insertAtIndex < notebook.children.length) {
        notebook.insertBefore(el, notebook.children[insertAtIndex]);
    } else {
        notebook.appendChild(el);
    }
}

function updateCellHeader(cell) {
    const runBtn = cell.el.querySelector('.run-btn');
    if (runBtn) {
        runBtn.textContent = cell.running ? 'Stop' : 'Run';
        if (cell.running) {
            runBtn.onclick = () => interruptCell(cell);
        } else {
            runBtn.onclick = () => executeCell(cell);
        }
    }
}

function appendOutput(cell, text, className) {
    if (!cell.outputEl) return;
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    cell.outputEl.appendChild(span);
    cell.outputEl.scrollTop = cell.outputEl.scrollHeight;
}

function clearOutput(cell) {
    if (cell.outputEl) {
        cell.outputEl.innerHTML = '';
    }
}

// ---- Cell Operations ----

function assembleFragment(cell) {
    // Fragment cells are definition-only; they don't run
    if (cell.fragment) return '';
    const preceding = getPrecedingFragments(cell);
    let selected;
    if (cell.includedFragments === null) {
        // Auto mode: all preceding fragments
        selected = preceding;
    } else {
        // Scoped mode: only selected fragments, in notebook order
        selected = preceding.filter(c => cell.includedFragments.includes(c.id));
    }
    if (selected.length === 0) return '';
    return selected.map(c => c.source).join('\n') + '\n';
}

function executeCell(cell) {
    if (cell.type !== 'code' || cell.running) return;

    clearOutput(cell);
    clearErrorHighlights(cell);
    cell.el.classList.remove('error');
    cell.el.classList.remove('timed-out');
    cell.el.classList.add('running');
    cell.running = true;
    executingCount++;
    cell.lastResult = null;
    cell.outputs = []; // clear saved outputs for this execution
    updateCellHeader(cell);

    const source = cell.editor ? cell.editor.state.doc.toString() : cell.source;
    cell.source = source;

    const fragmentSource = assembleFragment(cell);
    cell.fragmentLineCount = fragmentSource ? (fragmentSource.match(/\n/g) || []).length : 0;

    const options = getRuntimeOptions();
    // Per-cell timeout overrides global
    if (cell.cellTimeout > 0) {
        options.timeout = cell.cellTimeout;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        cell.running = false;
        cell.el.classList.remove('running');
        executingCount = Math.max(0, executingCount - 1);
        updateCellHeader(cell);
        appendOutput(cell, 'Not connected to server\n', 'stderr');
        cell.outputs.push({ type: 'stderr', data: 'Not connected to server\n' });
        return;
    }
    ws.send(JSON.stringify({
        type: 'execute',
        cellId: cell.id,
        source: source,
        preamble: fragmentSource,
        options: options,
    }));
}

function interruptCell(cell) {
    if (!cell.running) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'interrupt',
        cellId: cell.id,
    }));
}

function duplicateCell(cell) {
    const source = cell.editor ? cell.editor.state.doc.toString() : cell.source;
    const newCell = createCell(cell.type, source);
    // Move the new cell to right after the original
    const idx = cells.indexOf(cell);
    const newIdx = cells.indexOf(newCell);
    cells.splice(newIdx, 1);
    cells.splice(idx + 1, 0, newCell);
    // Reposition in DOM: insert after the original cell's element
    cell.el.after(newCell.el);
    // Copy fragment settings
    if (cell.type === 'code' && cell.fragment) {
        newCell.fragmentName = cell.fragmentName ? cell.fragmentName + ' (copy)' : 'copy';
        activateFragmentMode(newCell);
    }
    // Copy per-cell timeout
    if (cell.cellTimeout > 0) {
        newCell.cellTimeout = cell.cellTimeout;
        const input = newCell.el?.querySelector('.cell-timeout-input');
        if (input) input.value = cell.cellTimeout;
    }
}

function deleteCell(cell) {
    const idx = cells.indexOf(cell);
    if (idx === -1) return;
    if (cell.running) {
        interruptCell(cell);
        cell.running = false;
        executingCount = Math.max(0, executingCount - 1);
        if (executingCount === 0 && autoSaveEnabled && dirty) {
            scheduleAutoSave();
        }
    }
    if (cell.editor) cell.editor.destroy();
    cell.el.remove();
    const deletedId = cell.id;
    cells.splice(idx, 1);
    // Clean stale fragment references from other cells
    for (const c of cells) {
        if (c.includedFragments) {
            c.includedFragments = c.includedFragments.filter(id => id !== deletedId);
        }
    }
    markDirty();
}

function moveCell(cell, direction) {
    const idx = cells.indexOf(cell);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= cells.length) return;

    [cells[idx], cells[newIdx]] = [cells[newIdx], cells[idx]];

    const parent = notebook;
    const children = [...parent.children];
    if (direction === -1) {
        parent.insertBefore(children[idx], children[newIdx]);
    } else {
        parent.insertBefore(children[newIdx], children[idx]);
    }
    markDirty();
}

// ---- Toolbar ----

document.getElementById('btn-add-code').onclick = () => {
    createCell('code', 'let val x = 42\nin x\nend');
    markDirty();
};

document.getElementById('btn-add-markdown').onclick = () => {
    createCell('markdown', '## New Section\n\nWrite your notes here.');
    markDirty();
};

document.getElementById('btn-run-all').onclick = () => {
    for (const cell of cells) {
        if (cell.type === 'code' && !cell.running && !cell.fragment) {
            executeCell(cell);
        }
    }
};

document.getElementById('btn-save').onclick = saveNotebook;

document.getElementById('btn-save-as').onclick = saveNotebookAs;

document.getElementById('btn-export').onclick = exportNotebook;

document.getElementById('btn-import').onclick = () => {
    document.getElementById('import-file-input').click();
};

document.getElementById('import-file-input').onchange = importNotebook;

// Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNotebook();
    }
});

// Initialize global timeout input from constant
document.getElementById('opt-timeout').value = DEFAULT_TIMEOUT_SECONDS;

// Runtime options change -> markDirty
document.getElementById('opt-nmifc').addEventListener('change', markDirty);
document.getElementById('opt-label-format').addEventListener('change', markDirty);
document.getElementById('opt-timeout').addEventListener('change', markDirty);

// Auto-save checkbox
document.getElementById('opt-autosave').addEventListener('change', (e) => {
    setAutoSave(e.target.checked);
});

// Settings panel toggle
document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.toggle('open');
});

// Result style dropdown
const resultStyleSelect = document.getElementById('opt-result-style');
function applyResultStyle(style) {
    document.getElementById('notebook').setAttribute('data-result-style', style || 'plain');
}
resultStyleSelect.addEventListener('change', () => {
    applyResultStyle(resultStyleSelect.value);
    markDirty();
});
applyResultStyle('plain');

// Drag-and-drop: global listeners on the notebook container
const notebookContainer = document.getElementById('notebook');
notebookContainer.addEventListener('dragover', handleDragOver);
notebookContainer.addEventListener('drop', handleDrop);

// ---- Press-and-Hold Insert Cell ----

let insertPopup = null;
let insertHoldTimer = null;
let insertMouseStart = null;

function getInsertIndex(clientY) {
    const cellElements = [...notebook.children].filter(el => el.classList.contains('cell'));
    if (cellElements.length === 0) return 0;

    for (let i = 0; i < cellElements.length; i++) {
        const rect = cellElements[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
    }
    return cellElements.length;
}

function showInsertPopup(clientX, clientY) {
    dismissInsertPopup();

    const idx = getInsertIndex(clientY);
    const popup = document.createElement('div');
    popup.className = 'insert-popup';

    const codeBtn = document.createElement('button');
    codeBtn.textContent = '+ Code';
    codeBtn.onclick = () => {
        dismissInsertPopup();
        createCell('code', '', { insertAtIndex: idx });
        markDirty();
    };

    const mdBtn = document.createElement('button');
    mdBtn.textContent = '+ Markdown';
    mdBtn.onclick = () => {
        dismissInsertPopup();
        createCell('markdown', '', { insertAtIndex: idx });
        markDirty();
    };

    popup.appendChild(codeBtn);
    popup.appendChild(mdBtn);
    document.body.appendChild(popup);

    // Position: centered at click, clamped to viewport
    const popupW = 200; // approximate
    const popupH = 40;
    let left = clientX - popupW / 2;
    let top = clientY - popupH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - popupH - 8));
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    insertPopup = popup;
}

function dismissInsertPopup() {
    if (insertPopup) {
        insertPopup.remove();
        insertPopup = null;
    }
}

function cancelInsertHold() {
    if (insertHoldTimer) {
        clearTimeout(insertHoldTimer);
        insertHoldTimer = null;
    }
    insertMouseStart = null;
}

notebookContainer.addEventListener('mousedown', (e) => {
    // Only trigger on the notebook container itself (the gap between cells), not on cells
    if (e.target !== notebookContainer) return;
    if (e.button !== 0) return; // left button only

    insertMouseStart = { x: e.clientX, y: e.clientY };
    insertHoldTimer = setTimeout(() => {
        insertHoldTimer = null;
        showInsertPopup(insertMouseStart.x, insertMouseStart.y);
    }, 300);
});

notebookContainer.addEventListener('mouseup', cancelInsertHold);
notebookContainer.addEventListener('mouseleave', cancelInsertHold);
notebookContainer.addEventListener('mousemove', (e) => {
    if (!insertMouseStart) return;
    const dx = e.clientX - insertMouseStart.x;
    const dy = e.clientY - insertMouseStart.y;
    if (dx * dx + dy * dy > 25) { // 5px threshold
        cancelInsertHold();
    }
});

// Dismiss insert popup on outside click or Escape
document.addEventListener('mousedown', (e) => {
    if (insertPopup && !insertPopup.contains(e.target)) {
        dismissInsertPopup();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && insertPopup) {
        dismissInsertPopup();
    }
});

// Close fragment picker dropdowns on outside click
document.addEventListener('click', (e) => {
    document.querySelectorAll('.fragment-picker-dropdown').forEach(dd => {
        if (dd.style.display !== 'none' && !dd.parentElement.contains(e.target)) {
            dd.style.display = 'none';
        }
    });
});

// ---- Save/Load ----

function getNotebookData() {
    return {
        troupe_notebook: 1,
        options: getRuntimeOptions(),
        cells: cells.map(c => {
            const cellData = {
                id: c.id,
                type: c.type,
                source: c.source,
            };
            if (c.type === 'code') {
                if (c.outputs.length > 0) {
                    cellData.outputs = c.outputs;
                }
                if (c.fragment) {
                    cellData.fragment = true;
                    if (c.fragmentName) {
                        cellData.fragmentName = c.fragmentName;
                    }
                }
                if (c.includedFragments !== null) {
                    cellData.includedFragments = c.includedFragments;
                }
                if (c.cellTimeout > 0) {
                    cellData.cellTimeout = c.cellTimeout;
                }
            }
            return cellData;
        }),
    };
}

async function saveNotebook(force) {
    if (!currentNotebookPath) {
        return saveNotebookAs();
    }
    // Cancel any pending auto-save
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    const data = getNotebookData();
    const headers = { 'Content-Type': 'application/json' };
    // Send version for conflict detection (skip if force-saving)
    if (!force && currentNotebookVersion) {
        headers['If-Match'] = currentNotebookVersion;
    }
    try {
        const res = await fetch(`/api/notebook?path=${encodeURIComponent(currentNotebookPath)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        });
        if (res.status === 409) {
            // Conflict: notebook was modified by another session
            setAutoSave(false);
            updateSaveStatus('conflict');
            showStatus('Conflict: notebook was modified by another session', true);
            return;
        }
        if (!res.ok) {
            const err = await res.json();
            showStatus(`Save failed: ${err.error}`, true);
            updateSaveStatus('error');
        } else {
            const result = await res.json();
            currentNotebookVersion = result.version || null;
            markClean();
            showStatus('Saved');
        }
    } catch (err) {
        showStatus(`Save failed: ${err.message}`, true);
        updateSaveStatus('error');
    }
}

async function saveNotebookAs() {
    const name = prompt('Save notebook as:', currentNotebookPath || 'notebook.tpnb');
    if (!name) return;
    if (!name.endsWith('.tpnb')) {
        showStatus('Filename must end with .tpnb', true);
        return;
    }
    currentNotebookPath = name;
    currentNotebookVersion = null; // new file, no conflict detection needed
    updateTitle();
    await saveNotebook();
}

function exportNotebook() {
    const data = getNotebookData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentNotebookPath || 'notebook.tpnb';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Exported');
}

function importNotebook(event) {
    const file = event.target.files[0];
    if (!file) return;
    // Reset input so the same file can be re-imported
    event.target.value = '';

    const reader = new FileReader();
    reader.onerror = () => {
        showStatus('Failed to read file', true);
    };
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.troupe_notebook || !Array.isArray(data.cells)) {
                showStatus('Invalid notebook file', true);
                return;
            }
            // Validate all cells before clearing
            for (const cellData of data.cells) {
                if (!cellData.type || typeof cellData.source !== 'string') {
                    showStatus('Invalid cell data in notebook file', true);
                    return;
                }
            }
            clearAllCells();
            currentNotebookPath = null;
            currentNotebookVersion = null;
            setRuntimeOptions(data.options);

            // Update URL: remove notebook param
            const url = new URL(window.location);
            url.searchParams.delete('notebook');
            history.replaceState(null, '', url.toString());

            for (const cellData of data.cells) {
                createCell(cellData.type, cellData.source, {
                    id: cellData.id,
                    outputs: cellData.outputs || [],
                });
                const cell = cells[cells.length - 1];
                if (cellData.fragment || cellData.preamble) {
                    cell.fragmentName = cellData.fragmentName || cellData.preambleName || '';
                    activateFragmentMode(cell);
                }
                if (cellData.includedFragments || cellData.includedPreambles) {
                    cell.includedFragments = cellData.includedFragments || cellData.includedPreambles;
                }
                if (cellData.cellTimeout > 0) {
                    cell.cellTimeout = cellData.cellTimeout;
                }
            }
            updateTitle();
            setAutoSave(false);
            markClean(); // fresh import starts clean
            showStatus(`Imported: ${file.name}`);
        } catch (err) {
            showStatus(`Import failed: ${err.message}`, true);
        }
    };
    reader.readAsText(file);
}

function showStatus(message, isError = false) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className = 'status ' + (isError ? 'status-error' : 'status-ok');
    el.style.display = 'inline';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function updateTitle() {
    const titleEl = document.getElementById('notebook-title');
    const fileEl = document.getElementById('notebook-file');

    // Extract title from first markdown cell's first # heading
    const mdCell = cells.find(c => c.type === 'markdown');
    const headingMatch = mdCell && mdCell.source.match(/^#\s+(.+)$/m);
    const title = headingMatch ? headingMatch[1].trim() : 'Troupe Notebook';

    titleEl.textContent = title;
    fileEl.textContent = currentNotebookPath || 'unsaved';
}

async function loadNotebook(path) {
    try {
        const res = await fetch(`/api/notebook?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            if (res.status === 404) {
                showStatus(`Notebook not found: ${path}`, true);
                return false;
            }
            const err = await res.json();
            showStatus(`Load failed: ${err.error}`, true);
            return false;
        }
        const data = await res.json();
        clearAllCells();
        currentNotebookPath = path;
        currentNotebookVersion = data._version || null;
        setRuntimeOptions(data.options);

        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('notebook', path);
        history.replaceState(null, '', url.toString());

        for (const cellData of data.cells) {
            createCell(cellData.type, cellData.source, {
                id: cellData.id,
                outputs: cellData.outputs || [],
            });
            const cell = cells[cells.length - 1];
            // Restore fragment flag and name (backward compat: also read old 'preamble' field)
            if (cellData.fragment || cellData.preamble) {
                cell.fragmentName = cellData.fragmentName || cellData.preambleName || '';
                activateFragmentMode(cell);
            }
            // Restore scoped fragment selection (backward compat: also read old 'includedPreambles')
            if (cellData.includedFragments || cellData.includedPreambles) {
                cell.includedFragments = cellData.includedFragments || cellData.includedPreambles;
            }
            if (cellData.cellTimeout > 0) {
                cell.cellTimeout = cellData.cellTimeout;
            }
            // Restore per-cell timeout input display
            const cellTimeoutInput = cell.el?.querySelector('.cell-timeout-input');
            if (cellTimeoutInput) cellTimeoutInput.value = cell.cellTimeout > 0 ? cell.cellTimeout : '';
        }
        updateTitle();
        markClean();
        return true;
    } catch (err) {
        showStatus(`Load failed: ${err.message}`, true);
        return false;
    }
}

function activateFragmentMode(cell) {
    cell.fragment = true;
    // Update segmented toggle
    const toggleOpts = cell.el.querySelectorAll('.cell-mode-toggle .toggle-option');
    if (toggleOpts.length === 2) {
        toggleOpts[0].classList.remove('active'); // Runnable
        toggleOpts[1].classList.add('active');    // Fragment
    }
    const nameInput = cell.el.querySelector('.fragment-name');
    if (nameInput) {
        nameInput.value = cell.fragmentName;
        nameInput.style.display = '';
    }
    const runBtn = cell.el.querySelector('.run-btn');
    const clearBtn = cell.el.querySelector('.clear-btn');
    if (runBtn) runBtn.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    const pickerWrap = cell.el.querySelector('.fragment-picker-wrap');
    if (pickerWrap) pickerWrap.style.display = 'none';
    const timeoutWrap = cell.el.querySelector('.cell-timeout-wrap');
    if (timeoutWrap) timeoutWrap.style.display = 'none';
    const copyOutBtn = cell.el.querySelector('.copy-output-btn');
    if (copyOutBtn) copyOutBtn.style.display = 'none';
}

function clearAllCells() {
    for (const cell of cells) {
        if (cell.running) interruptCell(cell);
        if (cell.editor) cell.editor.destroy();
        cell.el.remove();
    }
    cells = [];
    cellIdCounter = 0;
}

// ---- File Picker ----

async function showFilePicker() {
    const picker = document.getElementById('file-picker');
    const list = document.getElementById('file-list');
    list.innerHTML = '';

    try {
        const res = await fetch('/api/notebooks');
        const data = await res.json();

        if (data.files.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No notebooks found. Create a new one!';
            li.className = 'empty-message';
            list.appendChild(li);
        } else {
            for (const file of data.files) {
                const li = document.createElement('li');
                li.textContent = file;
                li.onclick = () => {
                    hideFilePicker();
                    loadNotebook(file);
                };
                list.appendChild(li);
            }
        }
    } catch (err) {
        const li = document.createElement('li');
        li.textContent = `Error loading list: ${err.message}`;
        li.className = 'empty-message';
        list.appendChild(li);
    }

    picker.style.display = 'flex';
}

function hideFilePicker() {
    document.getElementById('file-picker').style.display = 'none';
}

document.getElementById('btn-open').onclick = showFilePicker;
document.getElementById('btn-new').onclick = () => {
    clearAllCells();
    currentNotebookPath = null;
    currentNotebookVersion = null;
    updateTitle();
    setAutoSave(false);
    markClean();

    // Update URL: remove notebook param
    const url = new URL(window.location);
    url.searchParams.delete('notebook');
    history.replaceState(null, '', url.toString());

    createCell('markdown', '# Troupe Notebook\n\nWrite Troupe programs in the code cells below and press **Shift+Enter** to run them.');
    createCell('code', 'let val x = 42\nin x * 2\nend');
};

document.getElementById('picker-new').onclick = () => {
    hideFilePicker();
    document.getElementById('btn-new').click();
};

document.getElementById('picker-close').onclick = hideFilePicker;

// ---- Startup ----

initDropIndicator();

async function startup() {
    const params = new URLSearchParams(window.location.search);
    const notebookParam = params.get('notebook');

    if (notebookParam) {
        const loaded = await loadNotebook(notebookParam);
        if (!loaded) {
            // Fall back to new notebook
            createDefaultNotebook();
        }
    } else {
        // Show file picker, but also create a default notebook in the background
        createDefaultNotebook();
        // Check if there are any notebooks to show the picker
        try {
            const res = await fetch('/api/notebooks');
            const data = await res.json();
            if (data.files.length > 0) {
                showFilePicker();
            }
        } catch (err) { console.warn('Failed to list notebooks:', err); }
    }
}

function createDefaultNotebook() {
    createCell('markdown', '# Troupe Notebook\n\nWrite Troupe programs in the code cells below and press **Shift+Enter** to run them.');
    createCell('code', 'let val x = 42\nin x * 2\nend');
}

startup();
