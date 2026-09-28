/**
 * Pulls account numbers and descriptions out of a Pastel set of books, using
 * the book's own DDF dictionary to locate the fields.
 */
import { openBtrieve, str, isPrintableField } from './btrieve.js';
import { readDictionary, isTextType } from './ddf.js';

/** The three master files share a layout: category, code, description. */
export const MASTERS = {
    ledger: {
        label: 'General Ledger',
        dataFile: 'accmas.dat',
        fallback: {
            table: 'LedgerMaster',
            account: { name: 'AccNumber', offset: 2, size: 7 },
            description: { name: 'AccDesc', offset: 9, size: 40 },
        },
    },
    customer: {
        label: 'Customers',
        dataFile: 'accmasd.dat',
        fallback: {
            table: 'CustomerMaster',
            account: { name: 'CustomerCode', offset: 2, size: 6 },
            description: { name: 'CustomerDesc', offset: 8, size: 40 },
        },
    },
    supplier: {
        label: 'Suppliers',
        dataFile: 'accmasc.dat',
        fallback: {
            table: 'SupplierMaster',
            account: { name: 'SupplCode', offset: 2, size: 6 },
            description: { name: 'SupplDesc', offset: 8, size: 40 },
        },
    },
};

const ACCOUNT_NAMES = [/^(accnumber|customercode|supplcode)$/i, /^(account|customer|suppl(ier)?)(no|number|code)$/i, /code$/i];
const DESCRIPTION_NAMES = [/^(accdesc|customerdesc|suppldesc)$/i, /^description$/i, /desc$/i];

function pickField(fields, patterns)
{
    for (const pattern of patterns)
    {
        const hit = fields.find((f) => isTextType(f.type) && f.size > 1 && pattern.test(f.name));
        if (hit) return hit;
    }
    return null;
}

function dedupeFields(fields)
{
    const seen = new Set();
    return fields.filter((f) =>
    {
        const key = `${f.name}@${f.offset}:${f.size}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function resolveMaster(kind)
{
    const master = MASTERS[kind];
    if (!master) throw new Error(`Unknown master file "${kind}". Use one of: ${Object.keys(MASTERS).join(', ')}.`);
    return master;
}

/** Resolve where the code and description live inside a master record. */
export async function resolveLayout(source, kind = 'ledger')
{
    const master = resolveMaster(kind);
    try
    {
        const dict = await readDictionary(source);
        const table = dict.byDataFile(master.dataFile);
        if (!table) throw new Error(`${master.dataFile} is not described in the dictionary.`);

        const fields = dedupeFields(table.fields);
        const account = pickField(fields, ACCOUNT_NAMES);
        const description = pickField(fields, DESCRIPTION_NAMES);
        if (!account || !description) throw new Error('Code/description fields not found in the dictionary.');

        return {
            source: 'ddf',
            kind,
            table: table.name,
            account: { name: account.name, offset: account.offset, size: account.size },
            description: { name: description.name, offset: description.offset, size: description.size },
            fields,
        };
    } catch (err)
    {
        return {
            ...master.fallback,
            source: 'fallback',
            kind,
            warning: `Dictionary unavailable (${err.message}); using the standard Pastel layout.`,
        };
    }
}

/** Pastel stores the GL account as main + sub run together, e.g. 0220315 -> 0220/315. */
function formatAccount(raw, kind, mainLength = 4)
{
    return kind === 'ledger' && /^[A-Za-z0-9]{7}$/.test(raw) ? `${raw.slice(0, mainLength)}/${raw.slice(mainLength)}` : raw;
}

export async function readAccounts(source, kind = 'ledger', overrides = {})
{
    const master = resolveMaster(kind);
    const layout = { ...(await resolveLayout(source, kind)), ...overrides };
    const buf = await source.read(master.dataFile);

    const valid = (rec) =>
        isPrintableField(rec, layout.account.offset, layout.account.size) &&
        /^[A-Za-z0-9][A-Za-z0-9 ./-]*$/.test(str(rec, layout.account.offset, layout.account.size));

    const file = openBtrieve(buf, valid);

    const seen = new Set();
    const accounts = [];
    for (const rec of file.records)
    {
        if (!valid(rec)) continue;
        const account = str(rec, layout.account.offset, layout.account.size);
        if (!account || seen.has(account)) continue;
        seen.add(account);
        accounts.push({
            account,
            accountFormatted: formatAccount(account, kind),
            description: str(rec, layout.description.offset, layout.description.size),
        });
    }

    accounts.sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true, sensitivity: 'base' }));

    return {
        kind,
        label: master.label,
        file: master.dataFile,
        layout,
        stats: {
            recordLength: file.recordLength,
            physicalRecordLength: file.physicalRecordLength,
            pageSize: file.pageSize,
            prefix: file.prefix,
            recordsInFile: file.recordCount,
            recordsRead: file.records.length,
            accounts: accounts.length,
        },
        accounts,
    };
}
