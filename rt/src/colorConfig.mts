import chalk from 'chalk';
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';

let colorConfigured = false;

export function configureColors(): void {
    if (colorConfigured) return; // Ensure we only configure once

    const argv = getCliArgs();

    // NO_COLOR environment variable (standard from no-color.org)
    // Any non-empty value disables colors
    // CLI flag --disable-color overrides everything
    if (process.env.NO_COLOR || argv[TroupeCliArg.NoColor]) {
        chalk.level = 0; // Disable all colors
    }

    colorConfigured = true;
}

export function isColorEnabled(): boolean {
    const argv = getCliArgs();
    return !(process.env.NO_COLOR || argv[TroupeCliArg.NoColor]);
}