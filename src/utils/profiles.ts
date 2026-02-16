import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import { exec } from "child_process";

// --- Types ---

export interface ProfileItem {
  uid: string;
  type: "remote" | "local" | "merge" | "script";
  name?: string;
  desc?: string;
  url?: string;
  file?: string;
  updated?: number;
  selected?: { name: string; now: string }[];
  option?: {
    update_interval?: number;
    user_agent?: string;
    with_proxy?: boolean;
    self_proxy?: boolean;
  };
  extra?: {
    upload?: number;
    download?: number;
    total?: number;
    expire?: number;
  };
}

export interface ProfilesConfig {
  current?: string;
  items?: ProfileItem[];
}

export interface VergeConfig {
  clash_core?: string;
  language?: string;
  theme_mode?: string;
  [key: string]: unknown;
}

// --- Paths ---

function getClashVergeDir(): string {
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "io.github.clash-verge-rev.clash-verge-rev");
}

function getProfilesYamlPath(): string {
  return path.join(getClashVergeDir(), "profiles.yaml");
}

function getVergeYamlPath(): string {
  return path.join(getClashVergeDir(), "verge.yaml");
}

// --- Read/Write ---

/** Read and parse profiles.yaml */
export function readProfiles(): ProfilesConfig {
  const filePath = getProfilesYamlPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Profiles config not found at: ${filePath}\nPlease make sure Clash Verge Rev is installed.`,
    );
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return (yaml.load(content) as ProfilesConfig) || { items: [] };
}

/** Read and parse verge.yaml */
export function readVergeConfig(): VergeConfig {
  const filePath = getVergeYamlPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return (yaml.load(content) as VergeConfig) || {};
}

/** Write profiles.yaml - activate a profile by UID */
export function activateProfile(uid: string): void {
  const filePath = getProfilesYamlPath();
  const profiles = readProfiles();

  // Verify the profile exists
  const exists = profiles.items?.some((item) => item.uid === uid);
  if (!exists) {
    throw new Error(`Profile with UID "${uid}" not found`);
  }

  profiles.current = uid;
  const yamlStr = yaml.dump(profiles, { lineWidth: -1 });
  fs.writeFileSync(filePath, yamlStr, "utf-8");
}

/** Get the currently active profile */
export function getCurrentProfile(
  profiles: ProfilesConfig,
): ProfileItem | undefined {
  if (!profiles.current || !profiles.items) return undefined;
  return profiles.items.find((item) => item.uid === profiles.current);
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Format timestamp to locale string */
export function formatTime(timestamp: number): string {
  if (!timestamp) return "Never";
  return new Date(timestamp * 1000).toLocaleString();
}

/** Format expiration info */
export function formatExpire(timestamp: number): string {
  if (!timestamp) return "No expiration";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays <= 30) return `${diffDays} days left`;
  return date.toLocaleDateString();
}

/** Get traffic usage string */
export function getTrafficInfo(profile: ProfileItem): string | undefined {
  if (!profile.extra) return undefined;
  const { upload = 0, download = 0, total = 0 } = profile.extra;
  const used = upload + download;
  if (total === 0) return `Used: ${formatBytes(used)}`;
  const percentage = ((used / total) * 100).toFixed(1);
  return `${formatBytes(used)} / ${formatBytes(total)} (${percentage}%)`;
}

/** Get Clash Verge Rev config directory path */
export function getConfigDir(): string {
  return getClashVergeDir();
}

/** Helper to run a shell command and return stdout */
function runCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Shell] Command failed: ${cmd}`, stderr);
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Restart Clash Verge Rev application.
 * 1. Get exe path from running process
 * 2. Kill the process
 * 3. Wait briefly
 * 4. Relaunch
 */
export async function restartClashVerge(): Promise<void> {
  console.log("[Restart] Starting Clash Verge Rev restart...");

  // Step 1: Get executable path from running process
  let exePath = "";
  try {
    // Process name is "clash-verge" (hyphenated, no .exe)
    const psCmd = `powershell -NoProfile -Command "(Get-Process 'clash-verge' -ErrorAction SilentlyContinue | Select-Object -First 1).Path"`;
    exePath = await runCommand(psCmd);
    console.log("[Restart] Found exe path:", exePath);
  } catch {
    console.log("[Restart] Could not get exe path from running process");
  }

  // Fallback: try common install locations
  if (!exePath) {
    const candidates = [
      path.join(
        os.homedir(),
        "AppData",
        "Local",
        "Clash Verge",
        "clash-verge.exe",
      ),
      path.join(
        os.homedir(),
        "AppData",
        "Local",
        "clash-verge",
        "clash-verge.exe",
      ),
      "C:\\Program Files\\Clash Verge\\clash-verge.exe",
      "C:\\Program Files (x86)\\Clash Verge\\clash-verge.exe",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        exePath = candidate;
        console.log("[Restart] Found exe at fallback path:", exePath);
        break;
      }
    }
  }

  // Step 2: Kill existing process
  try {
    await runCommand('taskkill /f /im "clash-verge.exe"');
    console.log("[Restart] Killed Clash Verge process");
  } catch {
    console.log("[Restart] No Clash Verge process to kill (or kill failed)");
  }

  // Note: verge-mihomo.exe is managed by clash-verge-service.exe
  // and will be restarted automatically when Clash Verge relaunches

  // Step 3: Wait for process to fully exit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 4: Relaunch
  if (exePath && fs.existsSync(exePath)) {
    console.log("[Restart] Relaunching:", exePath);
    exec(`start "" "${exePath}"`, { encoding: "utf-8" });
  } else {
    // Fallback: try using Start Menu shortcut
    console.log("[Restart] Using Start Menu shortcut to relaunch");
    exec('start "" "Clash Verge"', { shell: "cmd.exe", encoding: "utf-8" });
  }

  // Wait for app to initialize and process configs
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("[Restart] Restart complete");
}
