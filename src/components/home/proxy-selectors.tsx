import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@root/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, ChevronsUpDown, Timer, WholeWord } from "lucide-react";

import { useVerge } from "@/hooks/use-verge";
import { useAppData } from "@/providers/app-data-provider";
import delayManager from "@/services/delay";
import { updateProxy, deleteConnection } from "@/services/api";

const STORAGE_KEY_GROUP = "clash-verge-selected-proxy-group";
const STORAGE_KEY_SORT_TYPE = "clash-verge-proxy-sort-type";
const presetList = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"];

type ProxySortType = "default" | "delay" | "name";

interface IProxyGroup {
  name: string;
  type: string;
  now: string;
  hidden: boolean;
  all: (string | { name: string })[];
  icon?: string;
}

function getDelayColorClasses(delayValue: number): string {
  if (delayValue < 0) {
    return "text-muted-foreground border-border";
  }
  if (delayValue >= 150) {
    return "text-destructive border-destructive/40";
  }
  return "text-green-600 border-green-500/40 dark:text-green-400 dark:border-green-400/30";
}

const ProxySelectItem = ({
  proxyName,
  groupName,
}: {
  proxyName: string;
  groupName: string;
}) => {
  const [delay, setDelay] = useState(() =>
    delayManager.getDelay(proxyName, groupName),
  );
  const [isJustUpdated, setIsJustUpdated] = useState(false);

  useEffect(() => {
    const listener = (newDelay: number) => {
      setDelay((currentDelay) => {
        if (newDelay >= 0 && newDelay !== currentDelay) {
          setIsJustUpdated(true);
          setTimeout(() => setIsJustUpdated(false), 600);
        }
        return newDelay;
      });
    };

    delayManager.setListener(proxyName, groupName, listener);
    return () => {
      delayManager.removeListener(proxyName, groupName);
    };
  }, [proxyName, groupName]);

  return (
    <SelectItem key={proxyName} value={proxyName}>
      <div className="flex items-center justify-between w-full gap-2">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 px-1.5 h-5 min-w-[36px] justify-center text-xs font-mono transition-colors",
            getDelayColorClasses(delay),
            isJustUpdated && "bg-primary/10 border-primary/50",
          )}
        >
          {delay < 0 || delay > 10000 ? "—" : delay}
        </Badge>
        <span className="truncate">{proxyName}</span>
      </div>
    </SelectItem>
  );
};

export const ProxySelectors: React.FC = () => {
  const { t } = useTranslation();
  const { verge } = useVerge();
  const { proxies, connections, clashConfig, refreshProxy } = useAppData();

  const mode = clashConfig?.mode?.toLowerCase() || "rule";
  const isGlobalMode = mode === "global";
  const isDirectMode = mode === "direct";

  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedProxy, setSelectedProxy] = useState<string>("");
  const [sortType, setSortType] = useState<ProxySortType>(
    () =>
      (localStorage.getItem(STORAGE_KEY_SORT_TYPE) as ProxySortType) ||
      "default",
  );
  const enable_group_icon = verge?.enable_group_icon ?? true;

  useEffect(() => {
    if (!proxies?.groups) return;
    if (isGlobalMode) {
      setSelectedGroup("GLOBAL");
      return;
    }
    if (isDirectMode) {
      setSelectedGroup("DIRECT");
      return;
    }

    const savedGroup = localStorage.getItem(STORAGE_KEY_GROUP);
    const primaryGroup =
      proxies.groups.find(
        (g: IProxyGroup) =>
          g.type === "Selector" && g.name.toLowerCase().includes("auto"),
      ) || proxies.groups.find((g: IProxyGroup) => g.type === "Selector");

    if (
      savedGroup &&
      proxies.groups.some((g: IProxyGroup) => g.name === savedGroup)
    ) {
      setSelectedGroup(savedGroup);
    } else if (primaryGroup) {
      setSelectedGroup(primaryGroup.name);
    } else if (proxies.groups.length > 0) {
      const firstSelector = proxies.groups.find(
        (g: IProxyGroup) => g.type === "Selector",
      );
      if (firstSelector) {
        setSelectedGroup(firstSelector.name);
      }
    }
  }, [proxies, isGlobalMode, isDirectMode]);

  useEffect(() => {
    if (!selectedGroup || !proxies) return;
    if (isGlobalMode) {
      setSelectedProxy(proxies.global?.now || "");
      return;
    }
    if (isDirectMode) {
      setSelectedProxy("DIRECT");
      return;
    }
    const group = proxies.groups.find(
      (g: IProxyGroup) => g.name === selectedGroup,
    );
    if (group) {
      const current = group.now;
      const firstInList =
        typeof group.all?.[0] === "string"
          ? group.all[0]
          : group.all?.[0]?.name;
      setSelectedProxy(current || firstInList || "");
    }
  }, [selectedGroup, proxies, isGlobalMode, isDirectMode]);

  const handleProxyListOpen = useCallback(
    (isOpen: boolean) => {
      if (!isOpen || isDirectMode) return;

      const timeout = verge?.default_latency_timeout || 5000;

      if (isGlobalMode) {
        const proxyList = proxies?.global?.all;
        if (proxyList) {
          const proxyNames = proxyList
            .map((p: any) => (typeof p === "string" ? p : p.name))
            .filter((name: string) => name && !presetList.includes(name));
          delayManager.checkListDelay(proxyNames, "GLOBAL", timeout);
        }
      } else {
        const group = proxies?.groups?.find(
          (g: IProxyGroup) => g.name === selectedGroup,
        );
        if (group && group.all) {
          const proxyNames = group.all
            .map((p: any) => (typeof p === "string" ? p : p.name))
            .filter(Boolean);
          delayManager.checkListDelay(proxyNames, selectedGroup, timeout);
        }
      }
    },
    [selectedGroup, proxies, isGlobalMode, isDirectMode, verge],
  );

  const handleGroupChange = (newGroup: string) => {
    if (isGlobalMode || isDirectMode) return;
    setSelectedGroup(newGroup);
    localStorage.setItem(STORAGE_KEY_GROUP, newGroup);
  };

  const handleProxyChange = async (newProxy: string) => {
    if (newProxy === selectedProxy) return;
    const previousProxy = selectedProxy;
    setSelectedProxy(newProxy);
    try {
      await updateProxy(selectedGroup, newProxy);
      if (verge?.auto_close_connection && previousProxy) {
        connections?.data.forEach((conn: any) => {
          if (conn.chains.includes(previousProxy)) {
            deleteConnection(conn.id);
          }
        });
      }
      setTimeout(() => refreshProxy(), 300);
    } catch (error) {
      console.error("Failed to update proxy", error);
    }
  };

  const handleSortChange = () => {
    const nextSort: Record<ProxySortType, ProxySortType> = {
      default: "delay",
      delay: "name",
      name: "default",
    };
    const newSortType = nextSort[sortType];
    setSortType(newSortType);
    localStorage.setItem(STORAGE_KEY_SORT_TYPE, newSortType);
  };

  const selectorGroups = useMemo(() => {
    if (!proxies?.groups) return [];
    const allowedTypes = ["Selector", "URLTest", "Fallback"];
    return proxies.groups.filter(
      (g: IProxyGroup) => allowedTypes.includes(g.type) && !g.hidden,
    );
  }, [proxies]);

  const proxyOptions = useMemo(() => {
    let options: { name: string }[] = [];
    if (isDirectMode) return [{ name: "DIRECT" }];

    const sourceList = isGlobalMode
      ? proxies?.global?.all
      : proxies?.groups?.find((g: IProxyGroup) => g.name === selectedGroup)
          ?.all;

    if (sourceList) {
      const rawOptions = sourceList
        .map((proxy: any) => ({
          name: typeof proxy === "string" ? proxy : proxy.name,
        }))
        .filter((p: { name: string }) => p.name);

      const uniqueNames = new Set<string>();
      options = rawOptions.filter((proxy: any) => {
        if (!uniqueNames.has(proxy.name)) {
          uniqueNames.add(proxy.name);
          return true;
        }
        return false;
      });
    }

    if (sortType === "name") {
      return options.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortType === "delay") {
      return options.sort((a, b) => {
        const delayA = delayManager.getDelay(a.name, selectedGroup);
        const delayB = delayManager.getDelay(b.name, selectedGroup);
        if (delayA < 0) return 1;
        if (delayB < 0) return -1;
        return delayA - delayB;
      });
    }
    return options;
  }, [selectedGroup, proxies, sortType, isGlobalMode, isDirectMode]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4 w-full">
        {/* Group */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("Group")}
          </label>
          <Select
            value={selectedGroup}
            onValueChange={handleGroupChange}
            disabled={isGlobalMode || isDirectMode}
          >
            <SelectTrigger className="w-full">
              {isGlobalMode ? (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{t("Global Mode Active")}</span>
                </div>
              ) : (
                <SelectValue placeholder={t("Select a group...")} />
              )}
            </SelectTrigger>
            <SelectContent>
              {selectorGroups.map((group: IProxyGroup) => (
                <SelectItem key={group.name} value={group.name}>
                  <div className="flex items-center gap-2">
                    {enable_group_icon && group.icon && (
                      <img
                        src={
                          group.icon.startsWith("data")
                            ? group.icon
                            : group.icon.startsWith("<svg")
                              ? `data:image/svg+xml;base64,${btoa(group.icon)}`
                              : group.icon
                        }
                        className="w-4 h-4 rounded-sm object-cover"
                        alt=""
                      />
                    )}
                    <span>{group.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Proxy */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("Proxy")}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleSortChange}
                  disabled={isDirectMode}
                >
                  {sortType === "default" && (
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  )}
                  {sortType === "delay" && <Timer className="h-3.5 w-3.5" />}
                  {sortType === "name" && <WholeWord className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {sortType === "default" && <p>{t("Sort by default")}</p>}
                {sortType === "delay" && <p>{t("Sort by delay")}</p>}
                {sortType === "name" && <p>{t("Sort by name")}</p>}
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={selectedProxy}
            onValueChange={handleProxyChange}
            disabled={isDirectMode}
            onOpenChange={handleProxyListOpen}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("Select a proxy...")} />
            </SelectTrigger>
            <SelectContent>
              {proxyOptions.map((proxy) => (
                <ProxySelectItem
                  key={proxy.name}
                  proxyName={proxy.name}
                  groupName={selectedGroup}
                />
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </TooltipProvider>
  );
};
