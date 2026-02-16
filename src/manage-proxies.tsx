import { useState, useEffect, useCallback, useMemo } from "react";
import {
  List,
  Icon,
  Color,
  Action,
  ActionPanel,
  showToast,
  Toast,
  getPreferenceValues,
} from "@raycast/api";
import {
  getProxies,
  parseProxyGroups,
  selectProxy,
  getProxyDelay,
  getLatestDelay,
  formatDelay,
  ProxyGroup,
  ProxyItem,
} from "./utils/api";

// --- Preferences ---

interface ProxyPreferences {
  defaultSearchMode: "groups" | "nodes";
}

// --- Delay color coding ---

function delayColor(delay: number): Color {
  if (delay <= 0) return Color.SecondaryText;
  if (delay < 200) return Color.Green;
  if (delay < 500) return Color.Yellow;
  return Color.Red;
}

function delayIcon(delay: number): Icon {
  if (delay <= 0) return Icon.Circle;
  if (delay < 200) return Icon.CircleFilled;
  if (delay < 500) return Icon.CircleProgress75;
  return Icon.CircleProgress25;
}

// --- Type display names ---

function groupTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    Selector: "Selector",
    URLTest: "Auto Test",
    Fallback: "Fallback",
    LoadBalance: "Load Balance",
  };
  return labels[type] || type;
}

function proxyTypeTag(type: string): string {
  const tags: Record<string, string> = {
    Shadowsocks: "SS",
    ShadowsocksR: "SSR",
    Vmess: "VMess",
    Vless: "VLESS",
    Trojan: "Trojan",
    Hysteria: "Hysteria",
    Hysteria2: "Hy2",
    WireGuard: "WG",
    Tuic: "TUIC",
    Direct: "Direct",
    Reject: "Reject",
    Relay: "Relay",
    Selector: "Group",
    URLTest: "Auto",
    Fallback: "FB",
    LoadBalance: "LB",
  };
  return tags[type] || type;
}

// --- Search logic ---

/**
 * Parse search text to determine search mode and keyword.
 * - Default mode searches the defaultSearchMode type directly.
 * - Prefix with ":" to search the other type.
 *   e.g. if default is "groups", typing ":Japan" searches nodes.
 */
function parseSearch(
  searchText: string,
  defaultMode: "groups" | "nodes",
): { mode: "groups" | "nodes"; keyword: string } {
  if (searchText.startsWith(":")) {
    const altMode = defaultMode === "groups" ? "nodes" : "groups";
    return { mode: altMode, keyword: searchText.slice(1).trim() };
  }
  return { mode: defaultMode, keyword: searchText.trim() };
}

// --- Main Command ---

export default function ManageProxies() {
  const prefs = getPreferenceValues<ProxyPreferences>();
  const defaultSearchMode = prefs.defaultSearchMode || "groups";

  const [groups, setGroups] = useState<ProxyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");

  const fetchProxies = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getProxies();
      const parsed = parseProxyGroups(data);
      setGroups(parsed);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch proxies",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const handleSelect = async (groupName: string, proxyName: string) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Switching proxy...",
      });
      await selectProxy(groupName, proxyName);
      await fetchProxies();
      showToast({
        style: Toast.Style.Success,
        title: "Proxy switched",
        message: `${groupName} → ${proxyName}`,
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to switch proxy",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleTestDelay = async (proxyName: string) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: `Testing ${proxyName}...`,
      });
      const result = await getProxyDelay(proxyName);
      showToast({
        style: Toast.Style.Success,
        title: `${proxyName}`,
        message: `Delay: ${formatDelay(result.delay)}`,
      });
      await fetchProxies();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: `${proxyName}: timeout`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleTestAllDelays = async (group: ProxyGroup) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: `Testing all proxies in ${group.name}...`,
      });
      const promises = group.all.map(async (name) => {
        try {
          await getProxyDelay(name);
        } catch {
          // ignore individual failures
        }
      });
      await Promise.allSettled(promises);
      await fetchProxies();
      showToast({
        style: Toast.Style.Success,
        title: "Delay test complete",
        message: group.name,
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to test delays",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // --- Filtered data based on search ---

  const { mode: searchMode, keyword } = parseSearch(
    searchText,
    defaultSearchMode,
  );

  // When the dropdown selects a specific group, show that group's nodes
  const currentGroup = groups.find((g) => g.name === selectedGroup);

  const filteredData = useMemo(() => {
    const lowerKeyword = keyword.toLowerCase();

    // If a specific group is selected via dropdown, always show its nodes
    if (selectedGroup && currentGroup) {
      if (!keyword)
        return { type: "single-group" as const, group: currentGroup };
      // Filter nodes within the selected group
      const filteredProxies = currentGroup.proxies.filter((p) =>
        p.name.toLowerCase().includes(lowerKeyword),
      );
      return {
        type: "single-group" as const,
        group: { ...currentGroup, proxies: filteredProxies },
      };
    }

    // No dropdown selection — use search mode
    if (!keyword) {
      // No search text → show all groups with all nodes
      return { type: "all-groups" as const, groups };
    }

    if (searchMode === "groups") {
      // Filter groups by name
      const filtered = groups.filter((g) =>
        g.name.toLowerCase().includes(lowerKeyword),
      );
      return { type: "all-groups" as const, groups: filtered };
    } else {
      // Search nodes across all groups
      const results: { group: ProxyGroup; proxy: ProxyItem }[] = [];
      for (const group of groups) {
        for (const proxy of group.proxies) {
          if (proxy.name.toLowerCase().includes(lowerKeyword)) {
            results.push({ group, proxy });
          }
        }
      }
      return { type: "node-search" as const, results };
    }
  }, [groups, selectedGroup, currentGroup, searchMode, keyword]);

  // Dynamic placeholder hint
  const altType = defaultSearchMode === "groups" ? "nodes" : "groups";
  const placeholderHint = `Search ${defaultSearchMode}... (prefix ":" to search ${altType})`;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={placeholderHint}
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Proxy Group"
          value={selectedGroup}
          onChange={setSelectedGroup}
        >
          <List.Dropdown.Item title="All Groups" value="" />
          {groups.map((group) => (
            <List.Dropdown.Item
              key={group.name}
              title={`${group.name} (${groupTypeLabel(group.type)})`}
              value={group.name}
            />
          ))}
        </List.Dropdown>
      }
    >
      {filteredData.type === "single-group" ? (
        <List.Section
          title={filteredData.group.name}
          subtitle={`${groupTypeLabel(filteredData.group.type)} · Current: ${filteredData.group.now}`}
        >
          {filteredData.group.proxies.map((proxy) => {
            const delay = getLatestDelay(proxy);
            const isActive = proxy.name === filteredData.group.now;
            return (
              <List.Item
                key={proxy.name}
                title={proxy.name}
                subtitle={proxyTypeTag(proxy.type)}
                icon={{
                  source: isActive ? Icon.CheckCircle : delayIcon(delay),
                  tintColor: isActive ? Color.Green : delayColor(delay),
                }}
                accessories={[
                  ...(delay > 0
                    ? [
                        {
                          text: {
                            value: formatDelay(delay),
                            color: delayColor(delay),
                          },
                        },
                      ]
                    : []),
                  ...(isActive
                    ? [{ tag: { value: "Active", color: Color.Green } }]
                    : []),
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Switch to This Node"
                      icon={Icon.ArrowRight}
                      onAction={() =>
                        handleSelect(filteredData.group.name, proxy.name)
                      }
                    />
                    <Action
                      title="Test Delay"
                      icon={Icon.Stopwatch}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => handleTestDelay(proxy.name)}
                    />
                    <Action
                      title="Test All Delays"
                      icon={Icon.Signal3}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
                      onAction={() => handleTestAllDelays(filteredData.group)}
                    />
                    <Action
                      title="Refresh"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={fetchProxies}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : filteredData.type === "node-search" ? (
        // Node search results — flat list with group tag
        <List.Section
          title="Node Search Results"
          subtitle={`${filteredData.results.length} matches`}
        >
          {filteredData.results.map(({ group, proxy }) => {
            const delay = getLatestDelay(proxy);
            const isActive = proxy.name === group.now;
            return (
              <List.Item
                key={`${group.name}-${proxy.name}`}
                title={proxy.name}
                subtitle={proxyTypeTag(proxy.type)}
                icon={{
                  source: isActive ? Icon.CheckCircle : delayIcon(delay),
                  tintColor: isActive ? Color.Green : delayColor(delay),
                }}
                accessories={[
                  ...(delay > 0
                    ? [
                        {
                          text: {
                            value: formatDelay(delay),
                            color: delayColor(delay),
                          },
                        },
                      ]
                    : []),
                  ...(isActive
                    ? [{ tag: { value: "Active", color: Color.Green } }]
                    : []),
                  { tag: group.name },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Switch to This Node"
                      icon={Icon.ArrowRight}
                      onAction={() => handleSelect(group.name, proxy.name)}
                    />
                    <Action
                      title={`View All ${group.name} Nodes`}
                      icon={Icon.List}
                      onAction={() => {
                        setSelectedGroup(group.name);
                        setSearchText("");
                      }}
                    />
                    <Action
                      title="Test Delay"
                      icon={Icon.Stopwatch}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => handleTestDelay(proxy.name)}
                    />
                    <Action
                      title="Refresh"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={fetchProxies}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : (
        // All groups view — show every node, no truncation
        filteredData.groups.map((group) => (
          <List.Section
            key={group.name}
            title={group.name}
            subtitle={`${groupTypeLabel(group.type)} · ${group.all.length} nodes · Current: ${group.now}`}
          >
            {group.proxies.map((proxy) => {
              const delay = getLatestDelay(proxy);
              const isActive = proxy.name === group.now;
              return (
                <List.Item
                  key={`${group.name}-${proxy.name}`}
                  title={proxy.name}
                  subtitle={proxyTypeTag(proxy.type)}
                  icon={{
                    source: isActive ? Icon.CheckCircle : delayIcon(delay),
                    tintColor: isActive ? Color.Green : delayColor(delay),
                  }}
                  accessories={[
                    ...(delay > 0
                      ? [
                          {
                            text: {
                              value: formatDelay(delay),
                              color: delayColor(delay),
                            },
                          },
                        ]
                      : []),
                    ...(isActive
                      ? [{ tag: { value: "Active", color: Color.Green } }]
                      : []),
                    { tag: group.name },
                  ]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Switch to This Node"
                        icon={Icon.ArrowRight}
                        onAction={() => handleSelect(group.name, proxy.name)}
                      />
                      <Action
                        title={`View Only ${group.name}`}
                        icon={Icon.List}
                        onAction={() => setSelectedGroup(group.name)}
                      />
                      <Action
                        title="Test Delay"
                        icon={Icon.Stopwatch}
                        shortcut={{ modifiers: ["cmd"], key: "t" }}
                        onAction={() => handleTestDelay(proxy.name)}
                      />
                      <Action
                        title="Test All Delays"
                        icon={Icon.Signal3}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
                        onAction={() => handleTestAllDelays(group)}
                      />
                      <Action
                        title="Refresh"
                        icon={Icon.ArrowClockwise}
                        shortcut={{ modifiers: ["cmd"], key: "r" }}
                        onAction={fetchProxies}
                      />
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}
