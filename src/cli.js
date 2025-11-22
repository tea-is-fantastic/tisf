import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * Creates a simplified CLI entry point.
 * @param {string} usage - The usage string (e.g. "npx @nocd/n")
 * @param {Object} [args] - Positional arguments (maps to command builder)
 * @param {Object} [options] - Flags/Options (maps to .options)
 */
export const handleCLI = (usage, args = {}, options = {}) => {
  const argKeys = Object.keys(args);
  const commandParams = argKeys.map(key => {
    // Check if 'default' is a key in the config object
    const isOptional = 'default' in args[key];
    return isOptional ? `[${key}]` : `<${key}>`;
  }).join(' ');

  const commandStr = argKeys.length > 0 
    ? `$0 ${commandParams}` 
    : '$0';

  return yargs(hideBin(process.argv))
    .scriptName(usage)
    .usage(`Usage: ${usage} ${argKeys.length ? '<args> ' : ''}[options]`)
    .command(commandStr, '', (y) => {
      Object.entries(args).forEach(([key, config]) => {
        y.positional(key, config);
      });
    })    
    .options(options)
    .help('h')
    .parse();
};