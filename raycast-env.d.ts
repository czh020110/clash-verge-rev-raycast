/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Controller Port - Mihomo external controller TCP port. On macOS, Unix socket is auto-detected first (see Controller Socket below). */
  "controllerPort": string,
  /** API Secret - Mihomo external controller secret (found in Clash Verge Rev settings) */
  "secret"?: string,
  /** Controller Socket - macOS only: Mihomo Unix socket path. Auto-detected by default. Leave empty to use TCP port instead. */
  "controllerSocket": string,
  /** Default Search Mode - Default search target in Manage Proxies. Use ':' prefix to search the other type. */
  "defaultSearchMode": "groups" | "nodes",
  /** Default Sort Order - Default sorting method for View Connections. */
  "defaultSortOrder": "downSpeed" | "upSpeed" | "download" | "upload" | "time" | "host"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `manage-proxies` command */
  export type ManageProxies = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-profiles` command */
  export type ManageProfiles = ExtensionPreferences & {}
  /** Preferences accessible in the `switch-mode` command */
  export type SwitchMode = ExtensionPreferences & {}
  /** Preferences accessible in the `view-logs` command */
  export type ViewLogs = ExtensionPreferences & {}
  /** Preferences accessible in the `view-connections` command */
  export type ViewConnections = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `manage-proxies` command */
  export type ManageProxies = {
  /** Search */
  "query": string
}
  /** Arguments passed to the `manage-profiles` command */
  export type ManageProfiles = {
  /** Profile Shortcut */
  "shortcut": string
}
  /** Arguments passed to the `switch-mode` command */
  export type SwitchMode = {}
  /** Arguments passed to the `view-logs` command */
  export type ViewLogs = {}
  /** Arguments passed to the `view-connections` command */
  export type ViewConnections = {}
}

