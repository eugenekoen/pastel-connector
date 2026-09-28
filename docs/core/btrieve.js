/**
 * Minimal reader for Btrieve / Pervasive PSQL data files, which is what a Sage
 * Pastel set of books is made of (Accmas.DAT, Acctrn.DAT, the *.ddf dictionary
 * files, ...).
 *
 * Layout, as observed in Pastel Partner books and confirmed against the DDFs:
 *   page 0/1        File Control Record ("FC" signature) - holds the geometry
 *   every page      6 byte page header; byte 1 == 0x44 ('D') marks a data page
 *   data page       [prefix][record data] repeated every physicalRecordLength
 *
 * The prefix length (Btrieve's per-record internal pointers) varies per file,
 * so it is detected by validating candidate offsets against the record layout.
 */

const PAGE_HEADER = 6;
const DATA_PAGE_MARKER = 0x44;

// Plain Uint8Array arithmetic so this module runs unchanged in the browser.
const u16 = (buf, off) => buf[off] | (buf[off + 1] << 8);
const u32 = (buf, off) => u16(buf, off) + u16(buf, off + 2) * 0x10000;

function latin1(buf, start, end)
{
    let out = '';
    for (let i = start; i < end; i++) out += String.fromCharCode(buf[i]);
    return out;
}

export function readFileControlRecord(buf)
{
    if (buf.length < 64 || u16(buf, 0) !== 0x4346)
    {
        throw new Error('Not a Btrieve file (missing "FC" file control record).');
    }
    const pageSize = u16(buf, 0x08);
    const recordLength = u16(buf, 0x16);
    const physicalRecordLength = u16(buf, 0x18);

    if (!pageSize || pageSize % 512 !== 0) throw new Error(`Unsupported page size ${pageSize}.`);
    if (!recordLength || physicalRecordLength < recordLength)
    {
        throw new Error(`Unusable record geometry (${recordLength}/${physicalRecordLength}).`);
    }

    return {
        pageSize,
        recordLength,
        physicalRecordLength,
        keyCount: u16(buf, 0x14),
        recordCount: u32(buf, 0x1c),
        pageCount: Math.floor(buf.length / pageSize),
        maxPrefix: physicalRecordLength - recordLength,
    };
}

function isDataPage(buf, pageOffset)
{
    return buf[pageOffset + 1] === DATA_PAGE_MARKER && (buf[pageOffset + 5] & 0x80) !== 0;
}

function isBlank(rec)
{
    for (let i = 0; i < rec.length; i++) if (rec[i] !== 0x00) return false;
    return true;
}

/** Every record in the file at a given prefix, blank slots removed. */
export function readRecordsAt(buf, fcr, prefix)
{
    const perPage = Math.floor((fcr.pageSize - PAGE_HEADER) / fcr.physicalRecordLength);
    const out = [];

    for (let page = 1; page < fcr.pageCount; page++)
    {
        const pageOffset = page * fcr.pageSize;
        if (!isDataPage(buf, pageOffset)) continue;

        for (let i = 0; i < perPage; i++)
        {
            const start = pageOffset + PAGE_HEADER + i * fcr.physicalRecordLength + prefix;
            const end = start + fcr.recordLength;
            if (end > pageOffset + fcr.pageSize) break;
            const rec = buf.subarray(start, end);
            if (!isBlank(rec)) out.push(rec);
        }
    }
    return out;
}

/**
 * Find the per-record prefix by scoring candidate offsets with a validator.
 * @param {(record: Uint8Array) => boolean} isValid
 */
export function detectPrefix(buf, fcr, isValid)
{
    let best = { prefix: 0, score: -1, records: [] };

    for (let prefix = 0; prefix <= fcr.maxPrefix; prefix += 2)
    {
        const records = readRecordsAt(buf, fcr, prefix);
        if (records.length === 0) continue;
        const valid = records.reduce((n, rec) => n + (isValid(rec) ? 1 : 0), 0);
        const score = valid / records.length;
        if (score > best.score) best = { prefix, score, records };
        if (score === 1) break;
    }

    if (best.score <= 0) throw new Error('Could not locate records inside the Btrieve data pages.');
    return best;
}

export function openBtrieve(buf, isValid)
{
    const fcr = readFileControlRecord(buf);
    const { prefix, score, records } = detectPrefix(buf, fcr, isValid);
    return { ...fcr, prefix, confidence: score, records };
}

/** Trim a fixed-width Btrieve character field. */
export function str(rec, offset, length)
{
    if (offset < 0 || offset + length > rec.length) return '';
    return latin1(rec, offset, offset + length)
        .replace(/\0[\s\S]*$/, '')
        .trim();
}

export function u16At(rec, offset)
{
    return u16(rec, offset);
}

export const isPrintableField = (rec, offset, length) =>
{
    if (offset < 0 || offset + length > rec.length) return false;
    let seenText = false;
    for (let i = offset; i < offset + length; i++)
    {
        const b = rec[i];
        if (b === 0x00) continue;
        if (b < 0x20 || b > 0x7e) return false;
        if (b !== 0x20) seenText = true;
    }
    return seenText;
};
