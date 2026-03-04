import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { keymap, Decoration } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { undo, redo } from '@codemirror/commands';
import { marked } from 'marked';

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
}

// ---- State ----

let ws = null;
let cells = [];
let cellIdCounter = 0;
let currentNotebookPath = null; // e.g. "foo.tpnb"

// ---- WebSocket Connection ----

function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => console.log('WebSocket connected');

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
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
                updateCellHeader(cell);
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 2s...');
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
    };
    cells.push(cell);
    renderCell(cell);

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

function renderCell(cell) {
    const el = document.createElement('div');
    el.className = `cell ${cell.type}-cell`;
    el.dataset.cellId = cell.id;

    // Header
    const header = document.createElement('div');
    header.className = 'cell-header';

    if (cell.type === 'code') {
        // Segmented toggle: Runnable | Fragment
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
            // Toggle Run/Clear visibility
            const runBtn = cell.el.querySelector('.run-btn');
            const clearBtn = cell.el.querySelector('.clear-btn');
            if (runBtn) runBtn.style.display = isFragment ? 'none' : '';
            if (clearBtn) clearBtn.style.display = isFragment ? 'none' : '';
            // Toggle fragment name input vs fragment picker
            const nameInput = cell.el.querySelector('.fragment-name');
            const pickerWrap = cell.el.querySelector('.fragment-picker-wrap');
            if (nameInput) nameInput.style.display = isFragment ? '' : 'none';
            if (pickerWrap) pickerWrap.style.display = isFragment ? 'none' : '';
        }

        runnableOpt.onclick = () => setFragmentMode(false);
        fragmentOpt.onclick = () => setFragmentMode(true);

        toggleWrap.appendChild(runnableOpt);
        toggleWrap.appendChild(fragmentOpt);
        toggleWrap.title = 'Fragment cells provide definitions to subsequent cells (not independently runnable)';
        header.appendChild(toggleWrap);

        // Fragment name input (visible only when fragment is on)
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fragment-name';
        nameInput.placeholder = 'unnamed';
        nameInput.value = cell.fragmentName;
        nameInput.style.display = cell.fragment ? '' : 'none';
        nameInput.oninput = () => { cell.fragmentName = nameInput.value; };
        header.appendChild(nameInput);

        // Fragment picker (visible only when fragment is off)
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
    } else {
        // Markdown cell type label
        const typeLabel = document.createElement('span');
        typeLabel.className = 'cell-type';
        typeLabel.textContent = 'MD';
        header.appendChild(typeLabel);
    }

    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    if (cell.type === 'code') {
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
            });
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

        // Hide Run/Clear/Copy Output when fragment is on
        if (cell.fragment) {
            runBtn.style.display = 'none';
            clearBtn.style.display = 'none';
            copyOutBtn.style.display = 'none';
        }
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

    // Editor area
    if (cell.type === 'code') {
        const editorDiv = document.createElement('div');
        editorDiv.className = 'cell-editor';
        el.appendChild(editorDiv);

        const editorState = EditorState.create({
            doc: cell.source,
            extensions: [
                basicSetup,
                javascript(),
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
                    }
                }),
            ],
        });

        cell.editor = new EditorView({
            state: editorState,
            parent: editorDiv,
        });

        // Output area with copy button
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
            const text = cell.outputEl ? cell.outputEl.textContent : '';
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                copyOutBtn.textContent = 'Copied!';
                setTimeout(() => { copyOutBtn.textContent = 'Copy'; }, 1500);
            });
        };
        outputWrap.appendChild(copyOutBtn);

        el.appendChild(outputWrap);
        cell.outputEl = outputEl;
    } else {
        // Markdown cell
        const renderedDiv = document.createElement('div');
        renderedDiv.className = 'cell-rendered';
        renderedDiv.innerHTML = marked.parse(cell.source || '*Click to edit*');
        el.appendChild(renderedDiv);

        // Edit button (visible when not editing)
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.title = 'Edit markdown (or double-click)';
        actions.appendChild(editBtn);

        // Done button (hidden until editing)
        const doneBtn = document.createElement('button');
        doneBtn.className = 'done-btn';
        doneBtn.textContent = 'Done';
        doneBtn.title = 'Finish editing (Escape or Shift+Enter)';
        doneBtn.style.display = 'none';
        actions.appendChild(doneBtn);

        function startEditing() {
            if (cell.editor) return; // already editing
            renderedDiv.style.display = 'none';
            editBtn.style.display = 'none';
            doneBtn.style.display = '';
            const editorDiv = document.createElement('div');
            editorDiv.className = 'cell-editor';
            el.insertBefore(editorDiv, renderedDiv);

            function finishEditing() {
                cell.source = cell.editor.state.doc.toString();
                renderedDiv.innerHTML = marked.parse(cell.source || '*Click to edit*');
                renderedDiv.style.display = '';
                editBtn.style.display = '';
                doneBtn.style.display = 'none';
                cell.editor.destroy();
                cell.editor = null;
                editorDiv.remove();
                updateTitle(); // heading may have changed
            }

            doneBtn.onclick = finishEditing;

            const editorState = EditorState.create({
                doc: cell.source,
                extensions: [
                    basicSetup,
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

    cell.el = el;
    notebook.appendChild(el);
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
    cell.el.classList.add('running');
    cell.running = true;
    cell.lastResult = null;
    cell.outputs = []; // clear saved outputs for this execution
    updateCellHeader(cell);

    const source = cell.editor ? cell.editor.state.doc.toString() : cell.source;
    cell.source = source;

    const fragmentSource = assembleFragment(cell);
    cell.fragmentLineCount = fragmentSource ? (fragmentSource.match(/\n/g) || []).length : 0;

    ws.send(JSON.stringify({
        type: 'execute',
        cellId: cell.id,
        source: source,
        preamble: fragmentSource,
        options: getRuntimeOptions(),
    }));
}

function interruptCell(cell) {
    if (!cell.running) return;
    ws.send(JSON.stringify({
        type: 'interrupt',
        cellId: cell.id,
    }));
}

function deleteCell(cell) {
    const idx = cells.indexOf(cell);
    if (idx === -1) return;
    if (cell.running) interruptCell(cell);
    if (cell.editor) cell.editor.destroy();
    cell.el.remove();
    cells.splice(idx, 1);
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
}

// ---- Toolbar ----

document.getElementById('btn-add-code').onclick = () => {
    createCell('code', 'let val x = 42\nin x\nend');
};

document.getElementById('btn-add-markdown').onclick = () => {
    createCell('markdown', '## New Section\n\nWrite your notes here.');
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
            }
            return cellData;
        }),
    };
}

async function saveNotebook() {
    if (!currentNotebookPath) {
        return saveNotebookAs();
    }
    const data = getNotebookData();
    try {
        const res = await fetch(`/api/notebook?path=${encodeURIComponent(currentNotebookPath)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json();
            showStatus(`Save failed: ${err.error}`, true);
        } else {
            showStatus('Saved');
        }
    } catch (err) {
        showStatus(`Save failed: ${err.message}`, true);
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
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.troupe_notebook || !Array.isArray(data.cells)) {
                showStatus('Invalid notebook file', true);
                return;
            }
            clearAllCells();
            currentNotebookPath = null;
            setRuntimeOptions(data.options);
            updateTitle();

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
            }
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
        setRuntimeOptions(data.options);
        updateTitle();

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
        }
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
    updateTitle();

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
        } catch { /* ignore */ }
    }
}

function createDefaultNotebook() {
    createCell('markdown', '# Troupe Notebook\n\nWrite Troupe programs in the code cells below and press **Shift+Enter** to run them.');
    createCell('code', 'let val x = 42\nin x * 2\nend');
}

startup();
