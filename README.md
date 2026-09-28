# Pastel Connector

Reads **account numbers and descriptions** — General Ledger, Customers and Suppliers — directly
out of a Sage Pastel (Partner / Xpress) *set of books*. Pastel does not need to be installed or
running, and no ODBC driver or licence is required.

No dependencies — Node 18+ only.

## How it connects to a set of books

A Pastel set of books is a folder of **Btrieve / Pervasive PSQL** files. Two things make it
readable without Pastel:

1. **The data files are Btrieve**, not flat files. Each file starts with a File Control Record
   (`FC` signature) holding the page size and record geometry; the rest of the file is pages,
   and pages whose second header byte is `0x44` (`'D'`) hold records.
   See [src/btrieve.js](src/btrieve.js).
2. **The books carry their own schema.** `File.ddf` and `Field.ddf` are the Pervasive data
   dictionary, listing every table, its data file, and every field's name, type, offset and
   size. Reading those gives the exact layout instead of guessing.
   See [src/ddf.js](src/ddf.js).

For the three master files that share a layout, that resolves to:

| Kind | Table | Data file | Code field | Description field |
| --- | --- | --- | --- | --- |
| `ledger` | `LedgerMaster` | `Accmas.DAT` | `AccNumber` @2:7 | `AccDesc` @9:40 |
| `customer` | `CustomerMaster` | `AccMasD.DAT` | `CustomerCode` @2:6 | `CustomerDesc` @8:40 |
| `supplier` | `SupplierMaster` | `Accmasc.DAT` | `SupplCode` @2:6 | `SupplDesc` @8:40 |

The only piece not published anywhere is Btrieve's per-record internal prefix, which differs
per file (2 bytes for `Accmas.DAT`, 10 for the DDFs). It is detected by trying each candidate
offset and keeping the one where the character fields actually decode as text.

Btrieve shadow-paging means every live record is seen more than once, so records are
de-duplicated by account number. The result matches the record count in the file header exactly.

If the DDFs are missing, the reader falls back to the standard Pastel Partner offsets above.

## Run it

The viewer is a static page that does all the parsing in the browser, so there are two ways to
use it.

**Hosted (GitHub Pages).** Settings → Pages → Deploy from branch → `main` → `/docs`. Open the
page, click the folder button, pick the set of books. Nothing is uploaded: the files are read
locally through the File API and parsed in the tab.

**Locally,** which additionally exposes the HTTP API:

```powershell
npm start
# then open http://127.0.0.1:5173
```

Choose **General Ledger**, **Customers** or **Suppliers**. Selecting an account (from the
dropdown, or by clicking a row) puts the account number in column 1 and its description in
column 2. **How this was read** shows the detected layout and record counts.

After changing anything in `src/`, run `npm run build` to refresh `docs/core/`, which is the
copy the static page loads.

### Browser support

Folder picking uses `webkitdirectory`, which works in Chrome, Edge, Opera and Safari. Firefox
supports it too, but is less consistent; use the local server there if it gives trouble.

## CSV from the command line

```powershell
node src/cli.js "C:\Pastel\MyCompany" ledger   > accounts.csv
node src/cli.js "C:\Pastel\MyCompany" customer > customers.csv
node src/cli.js "C:\Pastel\MyCompany" supplier > suppliers.csv
```

## HTTP API (for the app you want to plug this into)

All endpoints take `path=<folder>` and an optional `kind=ledger|customer|supplier`
(default `ledger`).

| Endpoint | Purpose |
| --- | --- |
| `GET /api/books` | Sanity check: data file count, which masters are present, dictionary present |
| `GET /api/accounts` | `{ kind, label, file, layout, stats, count, accounts: [{ account, accountFormatted, description }] }` |
| `GET /api/layout` | Just the resolved field layout, plus the table's full field list |

`account` is the raw code (`0720000`); for the ledger, `accountFormatted` is the way Pastel shows
it (`0720/000`). Customer and supplier codes are not split.

Or import it directly. The readers take a *source* rather than a path, so the same code runs in
Node and in the browser:

```js
import { readAccounts } from './src/pastelBooks.js';
import { folderSource } from './src/source.js';

const { accounts } = await readAccounts(await folderSource('C:\\Pastel\\MyCompany'), 'customer');
```

```js
// browser: files comes from <input type="file" webkitdirectory>
import { fileListSource } from './core/source.js';
const { accounts } = await readAccounts(fileListSource(files), 'ledger');
```

## Minimum files needed

| File | Required? |
| --- | --- |
| `Accmas.DAT` / `AccMasD.DAT` / `Accmasc.DAT` | The master you want to read |
| `File.ddf`, `Field.ddf` | Optional, but makes the layout version-proof |

Nothing else — no index files, no Pervasive engine, no Pastel installation.

## Reading other tables

The dictionary covers all 100 tables in the books (`LedgerTransactions` → `acctrn.dat`,
`CustSuppParameters` → `accprmdc.dat`, and so on), so the same two modules can read any of them —
`readDictionary()` for the field layout, `openBtrieve()` for the records.

## Layout

| Path | What |
| --- | --- |
| `src/` | The readers. No dependencies, no Node-only code except `server.js`, `cli.js` and one helper in `source.js`. |
| `docs/` | The static site published to GitHub Pages; `docs/core/` is a copy of `src/` made by `npm run build`. |
| `scripts/` | The build step. |

## Notes

- Open the books **read-only**: copy the folder, or make sure nobody is posting in Pastel while
  you read.
- A set of books contains live financial data. Keep it out of source control.
