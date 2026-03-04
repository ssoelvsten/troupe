import { spawn, ChildProcess } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface OutputCallback {
    (type: 'stdout' | 'stderr' | 'compile_error' | 'result' | 'done', data: string): void;
}

export interface RuntimeOptions {
    nmifc?: boolean;
    labelFormat?: string;
}

export class ExecutionManager {
    private running: Map<string, ChildProcess> = new Map();
    private troupeRoot: string;

    constructor(troupeRoot: string) {
        this.troupeRoot = troupeRoot;
    }

    async executeCell(cellId: string, source: string, onOutput: OutputCallback, options?: RuntimeOptions): Promise<void> {
        const id = randomUUID().slice(0, 8);
        const trpFile = join(tmpdir(), `troupe-nb-${id}.trp`);
        const jsFile = join(tmpdir(), `troupe-nb-${id}.js`);

        try {
            await writeFile(trpFile, source, 'utf-8');

            // Step 1: Compile
            const compileOk = await this.compile(trpFile, jsFile, cellId, onOutput);
            if (!compileOk) {
                onOutput('done', '1');
                return;
            }

            // Step 2: Run
            await this.run(jsFile, cellId, onOutput, options);
        } finally {
            // Clean up temp files
            await unlink(trpFile).catch(() => {});
            await unlink(jsFile).catch(() => {});
        }
    }

    interrupt(cellId: string): boolean {
        const proc = this.running.get(cellId);
        if (proc) {
            proc.kill('SIGINT');
            return true;
        }
        return false;
    }

    private compile(trpFile: string, jsFile: string, cellId: string, onOutput: OutputCallback): Promise<boolean> {
        return new Promise((resolve) => {
            const compiler = join(this.troupeRoot, 'bin', 'troupec');
            const proc = spawn(compiler, [
                trpFile,
                '--output=' + jsFile,
            ]);

            let stderr = '';
            proc.stderr?.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            proc.on('close', (code) => {
                if (code !== 0) {
                    onOutput('compile_error', stderr || `Compilation failed with exit code ${code}`);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });

            proc.on('error', (err) => {
                onOutput('compile_error', `Failed to start compiler: ${err.message}`);
                resolve(false);
            });
        });
    }

    private run(jsFile: string, cellId: string, onOutput: OutputCallback, options?: RuntimeOptions): Promise<void> {
        return new Promise((resolve) => {
            const runtime = join(this.troupeRoot, 'rt', 'built', 'troupe.mjs');
            const runtimeArgs = [
                '--stack-trace-limit=1000',
                runtime,
                '-f=' + jsFile,
                '--localonly',
                '--suppress-local-info-message',
                '--no-color',
            ];

            if (options) {
                if (options.nmifc === false) {
                    runtimeArgs.push('--no-nmifc');
                }
                if (options.labelFormat && options.labelFormat !== 'v1') {
                    runtimeArgs.push(`--label-format=${options.labelFormat}`);
                }
            }

            const proc = spawn('node', runtimeArgs, {
                env: { ...process.env, TROUPE: this.troupeRoot },
            });

            this.running.set(cellId, proc);

            const mainThreadRe = /^>>> Main thread finished with value: (.+)$/;

            proc.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                for (const line of text.split('\n')) {
                    if (!line) continue;
                    const match = mainThreadRe.exec(line);
                    if (match) {
                        onOutput('result', match[1]);
                    } else {
                        onOutput('stdout', line + '\n');
                    }
                }
            });

            proc.stderr?.on('data', (chunk: Buffer) => {
                onOutput('stderr', chunk.toString());
            });

            proc.on('close', (code) => {
                this.running.delete(cellId);
                onOutput('done', String(code ?? 0));
                resolve();
            });

            proc.on('error', (err) => {
                this.running.delete(cellId);
                onOutput('stderr', `Failed to start runtime: ${err.message}\n`);
                onOutput('done', '1');
                resolve();
            });
        });
    }
}
