import { spawn } from 'child_process';

/**
 * Executes a shell command.
 * * @param {string} command - The command to run (e.g., 'git', 'npm')
 * @param {string[]} args - Array of arguments (e.g., ['commit', '-m', 'message'])
 * @param {Object} options - Configuration options
 * @param {boolean} [options.capture=false] - If true, returns stdout/stderr string instead of printing to console.
 * @param {string} [options.cwd] - Current working directory.
 * @param {Object} [options.env] - Environment variables (defaults to process.env).
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export const execute = (command, args = [], options = {}) => {
    // Merge defaults
    const config = {
        cwd: process.cwd(),
        env: process.env,
        capture: false,
        shell: process.platform === 'win32', // Handle Windows compatibility
        ...options
    };

    return new Promise((resolve, reject) => {
        // Determine IO mode: 'pipe' allows us to capture, 'inherit' streams to console
        const stdioMode = config.capture ? 'pipe' : 'inherit';

        const child = spawn(command, args, {
            cwd: config.cwd,
            env: config.env,
            shell: config.shell,
            stdio: [
                'inherit',   // stdin: always inherit so we can interact if needed (unless piping input)
                stdioMode,   // stdout
                stdioMode    // stderr
            ]
        });

        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Capture output if requested
        if (config.capture) {
            child.stdout.on('data', (data) => { stdoutBuffer += data.toString(); });
            child.stderr.on('data', (data) => { stderrBuffer += data.toString(); });
        }

        // Handle execution errors (e.g., command not found)
        child.on('error', (error) => {
            reject(new Error(`Failed to start command "${command}": ${error.message}`));
        });

        // Handle process completion
        child.on('close', (code) => {
            const result = {
                code,
                stdout: stdoutBuffer.trim(),
                stderr: stderrBuffer.trim()
            };

            if (code === 0) {
                resolve(result);
            } else {
                // Attach the output to the error so the caller can debug what went wrong
                const error = new Error(`Command "${command}" exited with code ${code}`);
                error.code = code;
                error.stdout = result.stdout;
                error.stderr = result.stderr;
                reject(error);
            }
        });
    });
};