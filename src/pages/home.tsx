import React, {
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import { useLockFn } from "ahooks";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useProfiles } from "@/hooks/use-profiles";
import {
  ProfileViewer,
  ProfileViewerRef,
} from "@/components/profile/profile-viewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronsUpDown,
  Check,
  PlusCircle,
  Wrench,
  AlertTriangle,
  Loader2,
  Globe,
  Send,
  ExternalLink,
  RefreshCw,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useVerge } from "@/hooks/use-verge";
import { useSystemState } from "@/hooks/use-system-state";
import { useServiceInstaller } from "@/hooks/useServiceInstaller";
import { Switch } from "@/components/ui/switch";
import { ProxySelectors } from "@/components/home/proxy-selectors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { closeAllConnections } from "@/services/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateProfile } from "@/services/cmds";
import { SidebarTrigger } from "@/components/ui/sidebar";
import parseTraffic from "@/utils/parse-traffic";
import { useAppData } from "@/providers/app-data-provider";
import { PowerButton } from "@/components/home/power-button";
import { cn } from "@root/lib/utils";
import map from "../assets/image/map.svg";
import { AnimatePresence, motion } from "framer-motion";

function useSmoothBoolean(
  source: boolean,
  delayOffMs: number = 600,
  delayOnMs: number = 0,
): boolean {
  const [value, setValue] = useState<boolean>(source);

  useEffect(() => {
    let timer: number | undefined;

    if (source) {
      if (delayOnMs > 0) {
        timer = window.setTimeout(() => setValue(true), delayOnMs);
      } else {
        setValue(true);
      }
    } else {
      timer = window.setTimeout(() => setValue(false), delayOffMs);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [source, delayOffMs, delayOnMs]);

  return value;
}

const MinimalHomePage: React.FC = () => {
  const { t } = useTranslation();
  const [isToggling, setIsToggling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { profiles, patchProfiles, activateSelected, mutateProfiles } =
    useProfiles();
  const viewerRef = useRef<ProfileViewerRef>(null);
  const [uidToActivate, setUidToActivate] = useState<string | null>(null);
  const { connections } = useAppData();

  const profileItems = useMemo(() => {
    const items =
      profiles && Array.isArray(profiles.items) ? profiles.items : [];
    const allowedTypes = ["local", "remote"];
    return items.filter((i: any) => i && allowedTypes.includes(i.type!));
  }, [profiles]);

  const currentProfile = useMemo(() => {
    return profileItems.find((p) => p.uid === profiles?.current);
  }, [profileItems, profiles?.current]);
  const currentProfileName = currentProfile?.name || profiles?.current;

  const activateProfile = useCallback(
    async (uid: string, notifySuccess: boolean) => {
      try {
        await patchProfiles({ current: uid });
        await closeAllConnections();
        await activateSelected();
        if (notifySuccess) {
          toast.success(t("Profile Switched"));
        }
      } catch (err: any) {
        toast.error(err.message || err.toString());
        await mutateProfiles();
      }
    },
    [patchProfiles, activateSelected, mutateProfiles, t],
  );

  useEffect(() => {
    const uidToActivate = sessionStorage.getItem("activateProfile");
    if (uidToActivate && profileItems.some((p) => p.uid === uidToActivate)) {
      activateProfile(uidToActivate, false);
      sessionStorage.removeItem("activateProfile");
    }
  }, [profileItems, activateProfile]);

  const handleProfileChange = useLockFn(async (uid: string) => {
    if (profiles?.current === uid) return;
    await activateProfile(uid, true);
  });

  const { verge, patchVerge, mutateVerge } = useVerge();
  const { isAdminMode, isServiceMode } = useSystemState();
  const { installServiceAndRestartCore } = useServiceInstaller();
  const isTunAvailable = isServiceMode || isAdminMode;
  const isProxyEnabled =
    !!verge?.enable_system_proxy || !!verge?.enable_tun_mode;

  const uiProxyEnabled = useSmoothBoolean(isProxyEnabled, 600, 0);

  const showTunAlert =
    (verge?.primary_action ?? "tun-mode") === "tun-mode" && !isTunAvailable;

  const handleToggleProxy = useLockFn(async () => {
    const turningOn = !isProxyEnabled;
    const primaryAction = verge?.primary_action || "tun-mode";
    setIsToggling(true);

    try {
      if (turningOn) {
        if (primaryAction === "tun-mode") {
          if (!isTunAvailable) {
            toast.error(t("TUN requires Service Mode or Admin Mode"));
            setIsToggling(false);
            return;
          }
          await patchVerge({
            enable_tun_mode: true,
            enable_system_proxy: false,
          });
        } else {
          await patchVerge({
            enable_system_proxy: true,
            enable_tun_mode: false,
          });
        }
        toast.success(t("Proxy enabled"));
      } else {
        await patchVerge({
          enable_tun_mode: false,
          enable_system_proxy: false,
        });
        toast.success(t("Proxy disabled"));
      }
      mutateVerge();
    } catch (error: any) {
      toast.error(t("Failed to toggle proxy"), { description: error.message });
    } finally {
      setIsToggling(false);
    }
  });

  const handleUpdateProfile = useLockFn(async () => {
    if (!currentProfile?.uid || currentProfile.type !== "remote") return;
    setIsUpdating(true);
    try {
      await updateProfile(currentProfile.uid);
      toast.success(t("Profile Updated Successfully"));
      mutateProfiles();
    } catch (err: any) {
      toast.error(t("Failed to update profile"), { description: err.message });
    } finally {
      setIsUpdating(false);
    }
  });

  const statusInfo = useMemo(() => {
    if (isToggling) {
      return {
        text: isProxyEnabled ? t("Disconnecting...") : t("Connecting..."),
        color: isProxyEnabled ? "#f59e0b" : "#84cc16",
        isAnimating: true,
      };
    }
    if (isProxyEnabled) {
      return {
        text: t("Connected"),
        color: "#22c55e",
        isAnimating: false,
      };
    }
    return {
      text: t("Disconnected"),
      color: "#ef4444",
      isAnimating: false,
    };
  }, [isToggling, isProxyEnabled, t]);

  const statsContainerVariants = {
    initial: { opacity: 0, y: 25, filter: "blur(8px)", scale: 0.98 },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1],
        when: "beforeChildren",
        staggerChildren: 0.08,
      },
    },
    exit: {
      opacity: 0,
      y: 10,
      filter: "blur(10px)",
      scale: 0.98,
      transition: {
        duration: 0.45,
        ease: [0.22, 0.08, 0.05, 1],
        when: "afterChildren",
        staggerChildren: 0.06,
        staggerDirection: -1,
      },
    },
  } as const;

  const statItemVariants = {
    initial: { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.35, ease: "easeOut" },
    },
    exit: {
      opacity: 0,
      y: -8,
      filter: "blur(6px)",
      transition: { duration: 0.3, ease: "easeIn" },
    },
  } as const;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0 [transform:translateZ(0)]">
        <img src={map} alt="World map" className="w-full h-full object-cover" />
      </div>

      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(circle, rgba(34,197,94,0.3) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{
          opacity: uiProxyEnabled ? 1 : 0,
          scale: uiProxyEnabled ? 1 : 0.92,
        }}
        transition={{
          type: "spring",
          stiffness: 120,
          damping: 25,
          mass: 1,
        }}
      />

      <header className="flex-shrink-0 p-5 grid grid-cols-3 items-center z-10">
        <div className="flex justify-start">
          <SidebarTrigger />
        </div>
        <div className="justify-self-center flex flex-col items-center gap-2">
          <div className="relative flex items-center justify-center">
            {profileItems.length > 0 ? (
              <>
                <div className="absolute right-full mr-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => viewerRef.current?.create()}
                          className={cn(
                            "backdrop-blur-sm bg-white/80 border-gray-300/60",
                            "dark:bg-white/5 dark:border-white/15",
                            "hover:bg-white/90 hover:border-gray-400/70",
                            "dark:hover:bg-white/10 dark:hover:border-white/20",
                            "transition-all duration-200",
                          )}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("Add Profile")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full max-w-[250px] sm:max-w-xs",
                        "backdrop-blur-sm bg-white/80 border-gray-300/60",
                        "dark:bg-white/5 dark:border-white/15",
                        "hover:bg-white/90 hover:border-gray-400/70",
                        "dark:hover:bg-white/10 dark:hover:border-white/20",
                        "transition-all duration-200",
                      )}
                    >
                      <span className="truncate">{currentProfileName}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                    <DropdownMenuLabel>{t("Profiles")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {profileItems.map((p) => (
                      <DropdownMenuItem
                        key={p.uid}
                        onSelect={() => handleProfileChange(p.uid)}
                      >
                        <span className="flex-1 truncate">{p.name}</span>
                        {profiles?.current === p.uid && (
                          <Check className="ml-4 h-4 w-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {currentProfile?.type === "remote" && (
                  <div className="absolute left-full ml-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleUpdateProfile}
                            disabled={isUpdating}
                            className={cn(
                              "flex-shrink-0",
                              "backdrop-blur-sm bg-white/70 border border-gray-300/50",
                              "dark:bg-white/5 dark:border-white/10",
                              "hover:bg-white/85 hover:border-gray-400/60",
                              "dark:hover:bg-white/10 dark:hover:border-white/15",
                              "transition-all duration-200",
                            )}
                          >
                            {isUpdating ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-5 w-5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("Update Profile")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="absolute right-full mr-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => viewerRef.current?.create()}
                          className={cn(
                            "backdrop-blur-sm bg-white/80 border-gray-300/60",
                            "dark:bg-white/5 dark:border-white/15",
                            "hover:bg-white/90 hover:border-gray-400/70",
                            "dark:hover:bg-white/10 dark:hover:border-white/20",
                            "transition-all duration-200",
                          )}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("Add Profile")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button
                  variant="outline"
                  disabled
                  className={cn(
                    "max-w-[250px] sm:max-w-xs opacity-50 cursor-not-allowed",
                    "backdrop-blur-sm bg-white/50 border-gray-300/40",
                    "dark:bg-white/3 dark:border-white/10",
                  )}
                >
                  <span className="truncate">{t("No profiles available")}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-30" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end"></div>
      </header>

      <main className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="relative flex flex-col items-center gap-8 py-10 w-full max-w-4xl px-4">
          {currentProfile?.announce && (
            <div className="absolute -top-15 w-full flex justify-center text-center max-w-lg">
              {currentProfile.announce_url ? (
                <a
                  href={currentProfile.announce_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-base font-semibold text-foreground hover:underline hover:opacity-80 transition-all whitespace-pre-wrap"
                  title={currentProfile.announce_url.replace(/\\n/g, "\n")}
                >
                  <span>{currentProfile.announce.replace(/\\n/g, "\n")}</span>
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                </a>
              ) : (
                <p className="text-base font-semibold text-foreground whitespace-pre-wrap">
                  {currentProfile.announce}
                </p>
              )}
            </div>
          )}

          <div className="relative text-center">
            <motion.h1
              className={cn(
                "text-4xl mb-2 font-semibold",
                statusInfo.isAnimating && "animate-pulse",
              )}
              animate={{ color: statusInfo.color }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {statusInfo.text}
            </motion.h1>

            <AnimatePresence mode="wait">
              {uiProxyEnabled && (
                <motion.div
                  key="traffic-stats"
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-52 flex justify-center items-center text-sm text-muted-foreground gap-6"
                  variants={statsContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  style={{ willChange: "opacity, transform, filter" }}
                >
                  <motion.div
                    className="flex items-center gap-1"
                    variants={statItemVariants}
                    style={{ willChange: "opacity, transform, filter" }}
                  >
                    <ArrowDown className="h-4 w-4 text-green-500" />
                    <motion.span layout>
                      {parseTraffic(connections.downloadTotal)}
                    </motion.span>
                  </motion.div>

                  <motion.div
                    className="flex items-center gap-1"
                    variants={statItemVariants}
                    style={{ willChange: "opacity, transform, filter" }}
                  >
                    <ArrowUp className="h-4 w-4 text-sky-500" />
                    <motion.span layout>
                      {parseTraffic(connections.uploadTotal)}
                    </motion.span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative -translate-y-6">
            <PowerButton
              loading={isToggling}
              checked={uiProxyEnabled}
              onClick={handleToggleProxy}
              disabled={showTunAlert || isToggling || profileItems.length === 0}
              aria-label={t("Toggle Proxy")}
            />
          </div>

          {showTunAlert && (
            <div className="w-full max-w-sm">
              <Alert
                className="flex flex-col items-center gap-2 text-center"
                variant="destructive"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t("Attention Required")}</AlertTitle>
                <AlertDescription className="text-xs">
                  {t("TUN requires Service Mode or Admin Mode")}
                </AlertDescription>
                {!isServiceMode && !isAdminMode && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={installServiceAndRestartCore}
                  >
                    <Wrench className="mr-2 h-4 w-4" />
                    {t("Install Service")}
                  </Button>
                )}
              </Alert>
            </div>
          )}

          <div className="w-full max-w-sm mt-4 flex justify-center">
            {profileItems.length > 0 ? (
              <ProxySelectors />
            ) : (
              <Alert className="flex flex-col items-center gap-2 text-center">
                <PlusCircle className="h-4 w-4" />
                <AlertTitle>{t("Get Started")}</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {t(
                    "You don't have any profiles yet. Add your first one to begin.",
                  )}
                </AlertDescription>
                <Button
                  className="mt-2"
                  onClick={() => viewerRef.current?.create()}
                >
                  {t("Add Profile")}
                </Button>
              </Alert>
            )}
          </div>
        </div>
      </main>

      <footer className="flex justify-center p-4 flex-shrink-0">
        {currentProfile?.support_url && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("Support")}:</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={currentProfile.support_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-primary"
                  >
                    {currentProfile.support_url.includes("t.me") ||
                    currentProfile.support_url.includes("telegram") ||
                    currentProfile.support_url.startsWith("tg://") ? (
                      <Send className="h-5 w-5" />
                    ) : (
                      <Globe className="h-5 w-5" />
                    )}
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{currentProfile.support_url}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </footer>

      <ProfileViewer ref={viewerRef} onChange={() => mutateProfiles()} />
    </div>
  );
};

export default MinimalHomePage;
