import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useVerge } from "@/hooks/use-verge";
import useSWR from "swr";
import useSWRSubscription from "swr/subscription";
import {
  getProxies,
  getRules,
  getClashConfig,
  getProxyProviders,
  getRuleProviders,
} from "@/services/api";
import {
  getSystemProxy,
  getRunningMode,
  getAppUptime,
  forceRefreshProxies,
} from "@/services/cmds";
import { useClashInfo } from "@/hooks/use-clash";
import { createAuthSockette } from "@/utils/websocket";
import { useVisibility } from "@/hooks/use-visibility";
import { listen } from "@tauri-apps/api/event";

// 定义AppDataContext类型 - 使用宽松类型
interface AppDataContextType {
  proxies: any;
  clashConfig: any;
  rules: any[];
  sysproxy: any;
  runningMode?: string;
  uptime: number;
  proxyProviders: any;
  ruleProviders: any;
  connections: {
    data: any[];
    count: number;
    uploadTotal: number;
    downloadTotal: number;
  };
  traffic: { up: number; down: number };
  memory: { inuse: number };
  systemProxyAddress: string;

  refreshProxy: () => Promise<any>;
  refreshClashConfig: () => Promise<any>;
  refreshRules: () => Promise<any>;
  refreshSysproxy: () => Promise<any>;
  refreshProxyProviders: () => Promise<any>;
  refreshRuleProviders: () => Promise<any>;
  refreshAll: () => Promise<any>;
}

// 创建上下文
const AppDataContext = createContext<AppDataContextType | null>(null);

// 全局数据提供者组件
export const AppDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pageVisible = useVisibility();
  const { clashInfo } = useClashInfo();
  const { verge } = useVerge();

  // 基础数据 - 中频率更新 (5秒)
  const { data: proxiesData, mutate: refreshProxy } = useSWR(
    "getProxies",
    getProxies,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  // 监听profile和clash配置变更事件
  useEffect(() => {
    let profileUnlisten: Promise<() => void> | undefined;
    let lastProfileId: string | null = null;
    let lastUpdateTime = 0;
    const refreshThrottle = 500;

    const setupEventListeners = async () => {
      try {
        // 监听profile切换事件
        profileUnlisten = listen<string>("profile-changed", (event) => {
          const newProfileId = event.payload;
          const now = Date.now();

          console.log(`[AppDataProvider] Profile switched: ${newProfileId}`);

          if (
            lastProfileId === newProfileId &&
            now - lastUpdateTime < refreshThrottle
          ) {
            console.log("[AppDataProvider] Duplicate event debounced, skip");
            return;
          }

          lastProfileId = newProfileId;
          lastUpdateTime = now;

          setTimeout(async () => {
            try {
              console.log("[AppDataProvider] Force refresh proxy cache");

              const refreshPromise = Promise.race([
                forceRefreshProxies(),
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error("forceRefreshProxies timeout")),
                    8000,
                  ),
                ),
              ]);

              await refreshPromise;

              console.log("[AppDataProvider] Refresh frontend proxy data");
              await refreshProxy();

              console.log(
                "[AppDataProvider] Proxy data refreshed for profile switch",
              );
            } catch (error) {
              console.error(
                "[AppDataProvider] Force refresh proxy cache failed:",
                error,
              );

              refreshProxy().catch((e) =>
                console.warn(
                  "[AppDataProvider] Normal refresh also failed:",
                  e,
                ),
              );
            }
          }, 0);
        });

        // 监听Clash配置刷新事件(enhance操作等)
        const handleRefreshClash = () => {
          const now = Date.now();
          console.log("[AppDataProvider] Clash config refresh event");

          if (now - lastUpdateTime > refreshThrottle) {
            lastUpdateTime = now;

            setTimeout(async () => {
              try {
                console.log(
                  "[AppDataProvider] Clash refresh - force refresh proxy cache",
                );

                // 添加超时保护
                const refreshPromise = Promise.race([
                  forceRefreshProxies(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("forceRefreshProxies timeout")),
                      8000,
                    ),
                  ),
                ]);

                await refreshPromise;
                await refreshProxy();
              } catch (error) {
                console.error(
                  "[AppDataProvider] Clash refresh forcing proxy cache refresh failed:",
                  error,
                );
                refreshProxy().catch((e) =>
                  console.warn(
                    "[AppDataProvider] Clash refresh normal refresh also failed:",
                    e,
                  ),
                );
              }
            }, 0);
          }
        };

        window.addEventListener(
          "verge://refresh-clash-config",
          handleRefreshClash,
        );

        return () => {
          window.removeEventListener(
            "verge://refresh-clash-config",
            handleRefreshClash,
          );
        };
      } catch (error) {
        console.error(
          "[AppDataProvider] Failed to set up event listeners:",
          error,
        );
        return () => {};
      }
    };

    const cleanupPromise = setupEventListeners();

    return () => {
      profileUnlisten?.then((unlisten) => unlisten()).catch(console.error);
      cleanupPromise.then((cleanup) => cleanup());
    };
  }, [refreshProxy]);

  const { data: clashConfig, mutate: refreshClashConfig } = useSWR(
    "getClashConfig",
    getClashConfig,
    {
      refreshInterval: 5000,
      revalidateOnFocus: false,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  // 提供者数据
  const { data: proxyProviders, mutate: refreshProxyProviders } = useSWR(
    "getProxyProviders",
    getProxyProviders,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 3000,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: ruleProviders, mutate: refreshRuleProviders } = useSWR(
    "getRuleProviders",
    getRuleProviders,
    {
      revalidateOnFocus: false,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  // 低频率更新数据
  const { data: rulesData, mutate: refreshRules } = useSWR(
    "getRules",
    getRules,
    {
      revalidateOnFocus: false,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: sysproxy, mutate: refreshSysproxy } = useSWR(
    "getSystemProxy",
    getSystemProxy,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: runningMode } = useSWR("getRunningMode", getRunningMode, {
    revalidateOnFocus: false,
    suspense: false,
    errorRetryCount: 3,
  });

  // 高频率更新数据 (2秒)
  const { data: uptimeData } = useSWR("appUptime", getAppUptime, {
    refreshInterval: 2000,
    revalidateOnFocus: false,
    suspense: false,
  });

  // 连接数据 - 使用WebSocket实时更新
  const {
    data: connectionsData = {
      connections: [],
      uploadTotal: 0,
      downloadTotal: 0,
    },
  } = useSWRSubscription(
    clashInfo && pageVisible ? "connections" : null,
    (_key, { next }) => {
      if (!clashInfo || !pageVisible) return () => {};

      const { server = "", secret = "" } = clashInfo;
      if (!server) return () => {};

      console.log(
        `[Connections][${AppDataProvider.name}] Connecting: ${server}/connections`,
      );
      const socket = createAuthSockette(`${server}/connections`, secret, {
        timeout: 5000,
        onmessage(event) {
          try {
            const data = JSON.parse(event.data);
            // 处理连接数据，计算当前上传下载速度
            next(
              null,
              (
                prev: any = {
                  connections: [],
                  uploadTotal: 0,
                  downloadTotal: 0,
                },
              ) => {
                const oldConns = prev.connections || [];
                const newConns = data.connections || [];

                // 计算当前速度
                const processedConns = newConns.map((conn: any) => {
                  const oldConn = oldConns.find(
                    (old: any) => old.id === conn.id,
                  );
                  if (oldConn) {
                    return {
                      ...conn,
                      curUpload: conn.upload - oldConn.upload,
                      curDownload: conn.download - oldConn.download,
                    };
                  }
                  return { ...conn, curUpload: 0, curDownload: 0 };
                });

                return {
                  ...data,
                  connections: processedConns,
                };
              },
            );
          } catch (err) {
            console.error(
              `[Connections][${AppDataProvider.name}] Failed to parse data:`,
              err,
              event.data,
            );
          }
        },
        onopen: (event) => {
          console.log(
            `[Connections][${AppDataProvider.name}] WebSocket connected`,
            event,
          );
        },
        onerror(event) {
          console.error(
            `[Connections][${AppDataProvider.name}] WebSocket error or max retries reached`,
            event,
          );
          next(null, { connections: [], uploadTotal: 0, downloadTotal: 0 });
        },
        onclose: (event) => {
          console.log(
            `[Connections][${AppDataProvider.name}] WebSocket closed`,
            event.code,
            event.reason,
          );
          if (event.code !== 1000 && event.code !== 1001) {
            console.warn(
              `[Connections][${AppDataProvider.name}] Abnormal close, resetting data`,
            );
            next(null, { connections: [], uploadTotal: 0, downloadTotal: 0 });
          }
        },
      });

      return () => {
        console.log(
          `[Connections][${AppDataProvider.name}] Cleaning up WebSocket connection`,
        );
        socket.close();
      };
    },
  );

  // 流量和内存数据 - 通过WebSocket获取实时流量数据
  const { data: trafficData = { up: 0, down: 0 } } = useSWRSubscription(
    clashInfo && pageVisible ? "traffic" : null,
    (_key, { next }) => {
      if (!clashInfo || !pageVisible) return () => {};

      const { server = "", secret = "" } = clashInfo;
      if (!server) return () => {};

      console.log(
        `[Traffic][${AppDataProvider.name}] Connecting: ${server}/traffic`,
      );
      const socket = createAuthSockette(`${server}/traffic`, secret, {
        onmessage(event) {
          try {
            const data = JSON.parse(event.data);
            if (
              data &&
              typeof data.up === "number" &&
              typeof data.down === "number"
            ) {
              next(null, data);
            } else {
              console.warn(
                `[Traffic][${AppDataProvider.name}] Received invalid data:`,
                data,
              );
            }
          } catch (err) {
            console.error(
              `[Traffic][${AppDataProvider.name}] Failed to parse data:`,
              err,
              event.data,
            );
          }
        },
        onopen: (event) => {
          console.log(
            `[Traffic][${AppDataProvider.name}] WebSocket connected`,
            event,
          );
        },
        onerror(event) {
          console.error(
            `[Traffic][${AppDataProvider.name}] WebSocket error or max retries reached`,
            event,
          );
          next(null, { up: 0, down: 0 });
        },
        onclose: (event) => {
          console.log(
            `[Traffic][${AppDataProvider.name}] WebSocket closed`,
            event.code,
            event.reason,
          );
          if (event.code !== 1000 && event.code !== 1001) {
            console.warn(
              `[Traffic][${AppDataProvider.name}] Abnormal close, resetting data`,
            );
            next(null, { up: 0, down: 0 });
          }
        },
      });

      return () => {
        console.log(
          `[Traffic][${AppDataProvider.name}] Cleaning up WebSocket connection`,
        );
        socket.close();
      };
    },
  );

  const { data: memoryData = { inuse: 0 } } = useSWRSubscription(
    clashInfo && pageVisible ? "memory" : null,
    (_key, { next }) => {
      if (!clashInfo || !pageVisible) return () => {};

      const { server = "", secret = "" } = clashInfo;
      if (!server) return () => {};

      console.log(
        `[Memory][${AppDataProvider.name}] Connecting: ${server}/memory`,
      );
      const socket = createAuthSockette(`${server}/memory`, secret, {
        onmessage(event) {
          try {
            const data = JSON.parse(event.data);
            if (data && typeof data.inuse === "number") {
              next(null, data);
            } else {
              console.warn(
                `[Memory][${AppDataProvider.name}] Received invalid data:`,
                data,
              );
            }
          } catch (err) {
            console.error(
              `[Memory][${AppDataProvider.name}] Failed to parse data:`,
              err,
              event.data,
            );
          }
        },
        onopen: (event) => {
          console.log(
            `[Memory][${AppDataProvider.name}] WebSocket connected`,
            event,
          );
        },
        onerror(event) {
          console.error(
            `[Memory][${AppDataProvider.name}] WebSocket error or max retries reached`,
            event,
          );
          next(null, { inuse: 0 });
        },
        onclose: (event) => {
          console.log(
            `[Memory][${AppDataProvider.name}] WebSocket closed`,
            event.code,
            event.reason,
          );
          if (event.code !== 1000 && event.code !== 1001) {
            console.warn(
              `[Memory][${AppDataProvider.name}] Abnormal close, resetting data`,
            );
            next(null, { inuse: 0 });
          }
        },
      });

      return () => {
        console.log(
          `[Memory][${AppDataProvider.name}] Cleaning up WebSocket connection`,
        );
        socket.close();
      };
    },
  );

  // 提供统一的刷新方法
  const refreshAll = async () => {
    await Promise.all([
      refreshProxy(),
      refreshClashConfig(),
      refreshRules(),
      refreshSysproxy(),
      refreshProxyProviders(),
      refreshRuleProviders(),
    ]);
  };

  // 聚合所有数据
  const value = useMemo(() => {
    // 计算系统代理地址
    const calculateSystemProxyAddress = () => {
      if (!verge || !clashConfig) return "-";

      const isPacMode = verge.proxy_auto_config ?? false;

      if (isPacMode) {
        // PAC mode: show expected proxy address
        const proxyHost = verge.proxy_host || "127.0.0.1";
        const proxyPort =
          verge.verge_mixed_port || clashConfig["mixed-port"] || 7897;
        return `${proxyHost}:${proxyPort}`;
      } else {
        // HTTP proxy mode: prefer system address, else fallback to expected address
        const systemServer = sysproxy?.server;
        if (
          systemServer &&
          systemServer !== "-" &&
          !systemServer.startsWith(":")
        ) {
          return systemServer;
        } else {
          // Invalid system address; return expected proxy address
          const proxyHost = verge.proxy_host || "127.0.0.1";
          const proxyPort =
            verge.verge_mixed_port || clashConfig["mixed-port"] || 7897;
          return `${proxyHost}:${proxyPort}`;
        }
      }
    };

    return {
      // 数据
      proxies: proxiesData,
      clashConfig,
      rules: rulesData || [],
      sysproxy,
      runningMode,
      uptime: uptimeData || 0,

      // 提供者数据
      proxyProviders: proxyProviders || {},
      ruleProviders: ruleProviders || {},

      // 连接数据
      connections: {
        data: connectionsData.connections || [],
        count: connectionsData.connections?.length || 0,
        uploadTotal: connectionsData.uploadTotal || 0,
        downloadTotal: connectionsData.downloadTotal || 0,
      },

      // 实时流量数据
      traffic: trafficData,
      memory: memoryData,

      systemProxyAddress: calculateSystemProxyAddress(),

      // 刷新方法
      refreshProxy,
      refreshClashConfig,
      refreshRules,
      refreshSysproxy,
      refreshProxyProviders,
      refreshRuleProviders,
      refreshAll,
    };
  }, [
    proxiesData,
    clashConfig,
    rulesData,
    sysproxy,
    runningMode,
    uptimeData,
    connectionsData,
    trafficData,
    memoryData,
    proxyProviders,
    ruleProviders,
    verge,
    refreshProxy,
    refreshClashConfig,
    refreshRules,
    refreshSysproxy,
    refreshProxyProviders,
    refreshRuleProviders,
  ]);

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
};

// 自定义Hook访问全局数据
export const useAppData = () => {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }

  return context;
};
