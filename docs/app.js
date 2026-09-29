import { readAccounts, MASTERS } from './core/pastelBooks.js';
import { fileListSource, has } from './core/source.js';

const $ = (id) => document.getElementById(id);

const state = {
    source: null,
    accounts: [],
    loadVersion: 0,
};

function setStatus(text, kind = '')
{
    const el = $('status');
    el.textContent = text;
    el.className = `status ${kind}`;
}

const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function resetBooks()
{
    state.loadVersion++;
    state.source = null;
    state.accounts = [];
    $('loadBtn').disabled = true;
    $('downloadCsvBtn').disabled = true;
    $('masterKind').querySelectorAll('option').forEach((option) => { option.disabled = false; });
    $('masterKind').value = 'ledger';
    $('accountFilter').value = '';
    $('accountCount').textContent = '0';
    $('allRows').innerHTML = '';
    $('dump').textContent = 'Load a set of books to see the detected layout.';
}

function onFolderChosen(files)
{
    if (!files.length) return;

    resetBooks();
    $('clearBtn').disabled = false;
    const folderName = files[0].webkitRelativePath?.split('/')[0] ?? 'selected folder';
    const source = fileListSource(files, folderName);
    const present = Object.entries(MASTERS).filter(([, m]) => has(source, m.dataFile));

    if (present.length === 0)
    {
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

    $('accountCount').textContent = rows.length === state.accounts.length
        ? String(rows.length) : `${rows.length} of ${state.accounts.length}`;
    $('allRows').innerHTML =
        rows
            .map(
                (a) =>
                    `<tr><td class="mono">${escapeHtml(a.account)}</td><td>${escapeHtml(
                        a.description
                    )}</td></tr>`
            )
            .join('') || '<tr class="empty"><td colspan="2">No matches.</td></tr>';
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
    const source = state.source;
    const loadVersion = ++state.loadVersion;
    setStatus('Reading…');
    try
    {
        const data = await readAccounts(source, $('masterKind').value);
        if (loadVersion !== state.loadVersion) return;
        state.accounts = data.accounts;
        showDiagnostics(data);
        renderAll($('accountFilter').value);
        $('downloadCsvBtn').disabled = false;
        setStatus(`${data.label}: ${data.accounts.length} accounts read from ${data.file}.`, 'ok');
    } catch (err)
    {
        if (loadVersion !== state.loadVersion) return;
        state.accounts = [];
        renderAll();
        $('downloadCsvBtn').disabled = true;
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
$('clearBtn').addEventListener('click', () =>
{
    resetBooks();
    $('folderInput').value = '';
    $('clearBtn').disabled = true;
    setStatus('Choose the folder that holds Accmas.DAT.');
});
$('masterKind').addEventListener('change', loadAccounts);
$('accountFilter').addEventListener('input', (e) => renderAll(e.target.value));
$('downloadCsvBtn').addEventListener('click', () =>
{
    const url = URL.createObjectURL(new Blob([toCsv(state.accounts)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pastel-${$('masterKind').value}-accounts.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
