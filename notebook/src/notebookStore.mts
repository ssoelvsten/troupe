import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative, extname } from 'node:path';

export interface NotebookOutput {
    type: 'stdout' | 'stderr' | 'compile_error' | 'result';
    data: string;
}

export interface NotebookCell {
    id: string;
    type: 'code' | 'markdown';
    source: string;
    outputs?: NotebookOutput[];
}

export interface NotebookData {
    troupe_notebook: number;
    cells: NotebookCell[];
}

export interface LoadResult {
    data: NotebookData;
    version: string;  // file mtime as ISO string, used for conflict detection
}

export class VersionConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VersionConflictError';
    }
}

export class NotebookStore {
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = resolve(baseDir);
    }

    /** List all .tpnb files in the base directory */
    async list(): Promise<string[]> {
        const entries = await readdir(this.baseDir, { withFileTypes: true });
        return entries
            .filter(e => e.isFile() && extname(e.name) === '.tpnb')
            .map(e => e.name)
            .sort();
    }

    /** Load a notebook file. Returns data and version (mtime) for conflict detection. */
    async load(relPath: string): Promise<LoadResult> {
        const fullPath = this.resolvePath(relPath);
        const content = await readFile(fullPath, 'utf-8');
        const data = JSON.parse(content) as NotebookData;
        if (!data.troupe_notebook || !Array.isArray(data.cells)) {
            throw new Error('Invalid notebook format');
        }
        const st = await stat(fullPath);
        return { data, version: st.mtimeMs.toString() };
    }

    /** Save a notebook file with optimistic concurrency control.
     *  If expectedVersion is provided, rejects with VersionConflictError if the
     *  file was modified since that version (by another tab/client). */
    async save(relPath: string, data: NotebookData, expectedVersion?: string): Promise<string> {
        const fullPath = this.resolvePath(relPath);
        if (expectedVersion) {
            try {
                const st = await stat(fullPath);
                const currentVersion = st.mtimeMs.toString();
                if (currentVersion !== expectedVersion) {
                    throw new VersionConflictError(
                        'Notebook was modified by another session. Reload or force save.'
                    );
                }
            } catch (err: any) {
                if (err instanceof VersionConflictError) throw err;
                // File doesn't exist yet (ENOENT) — ok to proceed
                if (err.code !== 'ENOENT') throw err;
            }
        }
        await writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        const st = await stat(fullPath);
        return st.mtimeMs.toString();
    }

    /** Resolve a relative path, ensuring it stays within baseDir */
    private resolvePath(relPath: string): string {
        const fullPath = resolve(this.baseDir, relPath);
        const rel = relative(this.baseDir, fullPath);
        if (rel.startsWith('..') || rel.includes('/')) {
            throw new Error('Path must be a filename within the notebook directory');
        }
        return fullPath;
    }
}
