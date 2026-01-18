import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useLockFn } from "ahooks";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import {
  createProfile,
  patchProfile,
  importProfile,
  enhanceProfiles,
  createProfileFromShareLink,
  getProfiles,
} from "@/services/cmds";
import { useProfiles } from "@/hooks/use-profiles";
import { showNotice } from "@/services/noticeService";
import { version } from "@root/package.json";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, Loader2, X } from "lucide-react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "@root/lib/utils";

interface Props {
  onChange: (isActivating?: boolean) => void;
}

export interface ProfileViewerRef {
  create: () => void;
  edit: (item: IProfileItem) => void;
}

export const ProfileViewer = forwardRef<ProfileViewerRef, Props>(
  (props, ref) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [openType, setOpenType] = useState<"new" | "edit">("new");
    const { profiles, patchProfiles } = useProfiles();
    const fileDataRef = useRef<string | null>(null);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [importUrl, setImportUrl] = useState("");
    const [isUrlValid, setIsUrlValid] = useState(true);
    const [isCheckingUrl, setIsCheckingUrl] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState("default");

    const form = useForm<IProfileItem>({
      defaultValues: {
        type: "remote",
        name: "",
        desc: "",
        url: "",
        option: {
          with_proxy: false,
          self_proxy: false,
          danger_accept_invalid_certs: false,
        },
      },
    });

    const { control, watch, handleSubmit, reset, setValue } = form;

    useImperativeHandle(ref, () => ({
      create: () => {
        reset({
          type: "remote",
          name: "",
          desc: "",
          url: "",
          option: {
            with_proxy: false,
            self_proxy: false,
            danger_accept_invalid_certs: false,
          },
        });
        fileDataRef.current = null;
        setImportUrl("");
        setShowAdvanced(false);
        setOpenType("new");
        setOpen(true);
      },
      edit: (item) => {
        reset(item);
        fileDataRef.current = null;
        setImportUrl(item.url || "");
        setShowAdvanced(true);
        setOpenType("edit");
        setOpen(true);
      },
    }));

    const selfProxy = watch("option.self_proxy");
    const withProxy = watch("option.with_proxy");
    useEffect(() => {
      if (selfProxy) setValue("option.with_proxy", false);
    }, [selfProxy, setValue]);
    useEffect(() => {
      if (withProxy) setValue("option.self_proxy", false);
    }, [withProxy, setValue]);

    useEffect(() => {
      if (!importUrl) {
        setIsUrlValid(true);
        setIsCheckingUrl(false);
        return;
      }
      setIsCheckingUrl(true);

      const handler = setTimeout(() => {
        const isValid = /^(https?|vmess|vless|ss|socks|trojan):\/\//.test(
          importUrl,
        );
        setIsUrlValid(isValid);
        setIsCheckingUrl(false);
      }, 500);
      return () => {
        clearTimeout(handler);
      };
    }, [importUrl]);

    const handleImport = useLockFn(async () => {
      if (!importUrl || !isUrlValid) return;
      setIsImporting(true);

      const isShareLink = /^(vmess|vless|ss|socks|trojan):\/\//.test(importUrl);

      try {
        if (isShareLink) {
          await createProfileFromShareLink(importUrl, selectedTemplate);
          showNotice("success", t("Profile created from link successfully"));
        } else {
          await importProfile(importUrl);
          showNotice("success", t("Profile Imported Successfully"));
        }
        props.onChange();
        await enhanceProfiles();
        setOpen(false);
      } catch (err: any) {
        const errorMessage =
          typeof err === "string" ? err : err.message || String(err);
        if (errorMessage.startsWith("HWID_LIMIT:")) {
          const hwidMessage = errorMessage.replace("HWID_LIMIT:", "");
          window.dispatchEvent(
            new CustomEvent("show-hwid-error", { detail: hwidMessage }),
          );
        } else if (!isShareLink && errorMessage.includes("failed to fetch")) {
          showNotice("info", t("Import failed, retrying with Clash proxy..."));
          try {
            await importProfile(importUrl, {
              with_proxy: false,
              self_proxy: true,
            });
            showNotice("success", t("Profile Imported with Clash proxy"));
            props.onChange();
            await enhanceProfiles();
            setOpen(false);
          } catch (retryErr: any) {
            showNotice(
              "error",
              `${t("Import failed even with Clash proxy")}: ${retryErr?.message || retryErr.toString()}`,
            );
          }
        } else {
          showNotice("error", errorMessage);
        }
      } finally {
        setIsImporting(false);
      }
    });

    const onCopyLink = async () => {
      const text = await readText();
      if (text) setImportUrl(text);
    };

    const handleSaveAdvanced = useLockFn(
      handleSubmit(async (formData) => {
        const form = {
          ...formData,
          url: formData.url || importUrl,
        } as Partial<IProfileItem>;

        setLoading(true);
        try {
          if (!form.type) throw new Error("`Type` should not be null");
          if (form.type === "remote" && !form.url)
            throw new Error("The URL should not be null");

          // Clean option fields: only send what user actually set
          let option = form.option ? { ...form.option } : undefined;
          if (option) {
            if (
              (option as any).update_interval != null &&
              (option as any).update_interval !== ""
            ) {
              // ensure number
              (option as any).update_interval = +((option as any)
                .update_interval as any);
            } else {
              delete (option as any).update_interval;
            }
            if (
              typeof option.user_agent === "string" &&
              option.user_agent.trim() === ""
            ) {
              delete (option as any).user_agent;
            }
          }

          const providedName =
            (form as any).name && String((form as any).name).trim();
          const providedDesc =
            (form as any).desc && String((form as any).desc).trim();

          const item: Partial<IProfileItem> = {
            ...form,
            // Only include name/desc when user explicitly entered them
            name: providedName ? (providedName as string) : undefined,
            desc: providedDesc ? (providedDesc as string) : undefined,
            option,
          };

          const isUpdate = openType === "edit";
          const wasCurrent = isUpdate && form.uid === (profiles?.current ?? "");

          if (openType === "new") {
            // Detect newly created profile and activate it explicitly
            const before = await getProfiles().catch(() => null);
            const beforeUids = new Set(
              (before?.items || []).map((i: any) => i?.uid).filter(Boolean),
            );

            await createProfile(item, fileDataRef.current);

            const after = await getProfiles().catch(() => null);
            const newRemoteLocal = (after?.items || []).find(
              (i: any) =>
                i &&
                (i.type === "remote" || i.type === "local") &&
                i.uid &&
                !beforeUids.has(i.uid),
            );
            const newUid = (newRemoteLocal && newRemoteLocal.uid) as
              | string
              | undefined;

            if (newUid) {
              try {
                await patchProfiles({ current: newUid });
              } catch {}
            }

            showNotice("success", t("Profile Created Successfully"));
            setOpen(false);
            props.onChange(true);
            return;
          } else {
            if (!form.uid) throw new Error("UID not found");
            await patchProfile(form.uid as string, item);
            showNotice("success", t("Profile Updated Successfully"));
          }

          setOpen(false);
          props.onChange(wasCurrent);
        } catch (err: any) {
          showNotice("error", err.message || err.toString());
        } finally {
          setLoading(false);
        }
      }),
    );

    const formType = watch("type");
    const isRemote = formType === "remote";
    const isLocal = formType === "local";

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {openType === "new" ? t("Create Profile") : t("Edit Profile")}
            </DialogTitle>
          </DialogHeader>

          {openType === "new" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 flex-grow sm:flex-grow-0">
                  <Input
                    type="text"
                    placeholder={t("Profile URL")}
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={isImporting}
                    className={cn(
                      "h-9 min-w-[200px] flex-grow sm:w-65",
                      !isUrlValid &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  {importUrl ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Clear")}
                      onClick={() => setImportUrl("")}
                      className="h-9 w-9 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Paste")}
                      onClick={onCopyLink}
                      className="h-9 w-9 flex-shrink-0"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Button
                  onClick={handleImport}
                  disabled={
                    !importUrl || isCheckingUrl || !isUrlValid || isImporting
                  }
                  className="flex-shrink-0 min-w-[5.5rem]"
                >
                  {isCheckingUrl || isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("Import")
                  )}
                </Button>
                {!isUrlValid && importUrl && (
                  <p className="text-sm text-destructive px-1">
                    {t("Invalid Profile URL")}
                  </p>
                )}
              </div>

              {/^(vmess|vless|ss|socks|trojan):\/\//.test(importUrl) && (
                <div className="space-y-2">
                  <Label>{t("Template")}</Label>
                  <Select
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {t("Default Template")}
                      </SelectItem>
                      <SelectItem value="without_ru">
                        {t("Template without RU Rules")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced
                  ? t("Hide Advanced Settings")
                  : t("Show Advanced Settings")}
              </Button>
            </div>
          )}

          {(openType === "edit" || showAdvanced) && (
            <Form {...form}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveAdvanced();
                }}
                className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pt-4"
              >
                <FormField
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Type")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={openType === "edit"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="remote">Remote</SelectItem>
                          <SelectItem value="local">Local</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("Profile Name")} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="desc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Descriptions")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("Profile Description")}
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isRemote && (
                  <FormField
                    control={control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Subscription URL")}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t("Leave blank to use the URL above")}
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {isLocal && openType === "new" && (
                  <FormItem>
                    <FormLabel>{t("File")}</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".yml,.yaml"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setValue(
                              "name",
                              form.getValues("name") || file.name,
                            );
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              fileDataRef.current = event.target
                                ?.result as string;
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}

                {isRemote && (
                  <div className="space-y-4 rounded-md border p-4">
                    <FormField
                      control={control}
                      name="option.update_interval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Update Interval (mins)")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="1440"
                              {...field}
                              onChange={(e) => field.onChange(+e.target.value)}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="option.user_agent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>User Agent</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={`koala-clash/v${version}`}
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="option.update_always"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <FormLabel>{t("Update on Startup")}</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="option.with_proxy"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>{t("Use System Proxy")}</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="option.self_proxy"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>{t("Use Clash Proxy")}</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="option.danger_accept_invalid_certs"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-destructive">
                            {t("Accept Invalid Certs (Danger)")}
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <button type="submit" className="hidden" />
              </form>
            </Form>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("Cancel")}
              </Button>
            </DialogClose>
            {(openType === "edit" || showAdvanced) && (
              <Button
                type="button"
                onClick={handleSaveAdvanced}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("Save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
