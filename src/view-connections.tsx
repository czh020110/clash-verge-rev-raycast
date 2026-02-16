import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  List,
  Icon,
  Color,
  Action,
  ActionPanel,
  showToast,
  Toast,
  confirmAlert,
  Alert,
} from "@raycast/api";
import {
  getConnectionStreamConfig,
  closeConnection,
  closeAllConnections,
} from "./utils/api";

interface ConnectionItem {
  id: string;
  metadata: {
    network: string;
    type: string;
    sourceIP: string;
    sourcePort: string;
    destinationIP: string;
    destinationPort: string;
    host: string;
    processPath: string;
    specialProxy: string;
  };
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
}

interface Speed {
  up: number;
  down: number;
}

type SortOption = "downSpeed" | "upSpeed" | "download" | "upload" | "time";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export default function ViewConnections() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [speeds, setSpeeds] = useState<Record<string, Speed>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [showDetail, setShowDetail] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("downSpeed");

  // Store previous snapshot to calculate speed
  const prevConnectionsRef = useRef<Record<string, ConnectionItem>>({});
  const lastSnapshotTimeRef = useRef<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    // Clean up previous connection if exists
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const { url } = getConnectionStreamConfig();
      console.log("[Connections] Connecting to:", url);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Connections] Connected");
        setIsConnected(true);
        setErrorMsg(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // data structure: { downloadTotal, uploadTotal, connections: [...] }
          if (data.connections) {
            const newConnections = data.connections as ConnectionItem[];
            const now = Date.now();
            const timeDiff = (now - lastSnapshotTimeRef.current) / 1000; // in seconds

            if (timeDiff > 0) {
              const newSpeeds: Record<string, Speed> = {};
              newConnections.forEach((conn) => {
                const prev = prevConnectionsRef.current[conn.id];
                if (prev) {
                  const downSpeed = (conn.download - prev.download) / timeDiff;
                  const upSpeed = (conn.upload - prev.upload) / timeDiff;
                  newSpeeds[conn.id] = {
                    down: Math.max(0, downSpeed),
                    up: Math.max(0, upSpeed),
                  };
                } else {
                  // New connection, speed is 0 for now or calculated from start if needed,
                  // but straightforward to just wait for next tick
                  newSpeeds[conn.id] = { down: 0, up: 0 };
                }
              });
              setSpeeds(newSpeeds);
            }

            // Update refs
            const newConnMap: Record<string, ConnectionItem> = {};
            newConnections.forEach((c) => (newConnMap[c.id] = c));
            prevConnectionsRef.current = newConnMap;
            lastSnapshotTimeRef.current = now;

            // Update connections state (sorting happens in render or effect)
            setConnections(newConnections);
          }
        } catch (err) {
          console.error("Parse error", err);
        }
      };

      ws.onclose = () => {
        console.log("[Connections] Closed");
        setIsConnected(false);
      };

      ws.onerror = (err) => {
        console.error("[Connections] Error", err);
        setErrorMsg("Connection Failed");
        setIsConnected(false);
      };
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const handleCloseConnection = async (id: string) => {
    try {
      await closeConnection(id);
      showToast(Toast.Style.Success, "Connection closed");
      // Optimistically remove from list
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      showToast(Toast.Style.Failure, "Failed to close connection");
    }
  };

  const handleCloseAll = async () => {
    if (
      await confirmAlert({
        title: "Close All Connections",
        message: "Are you sure you want to close all active connections?",
        primaryAction: {
          title: "Close All",
          style: Alert.ActionStyle.Destructive,
        },
      })
    ) {
      try {
        await closeAllConnections();
        showToast(Toast.Style.Success, "All connections closed");
        setConnections([]);
      } catch (err) {
        showToast(Toast.Style.Failure, "Failed to close all connections");
      }
    }
  };

  // Calculate Max Speeds
  const maxSpeed = useMemo(() => {
    let maxDown = 0;
    let maxUp = 0;
    Object.values(speeds).forEach((s) => {
      if (s.down > maxDown) maxDown = s.down;
      if (s.up > maxUp) maxUp = s.up;
    });
    return { down: maxDown, up: maxUp };
  }, [speeds]);

  // Sort Connections
  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => {
      switch (sortBy) {
        case "downSpeed": {
          const speedA = speeds[a.id]?.down || 0;
          const speedB = speeds[b.id]?.down || 0;
          return speedB - speedA;
        }
        case "upSpeed": {
          const speedA = speeds[a.id]?.up || 0;
          const speedB = speeds[b.id]?.up || 0;
          return speedB - speedA;
        }
        case "download":
          return b.download - a.download;
        case "upload":
          return b.upload - a.upload;
        case "time":
          return new Date(b.start).getTime() - new Date(a.start).getTime();
        default:
          return 0;
      }
    });
  }, [connections, speeds, sortBy]);

  return (
    <List
      isLoading={!errorMsg && !isConnected && connections.length === 0}
      isShowingDetail={showDetail}
      searchBarPlaceholder="Filter connections..."
      navigationTitle={
        isConnected
          ? `↓ ${formatSpeed(maxSpeed.down)}  ↑ ${formatSpeed(maxSpeed.up)}`
          : "View Connections"
      }
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort by"
          onChange={(newValue) => setSortBy(newValue as SortOption)}
          value={sortBy}
        >
          <List.Dropdown.Item
            title="Download Speed"
            value="downSpeed"
            icon={Icon.Download}
          />
          <List.Dropdown.Item
            title="Upload Speed"
            value="upSpeed"
            icon={Icon.Upload}
          />
          <List.Dropdown.Item title="Total Download" value="download" />
          <List.Dropdown.Item title="Total Upload" value="upload" />
          <List.Dropdown.Item
            title="Start Time"
            value="time"
            icon={Icon.Clock}
          />
        </List.Dropdown>
      }
    >
      {errorMsg ? (
        <List.EmptyView
          title="Connection Error"
          description={errorMsg}
          icon={Icon.ExclamationMark}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                onAction={connect}
                icon={Icon.RotateAntiClockwise}
              />
            </ActionPanel>
          }
        />
      ) : sortedConnections.length === 0 ? (
        <List.EmptyView
          title={isConnected ? "No Active Connections" : "Connecting..."}
          icon={isConnected ? Icon.CheckCircle : Icon.Wifi}
        />
      ) : (
        <List.Section
          title="Active Connections"
          subtitle={`${sortedConnections.length} connections`}
        >
          {sortedConnections.map((conn) => {
            const speed = speeds[conn.id] || { down: 0, up: 0 };
            const host = conn.metadata.host || conn.metadata.destinationIP;
            const chains = conn.chains.slice().reverse().join(" :: "); // Show path

            return (
              <List.Item
                key={conn.id}
                title={host}
                subtitle={showDetail ? "" : conn.rule}
                icon={
                  conn.metadata.network === "tcp"
                    ? { source: Icon.Globe, tintColor: Color.Blue }
                    : { source: Icon.Bolt, tintColor: Color.Yellow }
                }
                accessories={
                  showDetail
                    ? undefined
                    : [
                        {
                          text: `↓ ${formatSpeed(speed.down)}`,
                        },
                        {
                          text: `↑ ${formatSpeed(speed.up)}`,
                        },
                      ]
                }
                detail={
                  <List.Item.Detail
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Host"
                          text={host}
                          icon={Icon.Globe}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Process"
                          text={conn.metadata.processPath}
                          icon={Icon.Finder}
                        />
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.TagList title="Network">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={conn.metadata.network.toUpperCase()}
                            color={Color.Blue}
                          />
                          <List.Item.Detail.Metadata.TagList.Item
                            text={conn.metadata.type}
                            color={Color.SecondaryText}
                          />
                        </List.Item.Detail.Metadata.TagList>

                        <List.Item.Detail.Metadata.Label
                          title="Source"
                          text={`${conn.metadata.sourceIP}:${conn.metadata.sourcePort}`}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Destination"
                          text={`${conn.metadata.destinationIP}:${conn.metadata.destinationPort}`}
                        />
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Download Speed"
                          text={formatSpeed(speed.down)}
                          icon={Icon.Download}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Upload Speed"
                          text={formatSpeed(speed.up)}
                          icon={Icon.Upload}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Total Download"
                          text={formatBytes(conn.download)}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Total Upload"
                          text={formatBytes(conn.upload)}
                        />
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Rule"
                          text={`${conn.rule} (${conn.rulePayload})`}
                          icon={Icon.Filter}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Chains"
                          text={chains}
                          icon={Icon.Link}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Start Time"
                          text={new Date(conn.start).toLocaleString()}
                        />
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action
                      title={showDetail ? "List View" : "Detail View"}
                      icon={showDetail ? Icon.List : Icon.Sidebar}
                      onAction={() => setShowDetail(!showDetail)}
                    />
                    <Action
                      title="Close Connection (Ctrl+X)"
                      icon={Icon.XMarkCircle}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleCloseConnection(conn.id)}
                    />
                    <Action
                      title="Close All Connections"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                      onAction={handleCloseAll}
                    />
                    <Action.CopyToClipboard title="Copy Host" content={host} />
                    <Action.CopyToClipboard
                      title="Copy Chain"
                      content={chains}
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
