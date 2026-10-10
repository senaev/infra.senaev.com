import picomatch from 'picomatch';

/**
 * A case-insensitive matcher for root-relative POSIX paths. A pattern without `/` matches the
 * file name; `basename` is set only then, because it stops `a/**\/*.md` from matching at all.
 * Extglobs are off: they are the source of picomatch's known ReDoS cases, and a file name
 * filter does not need them.
 */
export function compileFileGlob(glob: string): (path: string) => boolean {
    return picomatch(glob, {
        basename: !glob.includes('/'),
        nocase: true,
        noextglob: true,
    });
}
