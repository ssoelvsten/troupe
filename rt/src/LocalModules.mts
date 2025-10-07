'use strict'

import assert from 'assert'
import path  from 'path';
import * as fs from 'node:fs'
const { stat, readFile } = fs.promises

import { getCliArgs, TroupeCliArg, ParsedArgs } from './TroupeCliArgs.mjs';
import { getRuntimeObject } from './SysState.mjs';
import { Level, glb, flowsTo, BOT } from './Level.mjs';
import { LVal } from './Lval.mjs'
import { __unit } from './UnitVal.mjs'
import { ThreadType, Scheduler } from './Scheduler.mjs'

import { mkLogger } from './logger.mjs'

const argv = getCliArgs();

const logLevel = argv[TroupeCliArg.Debug] ? 'debug': 'info';
const logger = mkLogger('LocalModules', logLevel);

/*************************************************************************************************\
    Types
\*************************************************************************************************/

/** Container for a module loaded from disk.
 *
 *  @todo (`require`): Extend with `ir: string` and `level: Level`.
 */
export type Module = {
  name: string,
  hash: string,
  value: LVal,
};

/** Unique module identifier. */
export type ModuleID = {
  name: string,
  hash: string,
}

/** Path to a potential match.
 *
 * @todo (`require`) Extend with `irFile: string` and `level: Level`.
 */
type LocalMatch = {
  jsFile: string,
  hashFile: string,
}

/*************************************************************************************************\
    Local modules stored on disk
\*************************************************************************************************/

/** Map for initialized modules from the disk. */
const localModules : { [hash: string]: Module } = {};

/** Whether a matching module has been loaded from disk.
 *
 * @param id  The `name` and `hash` of the module.
 *
 * @todo (`require`) @param lvl The level of access.
 */
export function hasLocalModule(id: ModuleID): boolean
{
  return localModules[id.hash] !== undefined;
}

/** Returns the matching module from disk, if it has been loaded and is accesible at that level.
 *  Otherwise, returns `undefined`.
 *
 * @param id  The `name` and `hash` of the module.
 *
 * @todo (`require`) @param lvl The level of access.
 */
export function getLocalModule(id: ModuleID): Module | undefined
{
  return localModules[id.hash];
}

/** Stores the (local) module for later access.
 *
 * @param mod The module to be stored.
 */
function setLocalModule(mod: Module): void
{
  localModules[mod.hash] = mod;
}

/** Obtain list of the matching file(s) on disk that match the desired module.
 *
 * @param id  The `name` and `hash` of the module.
 *
 * @todo (`require`) @param lvl The level of access.
 */
async function findLocalModule({ name, hash }: ModuleID): Promise<LocalMatch | undefined>
{
  let includeDir = `${process.env.TROUPE}/lib/out/`;
  if (!path.isAbsolute(includeDir)) {
    includeDir = `${process.cwd()}/${includeDir}`;
  }

  const jsFile = `${includeDir}${name}.js`;
  const hashFile = `${includeDir}${name}.hash`;

  // Filter based on file name
  if (!await stat(jsFile) || !await stat(hashFile)) {
    return undefined;
  }

  // Filter based on hash
  if (await readFile(hashFile, 'utf8') !== hash) {
    return undefined;
  }

  // TODO: Filter files based on read access to each directory / file.

  return { jsFile, hashFile };
}

/** Evaluate module with given path. If it has any dependencies, then these are loaded first via
 *  mutual recursion with `loadLocalModules`.
 *
 * @param jsFile Path of the JavaScript file.
 *
 * @todo: @param lvl The initial level of execution.
 */
async function evalLocalModule(jsFile: string): Promise<any>
{
  const rtObj = getRuntimeObject();

  // 1. Load `jsFile`
  const js = await import (jsFile);
  const Top = js.default;
  const top = new Top(rtObj.__userRuntime);

  // 2. Resolve dependencies first.
  await loadLocalModules(top);

  // 3. Schedule new thread
  const promise: Promise<LVal> = new Promise((resolve, reject) => {
    const scheduler = rtObj.__sched as Scheduler;

    scheduler.scheduleNewThread(
      () => top.main({__dataLevel: BOT})
      , __unit
      , BOT
      , BOT
      , ThreadType.Module
      , resolve
    );

    // TODO: `guard` execution to enforce purity.

    scheduler.resumeLoopAsync();
  });

  // 4. wait for the thread to finish
  return await promise;
}

/** Loads the module from the disk, if it exists. Returns `true` if succesful or if it has already
 *  been loaded previously.
 *
 * @param id The `name` and `hash` of the module.
 *
 * @todo: @param lvl The level of access.
 */
export async function loadLocalModule(id: ModuleID): Promise<boolean>
{
  if (hasLocalModule(id)) { return true; }

  const fileMatch = await findLocalModule(id);
  if (!fileMatch) { return false; }

  const { jsFile, hashFile } = fileMatch;
  const value: any = await evalLocalModule(jsFile);

  const mod: Module = { name: id.name, hash: id.hash, value };
  setLocalModule(mod);

  return true;
}

/** A troupe program as output by the compiler.
 *
 * @todo Move this type somewhere for reuse...
 */
type TroupeProgram = {
  imports: {[x : string]: string};
  requires: {[x : string]: string};
  hash: string;
};

/** Loads all local modules dependencies of the given Troupe program.
 *
 * @param top jsProgram object as output by the *troupec* compiler.
 */
export async function loadLocalModules({ imports }: TroupeProgram): Promise<boolean>
{
  const importsPromises =
    Object.keys(imports).map(name => loadLocalModule({ name, hash: imports[name] }));

  return Promise.all(importsPromises).then((vals) => vals.reduce((x,y) => x && y, true),
                                           (_) => false);
}
