import { readFile, writeFile, readdir } from 'node:fs/promises';
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

    /** Load a notebook file. Path must be relative to baseDir. */
    async load(relPath: string): Promise<NotebookData> {
        const fullPath = this.resolvePath(relPath);
        const content = await readFile(fullPath, 'utf-8');
        const data = JSON.parse(content) as NotebookData;
        if (!data.troupe_notebook || !Array.isArray(data.cells)) {
            throw new Error('Invalid notebook format');
        }
        return data;
    }

    /** Save a notebook file. Path must be relative to baseDir. */
    async save(relPath: string, data: NotebookData): Promise<void> {
        const fullPath = this.resolvePath(relPath);
        await writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
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
