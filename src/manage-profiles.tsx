import { useState, useEffect, useCallback } from "react";
import {
  List,
  Icon,
  Color,
  Action,
  ActionPanel,
  showToast,
  Toast,
  Clipboard,
  confirmAlert,
  Alert,
} from "@raycast/api";
import {
  readProfiles,
  activateProfile,
  getCurrentProfile,
  getTrafficInfo,
  formatTime,
  formatExpire,
  restartClashVerge,
  ProfileItem,
  ProfilesConfig,
} from "./utils/profiles";

// --- Type icons ---

function profileTypeIcon(type: string): Icon {
  switch (type) {
    case "remote":
      return Icon.Globe;
    case "local":
      return Icon.Document;
    case "merge":
      return Icon.Layers;
    case "script":
      return Icon.Code;
    default:
      return Icon.Document;
  }
}

function profileTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    remote: "Remote",
    local: "Local",
    merge: "Merge",
    script: "Script",
  };
  return labels[type] || type;
}

// --- Main Command ---

export default function ManageProfiles() {
  const [profiles, setProfiles] = useState<ProfilesConfig>({ items: [] });
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfiles = useCallback(() => {
    try {
      setIsLoading(true);
      const data = readProfiles();
      setProfiles(data);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to read profiles",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleActivate = async (profile: ProfileItem) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Activating profile...",
        message: "Updating config and restarting Clash Verge Rev",
      });

      // Step 1: Update profiles.yaml to set new current profile
      activateProfile(profile.uid);
      console.log("[Profile] Updated profiles.yaml, current =", profile.uid);

      // Step 2: Restart Clash Verge Rev to re-process merged config
      await showToast({
        style: Toast.Style.Animated,
        title: "Restarting Clash Verge Rev...",
        message: "Please wait while the app restarts",
      });

      await restartClashVerge();

      fetchProfiles();

      await showToast({
        style: Toast.Style.Success,
        title: "Profile activated",
        message: `Switched to: ${profile.name || profile.uid}`,
      });
    } catch (error) {
      console.error("[Profile] Activation failed:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to activate profile",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    await Clipboard.copy(url);
    showToast({
      style: Toast.Style.Success,
      title: "URL copied to clipboard",
    });
  };

  const currentProfile = getCurrentProfile(profiles);
  const items = profiles.items || [];

  // Separate into main profiles (remote/local) and enhanced profiles (merge/script)
  const mainProfiles = items.filter(
    (p) => p.type === "remote" || p.type === "local",
  );
  const enhancedProfiles = items.filter(
    (p) => p.type === "merge" || p.type === "script",
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search profiles...">
      {mainProfiles.length > 0 && (
        <List.Section
          title="Subscriptions"
          subtitle={`${mainProfiles.length} profiles`}
        >
          {mainProfiles.map((profile) => {
            const isActive = profile.uid === profiles.current;
            const trafficInfo = getTrafficInfo(profile);

            return (
              <List.Item
                key={profile.uid}
                title={profile.name || profile.uid}
                subtitle={profile.desc || profileTypeLabel(profile.type)}
                icon={{
                  source: isActive
                    ? Icon.CheckCircle
                    : profileTypeIcon(profile.type),
                  tintColor: isActive ? Color.Green : Color.SecondaryText,
                }}
                accessories={[
                  ...(trafficInfo ? [{ text: trafficInfo }] : []),
                  ...(profile.extra?.expire
                    ? [{ text: formatExpire(profile.extra.expire) }]
                    : []),
                  ...(isActive
                    ? [{ tag: { value: "Active", color: Color.Green } }]
                    : []),
                  { text: profileTypeLabel(profile.type) },
                ]}
                actions={
                  <ActionPanel>
                    {!isActive && (
                      <Action
                        title="Activate Profile"
                        icon={Icon.CheckCircle}
                        onAction={() => handleActivate(profile)}
                      />
                    )}
                    {profile.url && (
                      <Action
                        title="Copy Subscription URL"
                        icon={Icon.Clipboard}
                        shortcut={{ modifiers: ["cmd"], key: "c" }}
                        onAction={() => handleCopyUrl(profile.url!)}
                      />
                    )}
                    <Action
                      title="Refresh List"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={fetchProfiles}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {enhancedProfiles.length > 0 && (
        <List.Section
          title="Enhanced Profiles"
          subtitle={`${enhancedProfiles.length} profiles`}
        >
          {enhancedProfiles.map((profile) => {
            const isActive = profile.uid === profiles.current;

            return (
              <List.Item
                key={profile.uid}
                title={profile.name || profile.uid}
                subtitle={profile.desc || profileTypeLabel(profile.type)}
                icon={{
                  source: profileTypeIcon(profile.type),
                  tintColor: Color.SecondaryText,
                }}
                accessories={[{ text: profileTypeLabel(profile.type) }]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Refresh List"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={fetchProfiles}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
