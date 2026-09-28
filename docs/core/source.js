/**
 * A "source" hands the readers the bytes of a named file from a set of books,
 * so the same parsing code runs against a folder on disk (Node) or a folder the
 * user picked in a file input (browser).
 */

/** Node: read the books straight off disk. */
export async function folderSource(folder)
{
    const { readFile, readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const names = await readdir(folder);

    return {
        label: folder,
        list: () => names,
        async read(name)
        {
            const match = names.find((n) => n.toLowerCase() === name.toLowerCase());
            if (!match) throw new Error(`${name} not found in ${folder}`);
            const buf = await readFile(join(folder, match));
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        },
    };
}

/** Browser: read the books from a <input type="file" webkitdirectory> FileList. */
export function fileListSource(files, label = 'selected folder')
{
    const byName = new Map();
    for (const file of files)
    {
        byName.set(file.name.toLowerCase(), file);
    }

    return {
        label,
        list: () => [...byName.values()].map((f) => f.name),
        async read(name)
        {
            const file = byName.get(name.toLowerCase());
            if (!file) throw new Error(`${name} not found in ${label}`);
            return new Uint8Array(await file.arrayBuffer());
        },
    };
}

export function has(source, name)
{
    const wanted = name.toLowerCase();
    return source.list().some((n) => n.toLowerCase() === wanted);
}
