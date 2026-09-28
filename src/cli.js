/**
 * CLI: node src/cli.js "C:\Pastel\MyCompany" [ledger|customer|supplier] > accounts.csv
 * Prints account numbers and descriptions as CSV.
 */
import { readAccounts } from './pastelBooks.js';
import { folderSource } from './source.js';

const folder = process.argv[2] ?? process.env.PASTEL_BOOKS;
const kind = process.argv[3] ?? 'ledger';

if (!folder)
{
    console.error('Usage: node src/cli.js <set-of-books-folder> [ledger|customer|supplier]');
    process.exit(1);
}

const { label, layout, stats, accounts } = await readAccounts(await folderSource(folder), kind);

console.error(
    `${label}: layout=${layout.source} table=${layout.table} ` +
    `${layout.account.name}@${layout.account.offset}:${layout.account.size} ` +
    `${layout.description.name}@${layout.description.offset}:${layout.description.size}`
);
console.error(`records=${stats.recordsRead}/${stats.recordsInFile} accounts=${stats.accounts} prefix=${stats.prefix}`);
if (layout.warning) console.error(layout.warning);

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
console.log('Account,Description');
for (const { account, description } of accounts)
{
    console.log(`${esc(account)},${esc(description)}`);
}
