import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";

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
