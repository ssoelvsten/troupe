import { spawn, ChildProcess } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:os';

const signalNumbers: Record<string, number> = constants.signals as Record<string, number>;
function signalNumber(sig: string): number | undefined {
    return signalNumbers[sig];
}

const DEFAULT_TIMEOUT_SECONDS = 10;

export interface OutputCallback {
    (type: 'stdout' | 'stderr' | 'compile_error' | 'result' | 'done', data: string): void;
}

export interface RuntimeOptions {
    nmifc?: boolean;
    labelFormat?: string;
    timeout?: number;  // seconds; always >= 1
}

export class ExecutionManager {
    private running: Map<string, ChildProcess> = new Map();
    private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();
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
            const timer = this.timeoutTimers.get(cellId);
            if (timer) {
                clearTimeout(timer);
                this.timeoutTimers.delete(cellId);
            }
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
            const timeout = (options?.timeout && options.timeout > 0) ? options.timeout : DEFAULT_TIMEOUT_SECONDS;
            runtimeArgs.push(`--timeout=${timeout}`);

            const proc = spawn('node', runtimeArgs, {
                env: { ...process.env, TROUPE: this.troupeRoot },
            });

            this.running.set(cellId, proc);

            // Safety-net hard kill: if runtime doesn't exit within timeout + 5s grace, force kill
            {
                const graceMs = (timeout + 5) * 1000;
                const timer = setTimeout(() => {
                    this.timeoutTimers.delete(cellId);
                    if (proc.exitCode === null) {
                        proc.kill('SIGKILL');
                    }
                }, graceMs);
                this.timeoutTimers.set(cellId, timer);
            }

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

            proc.on('close', (code, signal) => {
                const timer = this.timeoutTimers.get(cellId);
                if (timer) {
                    clearTimeout(timer);
                    this.timeoutTimers.delete(cellId);
                }
                this.running.delete(cellId);
                // Signal kills: SIGINT→130, SIGKILL→137, etc.
                const exitCode = code !== null ? code
                    : signal ? 128 + (signalNumber(signal) || 0)
                    : 0;
                onOutput('done', String(exitCode));
                resolve();
            });

            proc.on('error', (err) => {
                const timer = this.timeoutTimers.get(cellId);
                if (timer) {
                    clearTimeout(timer);
                    this.timeoutTimers.delete(cellId);
                }
                this.running.delete(cellId);
                onOutput('stderr', `Failed to start runtime: ${err.message}\n`);
                onOutput('done', '1');
                resolve();
            });
        });
    }
}
