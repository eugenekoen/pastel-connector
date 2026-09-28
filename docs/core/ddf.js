/**
 * Reads the Pervasive data dictionary (FILE.DDF / FIELD.DDF) that ships inside
 * a Pastel set of books, giving the exact field layout of every .DAT file.
 *
 * X$File  : Xf$Id u16@0, Xf$Name char20@2, Xf$Loc char64@22
 * X$Field : Xe$Id u16@0, Xe$File u16@2, Xe$Name char20@4,
 *           Xe$DataType u8@24, Xe$Offset u16@25, Xe$Size u16@27
 */
import { openBtrieve, str, u16At, isPrintableField } from './btrieve.js';

export const DATA_TYPES = {
    0: 'string',
    1: 'integer',
    2: 'float',
    3: 'date',
    4: 'time',
    5: 'decimal',
    6: 'money',
    7: 'logical',
    8: 'numeric',
    9: 'bfloat',
    10: 'lstring',
    11: 'zstring',
    14: 'unsigned',
    15: 'autoincrement',
    16: 'bit',
    25: 'wstring',
    26: 'wzstring',
};

const CHAR_TYPES = new Set(['string', 'lstring', 'zstring']);
export const isTextType = (type) => CHAR_TYPES.has(DATA_TYPES[type]);

export async function readDictionary(source)
{
    const fileBuf = await source.read('File.ddf');
    const fieldBuf = await source.read('Field.ddf');

    const files = openBtrieve(fileBuf, (rec) => isPrintableField(rec, 2, 20) && isPrintableField(rec, 22, 20));
    const fields = openBtrieve(fieldBuf, (rec) => isPrintableField(rec, 4, 20) && rec[24] in DATA_TYPES);

    const tables = new Map();
    for (const rec of files.records)
    {
        const id = u16At(rec, 0);
        const name = str(rec, 2, 20);
        const location = str(rec, 22, 64);
        if (!name || !location) continue;
        tables.set(id, { id, name, location, dataFile: location.replace(/\\/g, '/').split('/').pop(), fields: [] });
    }

    for (const rec of fields.records)
    {
        const table = tables.get(u16At(rec, 2));
        if (!table) continue;
        const type = rec[24];
        if (!(type in DATA_TYPES)) continue;
        table.fields.push({
            id: u16At(rec, 0),
            name: str(rec, 4, 20),
            type,
            typeName: DATA_TYPES[type],
            offset: u16At(rec, 25),
            size: u16At(rec, 27),
        });
    }

    for (const table of tables.values()) table.fields.sort((a, b) => a.offset - b.offset);

    return {
        tables: [...tables.values()],
        byDataFile(name)
        {
            const wanted = name.toLowerCase();
            return [...tables.values()].find((t) => t.dataFile?.toLowerCase() === wanted);
        },
        diagnostics: { filePrefix: files.prefix, fieldPrefix: fields.prefix },
    };
}
