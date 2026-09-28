import { readAccounts, MASTERS } from './core/pastelBooks.js';
import { fileListSource, has } from './core/source.js';

const $ = (id) => document.getElementById(id);

const state = {
    source: null,
    accounts: [],
    selected: [],
};

function setStatus(text, kind = '')
{
    const el = $('status');
    el.textContent = text;
    el.className = `status ${kind}`;
}

const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function onFolderChosen(files)
{
    if (!files.length) return;

    const folderName = files[0].webkitRelativePath?.split('/')[0] ?? 'selected folder';
    const source = fileListSource(files, folderName);
    const present = Object.entries(MASTERS).filter(([, m]) => has(source, m.dataFile));

    if (present.length === 0)
    {
        state.source = null;
        $('loadBtn').disabled = true;
        setStatus(`No Pastel master files in "${folderName}" - it does not look like a set of books.`, 'error');
        return;
    }

    for (const [kind, master] of Object.entries(MASTERS))
    {
        $('masterKind').querySelector(`option[value="${kind}"]`).disabled = !has(source, master.dataFile);
    }
    $('masterKind').value = present[0][0];

    state.source = source;
    $('loadBtn').disabled = false;

    const dictionary = has(source, 'file.ddf') && has(source, 'field.ddf');
    setStatus(
        `"${folderName}": ${present.map(([, m]) => m.label).join(', ')} available` +
        `${dictionary ? ', dictionary present' : ' (no DDF dictionary - standard layout will be assumed)'}.`
    );
}

function renderAll(filter = '')
{
    const needle = filter.trim().toLowerCase();
    const rows = state.accounts.filter(
        (a) => !needle || a.account.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle)
    );

    $('accountCount').textContent = String(state.accounts.length);
    $('allRows').innerHTML =
        rows
            .map(
                (a) =>
                    `<tr data-account="${escapeHtml(a.account)}"><td class="mono">${escapeHtml(a.account)}</td><td>${escapeHtml(
                        a.description
                    )}</td></tr>`
            )
            .join('') || '<tr class="empty"><td colspan="2">No matches.</td></tr>';

    $('accountPicker').innerHTML = rows
        .map((a) => `<option value="${escapeHtml(a.account)}">${escapeHtml(a.account)} — ${escapeHtml(a.description)}</option>`)
        .join('');
}

function renderSelection()
{
    const body = $('selectedRows');
    if (state.selected.length === 0)
    {
        body.innerHTML = '<tr class="empty"><td colspan="2">Nothing selected yet.</td></tr>';
        return;
    }
    body.innerHTML = state.selected
        .map((a) => `<tr><td class="mono">${escapeHtml(a.account)}</td><td>${escapeHtml(a.description)}</td></tr>`)
        .join('');
}

function select(accountNumber)
{
    const account = state.accounts.find((a) => a.account === accountNumber);
    if (!account) return;
    state.selected = state.selected.filter((a) => a.account !== account.account);
    state.selected.unshift(account);
    renderSelection();
}

function showDiagnostics(data)
{
    const { layout, stats } = data;
    $('dump').textContent = [
        `folder   ${state.source.label}`,
        `file     ${data.file}  (table ${layout.table}, layout from ${layout.source})`,
        `fields   ${layout.account.name} @${layout.account.offset} size ${layout.account.size}`,
        `         ${layout.description.name} @${layout.description.offset} size ${layout.description.size}`,
        `btrieve  page ${stats.pageSize}, record ${stats.recordLength}/${stats.physicalRecordLength}, prefix ${stats.prefix}`,
        `records  ${stats.recordsRead} read, ${stats.recordsInFile} live, ${stats.accounts} distinct accounts`,
        layout.warning ?? '',
    ]
        .filter(Boolean)
        .join('\n');
}

async function loadAccounts()
{
    if (!state.source) return;
    setStatus('Reading…');
    try
    {
        const data = await readAccounts(state.source, $('masterKind').value);
        state.accounts = data.accounts;
        state.selected = [];
        showDiagnostics(data);
        renderAll($('accountFilter').value);
        renderSelection();
        setStatus(`${data.label}: ${data.accounts.length} accounts read from ${data.file}.`, 'ok');
    } catch (err)
    {
        state.accounts = [];
        renderAll();
        setStatus(err.message, 'error');
    }
}

function toCsv(rows)
{
    const esc = (v) => `"${v.replace(/"/g, '""')}"`;
    return ['Account,Description', ...rows.map((a) => `${esc(a.account)},${esc(a.description)}`)].join('\r\n');
}

$('folderInput').addEventListener('change', (e) => onFolderChosen([...e.target.files]));
$('loadBtn').addEventListener('click', loadAccounts);
$('masterKind').addEventListener('change', loadAccounts);
$('accountFilter').addEventListener('input', (e) => renderAll(e.target.value));
$('accountPicker').addEventListener('change', (e) => select(e.target.value));
$('allRows').addEventListener('click', (e) =>
{
    const row = e.target.closest('tr[data-account]');
    if (row) select(row.dataset.account);
});
$('copyCsvBtn').addEventListener('click', () => navigator.clipboard.writeText(toCsv(state.accounts)));
