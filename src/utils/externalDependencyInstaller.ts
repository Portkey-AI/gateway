import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface DependencyInstallResult {
  success: boolean;
  installed: Record<string, string>;
  failed: Record<string, string>;
  peerDependencyMismatches: Record<string, string>;
}

/**
 * Installs dependencies for external middleware/plugins directories
 *
 * This function:
 * 1. Scans directories for package.json files
 * 2. Validates peer dependencies against gateway's dependencies
 * 3. Runs `npm install --no-save` in each directory with a package.json
 * 4. Returns installation status with clear error messages
 *
 * @param directories - Array of directory paths to scan for package.json files
 * @param gatewayPackageJson - The gateway's package.json dependencies object
 * @returns Installation result with success/failed/mismatch records
 */
export async function installExternalDependencies(
  directories: string[],
  gatewayPackageJson: Record<string, any>
): Promise<DependencyInstallResult> {
  const result: DependencyInstallResult = {
    success: true,
    installed: {},
    failed: {},
    peerDependencyMismatches: {},
  };

  // Check both dependencies and devDependencies for peer dependency validation
  const gatewayDeps = {
    ...(gatewayPackageJson.dependencies || {}),
    ...(gatewayPackageJson.devDependencies || {}),
  };

  for (const dir of directories) {
    const absoluteDir = path.resolve(dir);

    // Check if directory exists
    if (!fs.existsSync(absoluteDir)) {
      result.failed[dir] = `Directory not found: ${absoluteDir}`;
      result.success = false;
      continue;
    }

    // Check if package.json exists in this directory
    const packageJsonPath = path.join(absoluteDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      // No package.json in this directory - skip (external package may not have dependencies)
      continue;
    }

    // Read package.json
    let packageJson: Record<string, any>;
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (error: any) {
      result.failed[dir] = `Failed to parse package.json: ${error.message}`;
      result.success = false;
      continue;
    }

    // Validate peer dependencies
    const peerDeps = packageJson.peerDependencies || {};
    const mismatches: string[] = [];

    for (const [peerName, peerVersion] of Object.entries(peerDeps)) {
      const gatewayVersion = gatewayDeps[peerName];

      if (!gatewayVersion) {
        mismatches.push(
          `Peer dependency "${peerName}@${peerVersion}" not found in gateway`
        );
      } else if (!isVersionCompatible(gatewayVersion, String(peerVersion))) {
        mismatches.push(
          `Peer dependency "${peerName}": expected "${peerVersion}", gateway has "${gatewayVersion}"`
        );
      }
    }

    if (mismatches.length > 0) {
      result.peerDependencyMismatches[dir] = mismatches.join('; ');
      result.success = false;
      continue;
    }

    // Check if dependencies are already installed or not needed
    const nodeModulesPath = path.join(absoluteDir, 'node_modules');
    const deps = packageJson.dependencies || {};
    const depNames = Object.keys(deps);

    // Skip if no dependencies defined
    if (depNames.length === 0) {
      console.log(`  ✓ No dependencies in ${dir}, skipping`);
      result.installed[dir] = 'No dependencies (skipped)';
      continue;
    }

    // Skip if all dependencies already installed
    if (fs.existsSync(nodeModulesPath)) {
      const hasAllDeps = depNames.every((dep) =>
        fs.existsSync(path.join(nodeModulesPath, dep))
      );
      if (hasAllDeps) {
        console.log(`  ✓ Dependencies already installed in ${dir}, skipping`);
        result.installed[dir] = 'Already installed (skipped)';
        continue;
      }
    }

    // Install dependencies
    try {
      console.log(`  📦 Installing dependencies in ${dir}...`);
      console.log(`     Working directory: ${absoluteDir}`);

      // Check npm availability
      try {
        const npmVersion = execSync('npm --version', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        console.log(`     npm version available: ${npmVersion}`);
      } catch (npmCheckError) {
        console.warn(`     ⚠️  Could not check npm version: ${npmCheckError}`);
      }

      // Log files before installation
      const filesBefore = fs.readdirSync(absoluteDir);
      console.log(`     Files before install: ${filesBefore.length} items`);

      const npmOutput = execSync('npm install --no-save 2>&1', {
        cwd: absoluteDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      console.log(`     npm output length: ${npmOutput.length} characters`);
      if (npmOutput.length > 0) {
        console.log(
          `     npm output (first 200 chars): ${npmOutput.substring(0, 200)}`
        );
      } else {
        console.log(`     npm output was empty`);
      }

      // Log files after installation
      const filesAfter = fs.readdirSync(absoluteDir);
      console.log(`     Files after install: ${filesAfter.length} items`);
      const hasNodeModules = fs.existsSync(
        path.join(absoluteDir, 'node_modules')
      );
      console.log(`     node_modules exists: ${hasNodeModules}`);

      // Check if there were any significant errors in the output
      if (npmOutput.includes('ERR!') || npmOutput.includes('error')) {
        result.failed[dir] =
          'npm install reported errors: ' + npmOutput.split('\n')[0];
        result.success = false;
        console.error(`  ✗ Failed to install dependencies in ${dir}`);
        console.error('    ' + npmOutput.split('\n').slice(-5).join('\n    '));
      } else if (!hasNodeModules) {
        // npm succeeded but node_modules wasn't created
        result.failed[dir] =
          'npm install completed but node_modules was not created';
        result.success = false;
        console.error(
          `  ✗ npm install completed but node_modules not created in ${dir}`
        );
        console.error(`     Full npm output: ${npmOutput}`);
      } else {
        result.installed[dir] = 'Successfully installed';
        console.log(`  ✓ Dependencies installed in ${dir}`);
      }
    } catch (error: any) {
      result.failed[dir] = error.toString() || 'npm install failed';
      result.success = false;
      console.error(`  ✗ Failed to install dependencies in ${dir}`);
      console.error(`     Error: ${error.toString()}`);
      // Print last few lines of error output
      if (error.stdout) {
        console.error(
          '    stdout: ' +
            error.stdout.toString().split('\n').slice(-3).join('\n    ')
        );
      }
      if (error.stderr) {
        console.error(
          '    stderr: ' +
            error.stderr.toString().split('\n').slice(-3).join('\n    ')
        );
      }
    }
  }

  return result;
}

/**
 * Check if a gateway version satisfies a peer dependency version requirement
 *
 * Supports common semver patterns like:
 * - ^1.2.3 (caret - allows compatible versions)
 * - ~1.2.3 (tilde - allows patch updates)
 * - 1.2.3 (exact match)
 * - >=1.2.3 (greater than or equal)
 *
 * @param gatewayVersion - The version from gateway's package.json
 * @param peerVersion - The required version from peer dependency
 * @returns true if versions are compatible
 */
function isVersionCompatible(
  gatewayVersion: string,
  peerVersion: string
): boolean {
  // Remove 'v' prefix and operators if present
  gatewayVersion = gatewayVersion.replace(/^[v~^>=]+/, '');
  peerVersion = peerVersion.replace(/^v/, '');

  // Handle exact match (e.g., "1.2.3")
  if (!peerVersion.match(/^[~^>=]/)) {
    return (
      parseVersion(gatewayVersion).major === parseVersion(peerVersion).major &&
      parseVersion(gatewayVersion).minor === parseVersion(peerVersion).minor &&
      parseVersion(gatewayVersion).patch === parseVersion(peerVersion).patch
    );
  }

  // Extract operator and version
  const match = peerVersion.match(/^([~^>=]+)(.+)$/);
  if (!match) return false;

  const operator = match[1];
  const requiredVersion = match[2];

  const gatewayVer = parseVersion(gatewayVersion);
  const requiredVer = parseVersion(requiredVersion);

  switch (operator) {
    case '^': // Caret: allows changes that don't modify the left-most non-zero digit
      return (
        gatewayVer.major === requiredVer.major &&
        (gatewayVer.minor > requiredVer.minor ||
          (gatewayVer.minor === requiredVer.minor &&
            gatewayVer.patch >= requiredVer.patch))
      );
    case '~': // Tilde: allows patch-level changes
      return (
        gatewayVer.major === requiredVer.major &&
        gatewayVer.minor === requiredVer.minor &&
        gatewayVer.patch >= requiredVer.patch
      );
    case '>=':
      return (
        gatewayVer.major > requiredVer.major ||
        (gatewayVer.major === requiredVer.major &&
          gatewayVer.minor > requiredVer.minor) ||
        (gatewayVer.major === requiredVer.major &&
          gatewayVer.minor === requiredVer.minor &&
          gatewayVer.patch >= requiredVer.patch)
      );
    case '=':
    case '==':
      return (
        gatewayVer.major === requiredVer.major &&
        gatewayVer.minor === requiredVer.minor &&
        gatewayVer.patch === requiredVer.patch
      );
    default:
      return false;
  }
}

/**
 * Parse a semantic version string into components
 */
function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10),
  };
}
