import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

async function main() {
  const newVersionArg = process.argv[2];

  // 1. Read package.json
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  
  let version = newVersionArg || pkg.version;
  if (!newVersionArg) {
    console.log(`Using current version: v${version}`);
  } else {
    console.log(`Upgrading to version: v${version}`);
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    // Update tauri.conf.json
    const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
    tauriConf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

    // Update Cargo.toml
    const cargoPath = path.join(rootDir, "src-tauri", "Cargo.toml");
    let cargoToml = fs.readFileSync(cargoPath, "utf-8");
    cargoToml = cargoToml.replace(/^version = ".*"/m, `version = "${version}"`);
    fs.writeFileSync(cargoPath, cargoToml);
  }

  // 2. Read Private Key
  const keyPath = path.join(rootDir, "src-tauri", "updater.key");
  if (!fs.existsSync(keyPath)) {
    console.error("Error: src-tauri/updater.key not found!");
    process.exit(1);
  }
  const privateKey = fs.readFileSync(keyPath, "utf-8").trim();

  // 3. Build & Sign Tauri release
  console.log("\n🔨 Building and cryptographically signing production release...");
  run("npx @tauri-apps/cli build", {
    CI: "true",
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  });

  // 4. Generate latest.json
  const nsisDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "nsis");
  const exeName = `ROVault_${version}_x64-setup.exe`;
  const sigPath = path.join(nsisDir, `${exeName}.sig`);

  if (!fs.existsSync(sigPath)) {
    console.error(`Error: Signature file not found at ${sigPath}`);
    process.exit(1);
  }

  const signature = fs.readFileSync(sigPath, "utf-8").trim();
  const latestJson = {
    version: version,
    notes: `Release v${version} of ROVault.`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: signature,
        url: `https://github.com/byronjreyes/rovault/releases/download/v${version}/${exeName}`,
      },
    },
  };

  const latestJsonPath = path.join(rootDir, "latest.json");
  const nsisLatestJsonPath = path.join(nsisDir, "latest.json");
  const jsonContent = JSON.stringify(latestJson, null, 2) + "\n";
  
  fs.writeFileSync(latestJsonPath, jsonContent);
  fs.writeFileSync(nsisLatestJsonPath, jsonContent);
  console.log(`\n✅ Generated updater manifest: latest.json`);

  // 5. Git Commit, Tag & Push
  try {
    console.log("\n📦 Pushing updates to Git repository...");
    run("git add .");
    try {
      run(`git commit -m "release: v${version}"`);
    } catch {
      console.log("No new code changes to commit.");
    }
    run(`git tag -f v${version}`);
    run("git push origin main --force");
    run(`git push origin v${version} --force`);
  } catch (err) {
    console.warn("Git push warning:", err.message);
  }

  const releaseUrl = `https://github.com/byronjreyes/rovault/releases/new?tag=v${version}&title=ROVault+v${version}`;

  console.log("\n" + "=".repeat(60));
  console.log(`🎉 Release v${version} is ready!`);
  console.log("=".repeat(60));
  console.log("\nOpening browser and file location for instant drag-and-drop...");
  console.log(`\nRelease URL: ${releaseUrl}`);
  console.log("\n3 Files in folder:");
  console.log(`- ${exeName}`);
  console.log(`- ${exeName}.sig`);
  console.log(`- latest.json`);
  console.log("=".repeat(60) + "\n");

  // Automatically open browser and folder on Windows
  try {
    execSync(`start "" "${releaseUrl}"`, { shell: "cmd.exe" });
  } catch {}
  try {
    execSync(`explorer.exe "${nsisDir}"`, { shell: "cmd.exe" });
  } catch {}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
