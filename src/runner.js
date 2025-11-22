import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const runner = async (pkg, scr, args) => {
  // 1. Capture arguments meant for the inner script
  const cwd = process.cwd();

  // 2. Create a temporary directory (Filesystem Isolation)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-node-'));
  console.log(`Checking in at: ${tempDir}`);

  try {
    // 3. Copy specific files to the isolated environment
    //    We explicitly copy only what is needed to avoid pollution
    fs.writeFileSync(path.join(tempDir, "package.json"), pkg);
    fs.writeFileSync(path.join(tempDir, "index.js"), scr);
    
    // 4. Install dependencies inside the temporary directory
    console.log('Installing dependencies...');
    execSync('npm install --silent', {
      cwd: tempDir,     // Run inside temp dir
      stdio: 'inherit'  // Show output in console
    });

    // 5. Ensure output directory exists in the temp environment
    const tempOutput = path.join(tempDir, 'output');
    fs.mkdirSync(tempOutput, { recursive: true });

    // 6. Run the script
    console.log('Running script...');
    const runResult = spawnSync('node', [
      '--experimental-permission',
      `--allow-fs-read=${tempDir}/*`,      // Can only read inside temp
      `--allow-fs-write=${tempDir}/*`,     // Can only write inside temp
      'index.js',
      ...args
    ], {
      cwd: tempDir,
      stdio: 'inherit'
    });

    if (runResult.error) throw runResult.error;

    // 7. Copy ONLY the 'output' folder back to current directory
    if (fs.existsSync(tempOutput)) {
      const dirname = v4();
      
      const localOutput = path.join(cwd, dirname);

      // Clear previous local output
      fs.rmSync(localOutput, { recursive: true, force: true });

      // Copy new output (Requires Node v16.7+)
      fs.cpSync(tempOutput, localOutput, { recursive: true });
      console.log('Artifacts copied to ./' + dirname);
    } else {
      console.warn('No output folder was generated.');
    }

  } catch (err) {
    console.error('Execution failed:', err.message);
  } finally {
    // 8. Cleanup: Delete the temp directory regardless of success or failure
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Failed to cleanup temp dir:', cleanupErr);
    }
  }
}