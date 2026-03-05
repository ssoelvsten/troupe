#!/usr/bin/env node
/**
 * Automated tests for the --result-socket CLI feature.
 * Tests that the Troupe runtime communicates lifecycle events
 * through a Unix domain socket.
 */

import * as net from 'node:net';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Walk up from this file's directory to find the repo root (marked by .troupe-root)
function findTroupeRoot() {
    let dir = resolve(import.meta.dirname, '..', '..', '..');
    // Verify we found the right root by checking for .troupe-root marker
    if (existsSync(join(dir, '.troupe-root'))) return dir;
    // Fallback: walk up further (e.g., in worktrees)
    let parent = resolve(dir, '..');
    while (parent !== dir) {
        if (existsSync(join(parent, '.troupe-root'))) return parent;
        dir = parent;
        parent = resolve(dir, '..');
    }
    // Last resort: use the relative path
    return resolve(import.meta.dirname, '..', '..', '..');
}

const TROUPE_ROOT = findTroupeRoot();
const TROUPEC = join(TROUPE_ROOT, 'bin', 'troupec');
const RUNTIME = join(TROUPE_ROOT, 'rt', 'built', 'troupe.mjs');
const TEST_DIR = import.meta.dirname;

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Compiles a .trp file to .js, returns the output path.
 */
function compile(trpFile) {
    const outFile = join(tmpdir(), `troupe-test-${randomUUID().slice(0, 8)}.js`);
    execSync(`"${TROUPEC}" "${trpFile}" --output="${outFile}"`, {
        env: { ...process.env, TROUPE: TROUPE_ROOT },
        stdio: 'pipe',
    });
    return outFile;
}

/**
 * Creates a Unix socket server, runs the runtime with --result-socket,
 * and collects all messages + stdout/stderr.
 *
 * Returns { messages, stdout, stderr, exitCode }
 */
function runWithSocket(jsFile, extraArgs = []) {
    return new Promise(async (resolveTest) => {
        const socketPath = join(tmpdir(), `troupe-test-sock-${randomUUID().slice(0, 8)}.sock`);
        await unlink(socketPath).catch(() => {});

        const messages = [];
        let stdout = '';
        let stderr = '';
        let socketBuffer = '';

        const server = net.createServer((conn) => {
            conn.on('data', (chunk) => {
                socketBuffer += chunk.toString();
                let idx;
                while ((idx = socketBuffer.indexOf('\n')) !== -1) {
                    const line = socketBuffer.slice(0, idx);
                    socketBuffer = socketBuffer.slice(idx + 1);
                    if (!line) continue;
                    try {
                        messages.push(JSON.parse(line));
                    } catch {}
                }
            });
        });

        await new Promise((res) => server.listen(socketPath, res));

        const args = [
            '--stack-trace-limit=1000',
            RUNTIME,
            '-f=' + jsFile,
            '--localonly',
            '--suppress-local-info-message',
            `--result-socket=${socketPath}`,
            ...extraArgs,
        ];

        const proc = spawn('node', args, {
            env: { ...process.env, TROUPE: TROUPE_ROOT },
        });

        proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            server.close();
            unlink(socketPath).catch(() => {});
            unlink(jsFile).catch(() => {});
            resolveTest({ messages, stdout, stderr, exitCode: code ?? 0 });
        });

        // Safety timeout
        setTimeout(() => {
            proc.kill('SIGKILL');
        }, 30000);
    });
}

/**
 * Runs the runtime WITHOUT --result-socket and captures stdout.
 */
function runWithoutSocket(jsFile, extraArgs = []) {
    return new Promise((resolveTest) => {
        const args = [
            '--stack-trace-limit=1000',
            RUNTIME,
            '-f=' + jsFile,
            '--localonly',
            '--suppress-local-info-message',
            ...extraArgs,
        ];

        let stdout = '';
        let stderr = '';

        const proc = spawn('node', args, {
            env: { ...process.env, TROUPE: TROUPE_ROOT },
        });

        proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            unlink(jsFile).catch(() => {});
            resolveTest({ stdout, stderr, exitCode: code ?? 0 });
        });

        setTimeout(() => {
            proc.kill('SIGKILL');
        }, 30000);
    });
}

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL: ${name}`);
        console.log(`        ${err.message}`);
    }
}

// ---- Tests ----

console.log('Result Socket Tests');
console.log('===================');

await test('Simple program: receives main-thread-result and process-exit', async () => {
    const jsFile = compile(join(TEST_DIR, 'simple.trp'));
    const { messages, stdout } = await runWithSocket(jsFile);

    const resultMsg = messages.find(m => m.type === 'main-thread-result');
    assert(resultMsg, 'should receive a main-thread-result message');
    assert(resultMsg.value.includes('42'), `result value should contain 42, got: ${resultMsg.value}`);

    const exitMsg = messages.find(m => m.type === 'process-exit');
    assert(exitMsg, 'should receive a process-exit message');
    assert(exitMsg.exitCode === 0, `exit code should be 0, got: ${exitMsg.exitCode}`);

    assert(!stdout.includes('Main thread finished'), 'stdout should NOT contain "Main thread finished" when socket is used');
});

await test('Simple program: message ordering (result before exit)', async () => {
    const jsFile = compile(join(TEST_DIR, 'simple.trp'));
    const { messages } = await runWithSocket(jsFile);

    const resultIdx = messages.findIndex(m => m.type === 'main-thread-result');
    const exitIdx = messages.findIndex(m => m.type === 'process-exit');
    assert(resultIdx >= 0, 'should have main-thread-result');
    assert(exitIdx >= 0, 'should have process-exit');
    assert(resultIdx < exitIdx, `main-thread-result (idx ${resultIdx}) should come before process-exit (idx ${exitIdx})`);
});

await test('Multi-thread: main finishes before child thread drains', async () => {
    const jsFile = compile(join(TEST_DIR, 'multithread.trp'));
    const { messages } = await runWithSocket(jsFile);

    const resultMsg = messages.find(m => m.type === 'main-thread-result');
    assert(resultMsg, 'should receive a main-thread-result message');
    assert(resultMsg.value.includes('100'), `result value should contain 100, got: ${resultMsg.value}`);

    const exitMsg = messages.find(m => m.type === 'process-exit');
    assert(exitMsg, 'should receive a process-exit message');
    assert(exitMsg.exitCode === 0, `exit code should be 0, got: ${exitMsg.exitCode}`);
});

await test('Timeout: sends process-exit with reason timeout', async () => {
    const jsFile = compile(join(TEST_DIR, 'longrunning.trp'));
    const { messages, exitCode } = await runWithSocket(jsFile, ['--timeout=1']);

    const exitMsg = messages.find(m => m.type === 'process-exit');
    assert(exitMsg, 'should receive a process-exit message');
    assert(exitMsg.exitCode === 124, `exit code should be 124, got: ${exitMsg.exitCode}`);
    assert(exitMsg.reason === 'timeout', `reason should be "timeout", got: ${exitMsg.reason}`);
    assert(exitCode === 124, `process exit code should be 124, got: ${exitCode}`);
});

await test('Regression: stdout shows "Main thread finished" without --result-socket', async () => {
    const jsFile = compile(join(TEST_DIR, 'simple.trp'));
    const { stdout } = await runWithoutSocket(jsFile);

    assert(stdout.includes('Main thread finished'), 'stdout should contain "Main thread finished" when socket is NOT used');
    assert(stdout.includes('42'), `stdout should contain the value 42, got: ${stdout}`);
});

// ---- Summary ----

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
