import { useEffect, useMemo, useState } from "react";
import { useLockFn } from "ahooks";
import yaml from "js-yaml";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Virtuoso } from "react-virtuoso";
import MonacoEditor from "react-monaco-editor";
import { useForm } from "react-hook-form";

import {
  getNetworkInterfaces,
  readProfileFile,
  saveProfileFile,
} from "@/services/cmds";
import getSystem from "@/utils/get-system";
import { useThemeMode } from "@/services/states";
import { BaseSearchBox } from "../base/base-search-box";
import { showNotice } from "@/services/noticeService";
import { cn } from "@root/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  ChevronsUpDown,
  GripVertical,
  Trash2,
  Undo2,
  ArrowDownToLine,
  ArrowUpToLine,
} from "lucide-react";

const portValidator = (value: string): boolean =>
  /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(
    value,
  );
const ipv4CIDRValidator = (value: string): boolean =>
  /^(?:(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))\.){3}(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))(?:\/(?:[12]?[0-9]|3[0-2]))?$/.test(
    value,
  );
const ipv6CIDRValidator = (value: string): boolean =>
  /^([0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7}|::|:(?::[0-9a-fA-F]{1,4}){1,6}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,5}|(?:[0-9a-fA-F]{1,4}:){2}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){3}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){4}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){5}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:)\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$/.test(
    value,
  );
const builtinProxyPolicies = ["DIRECT", "REJECT", "REJECT-DROP", "PASS"];
interface Props {
  proxiesUid: string;
  mergeUid: string;
  profileUid: string;
  property: string;
  open: boolean;
  onClose: () => void;
  onSave?: (prev?: string, curr?: string) => void;
}

const Combobox = ({
  options,
  value,
  onSelect,
  placeholder,
}: {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || placeholder || "Select..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandList>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={(currentValue) => {
                  onSelect(
                    options.find((opt) => opt.toLowerCase() === currentValue) ||
                      "",
                  );
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === option ? "opacity-100" : "opacity-0",
                  )}
                />
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const MultiSelectCombobox = ({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(value);

  const handleSelect = (currentValue: string) => {
    const newSet = new Set(selectedSet);
    if (newSet.has(currentValue)) {
      newSet.delete(currentValue);
    } else {
      newSet.add(currentValue);
    }
    onChange(Array.from(newSet));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-auto min-h-10"
        >
          <div className="flex gap-1 flex-wrap">
            {value && value.length > 0 ? (
              value.map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">
                {placeholder || "Select..."}
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandList>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={() => handleSelect(option)}
                className="cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedSet.has(option) ? "opacity-100" : "opacity-0",
                  )}
                />
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const EditorGroupItem = ({
  type,
  group,
  onDelete,
  id,
}: {
  type: string;
  group: IProxyGroupConfig;
  onDelete: () => void;
  id: string;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
  };
  const isDelete = type === "delete";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center p-2 mb-1 rounded-md bg-secondary"
      {...attributes}
    >
      <div
        {...listeners}
        className="cursor-grab p-1 text-muted-foreground hover:bg-accent rounded-sm"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <p
        className={`flex-1 truncate text-sm ${isDelete ? "line-through text-muted-foreground" : ""}`}
      >
        {group.name}
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onDelete}
      >
        {isDelete ? (
          <Undo2 className="h-4 w-4" />
        ) : (
          <Trash2 className="h-4 w-4 text-destructive" />
        )}
      </Button>
    </div>
  );
};

export const GroupsEditorViewer = (props: Props) => {
  const { mergeUid, proxiesUid, profileUid, property, open, onClose, onSave } =
    props;
  const { t } = useTranslation();
  const themeMode = useThemeMode();
  const [prevData, setPrevData] = useState("");
  const [currData, setCurrData] = useState("");
  const [visualization, setVisualization] = useState(true);
  const [match, setMatch] = useState(() => (_: string) => true);
  const [interfaceNameList, setInterfaceNameList] = useState<string[]>([]);

  const form = useForm<IProxyGroupConfig>({
    defaultValues: {
      type: "select",
      name: "",
      interval: 300,
      timeout: 5000,
      "max-failed-times": 5,
      lazy: true,
    },
  });
  const { control, watch, handleSubmit, getValues } = form;

  const [groupList, setGroupList] = useState<IProxyGroupConfig[]>([]);
  const [proxyPolicyList, setProxyPolicyList] = useState<string[]>([]);
  const [proxyProviderList, setProxyProviderList] = useState<string[]>([]);
  const [prependSeq, setPrependSeq] = useState<IProxyGroupConfig[]>([]);
  const [appendSeq, setAppendSeq] = useState<IProxyGroupConfig[]>([]);
  const [deleteSeq, setDeleteSeq] = useState<string[]>([]);

  const filteredPrependSeq = useMemo(
    () => prependSeq.filter((group) => match(group.name)),
    [prependSeq, match],
  );
  const filteredGroupList = useMemo(
    () => groupList.filter((group) => match(group.name)),
    [groupList, match],
  );
  const filteredAppendSeq = useMemo(
    () => appendSeq.filter((group) => match(group.name)),
    [appendSeq, match],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorder = (
    list: IProxyGroupConfig[],
    startIndex: number,
    endIndex: number,
  ) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  };

  const onPrependDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      let activeIndex = 0;
      let overIndex = 0;
      prependSeq.forEach((item, index) => {
        if (item.name === active.id) activeIndex = index;
        if (item.name === over.id) overIndex = index;
      });
      setPrependSeq(reorder(prependSeq, activeIndex, overIndex));
    }
  };

  const onAppendDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      let activeIndex = 0;
      let overIndex = 0;
      appendSeq.forEach((item, index) => {
        if (item.name === active.id) activeIndex = index;
        if (item.name === over.id) overIndex = index;
      });
      setAppendSeq(reorder(appendSeq, activeIndex, overIndex));
    }
  };

  const fetchContent = async () => {
    try {
      let data = await readProfileFile(property);
      let obj = yaml.load(data) as ISeqProfileConfig | null;
      setPrependSeq(obj?.prepend || []);
      setAppendSeq(obj?.append || []);
      setDeleteSeq(obj?.delete || []);
      setPrevData(data);
      setCurrData(data);
    } catch (error) {
      console.error("Failed to fetch or parse content:", error);
    }
  };

  useEffect(() => {
    if (prependSeq && appendSeq && deleteSeq && visualization) {
      const serialize = () => {
        try {
          setCurrData(
            yaml.dump(
              { prepend: prependSeq, append: appendSeq, delete: deleteSeq },
              { forceQuotes: true },
            ),
          );
        } catch (e: any) {
          showNotice("error", e?.message || e?.toString() || "YAML dump error");
        }
      };
      if (window.requestIdleCallback) {
        window.requestIdleCallback(serialize);
      } else {
        setTimeout(serialize, 0);
      }
    }
  }, [prependSeq, appendSeq, deleteSeq, visualization]);

  const fetchProxyPolicy = async () => {
    try {
      let data = await readProfileFile(profileUid);
      let proxiesData = await readProfileFile(proxiesUid);
      let originGroupsObj = yaml.load(data) as {
        "proxy-groups": IProxyGroupConfig[];
      } | null;
      let originProxiesObj = yaml.load(data) as { proxies: [] } | null;
      let originProxies = originProxiesObj?.proxies || [];
      let moreProxiesObj = yaml.load(proxiesData) as ISeqProfileConfig | null;
      let morePrependProxies = moreProxiesObj?.prepend || [];
      let moreAppendProxies = moreProxiesObj?.append || [];
      let moreDeleteProxies =
        moreProxiesObj?.delete || ([] as string[] | { name: string }[]);
      let proxies = morePrependProxies.concat(
        originProxies.filter(
          (proxy: any) =>
            !moreDeleteProxies.some(
              (del: any) => (del.name || del) === proxy.name,
            ),
        ),
        moreAppendProxies,
      );

      setProxyPolicyList(
        Array.from(
          new Set(
            builtinProxyPolicies.concat(
              prependSeq.map((group) => group.name),
              originGroupsObj?.["proxy-groups"]
                .map((group) => group.name)
                .filter((name) => !deleteSeq.includes(name)) || [],
              appendSeq.map((group) => group.name),
              proxies.map((proxy: any) => proxy.name),
            ),
          ),
        ),
      );
    } catch (error) {
      console.error("Failed to fetch proxy policy:", error);
    }
  };

  const fetchProfile = async () => {
    try {
      let data = await readProfileFile(profileUid);
      let mergeData = await readProfileFile(mergeUid);
      let globalMergeData = await readProfileFile("Merge");

      let originGroupsObj = yaml.load(data) as {
        "proxy-groups": IProxyGroupConfig[];
      } | null;
      let originProviderObj = yaml.load(data) as {
        "proxy-providers": {};
      } | null;
      let originProvider = originProviderObj?.["proxy-providers"] || {};
      let moreProviderObj = yaml.load(mergeData) as {
        "proxy-providers": {};
      } | null;
      let moreProvider = moreProviderObj?.["proxy-providers"] || {};
      let globalProviderObj = yaml.load(globalMergeData) as {
        "proxy-providers": {};
      } | null;
      let globalProvider = globalProviderObj?.["proxy-providers"] || {};
      let provider = { ...originProvider, ...moreProvider, ...globalProvider };

      setProxyProviderList(Object.keys(provider));
      setGroupList(originGroupsObj?.["proxy-groups"] || []);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    }
  };

  const getInterfaceNameList = async () => {
    try {
      let list = await getNetworkInterfaces();
      setInterfaceNameList(list);
    } catch (error) {
      console.error("Failed to get network interfaces:", error);
    }
  };

  useEffect(() => {
    fetchProxyPolicy();
  }, [prependSeq, appendSeq, deleteSeq]);

  useEffect(() => {
    if (open) {
      fetchContent();
      fetchProxyPolicy();
      fetchProfile();
      getInterfaceNameList();
    }
  }, [open]);

  const validateGroup = () => {
    let group = getValues();
    if (group.name === "") {
      throw new Error(t("Group Name Required"));
    }
  };

  const handleSave = useLockFn(async () => {
    try {
      await saveProfileFile(property, currData);
      showNotice("success", t("Saved Successfully"));
      onSave?.(prevData, currData);
      onClose();
    } catch (err: any) {
      showNotice("error", err.toString());
    }
  });

  const groupType = watch("type");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="min-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center pr-8">
            <DialogTitle>{t("Edit Groups")}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisualization((prev) => !prev)}
            >
              {visualization ? t("Advanced") : t("Visualization")}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 mt-4">
          {visualization ? (
            <Form {...form}>
              <form className="h-full flex gap-4">
                <div className="w-1/2 flex flex-col border rounded-md p-4">
                  <h3 className="text-lg font-medium mb-4">
                    {t("Constructor")}
                  </h3>
                  <Separator className="mb-4" />
                  <div className="space-y-3 overflow-y-auto p-1 -mr-3 ">
                    <FormField
                      control={control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Group Type")}</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="select">select</SelectItem>
                              <SelectItem value="url-test">url-test</SelectItem>
                              <SelectItem value="fallback">fallback</SelectItem>
                              <SelectItem value="load-balance">
                                load-balance
                              </SelectItem>
                              <SelectItem value="relay">relay</SelectItem>
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
                          <FormLabel>{t("Group Name")}</FormLabel>
                          <FormControl>
                            <Input {...field} required />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="icon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Proxy Group Icon")}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="proxies"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Use Proxies")}</FormLabel>
                          <MultiSelectCombobox
                            options={proxyPolicyList}
                            value={field.value || []}
                            onChange={field.onChange}
                            placeholder={t("Select proxies...")}
                          />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="use"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Use Provider")}</FormLabel>
                          <MultiSelectCombobox
                            options={proxyProviderList}
                            value={field.value || []}
                            onChange={field.onChange}
                            placeholder={t("Select providers...")}
                          />
                        </FormItem>
                      )}
                    />
                    {(groupType === "url-test" || groupType === "fallback") && (
                      <>
                        <FormField
                          control={control}
                          name="url"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("Health Check Url")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="https://cp.cloudflare.com/generate_204"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="interval"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("Interval")}</FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    placeholder="300"
                                    value={field.value}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseInt(e.target.value, 10) || 0,
                                      )
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    {t("seconds")}
                                  </span>
                                </div>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="timeout"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("Timeout")}</FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    placeholder="5000"
                                    value={field.value}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseInt(e.target.value, 10) || 0,
                                      )
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    {t("millis")}
                                  </span>
                                </div>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="max-failed-times"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("Max Failed Times")}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="5"
                                  value={field.value}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseInt(e.target.value, 10) || 0,
                                    )
                                  }
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                    <FormField
                      control={control}
                      name="interface-name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Interface Name")}</FormLabel>
                          <Combobox
                            options={interfaceNameList}
                            value={field.value}
                            onSelect={field.onChange}
                          />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="routing-mark"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Routing Mark")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value, 10) || 0,
                                )
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {(groupType === "url-test" ||
                      groupType === "fallback" ||
                      groupType === "load-balance") && (
                      <>
                        <FormField
                          control={control}
                          name="lazy"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>{t("Lazy")}</FormLabel>
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
                          name="disable-udp"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>{t("Disable UDP")}</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                    <FormField
                      control={control}
                      name="hidden"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <FormLabel>{t("Hidden")}</FormLabel>
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
                  <div className="flex flex-col gap-2 mt-auto pt-4">
                    <Button
                      type="button"
                      onClick={() => {
                        try {
                          validateGroup();
                          const newGroup = getValues();
                          if (
                            [...prependSeq, ...groupList, ...appendSeq].every(
                              (g) => g.name !== newGroup.name,
                            )
                          )
                            setPrependSeq([newGroup, ...prependSeq]);
                          else throw new Error(t("Group Name Already Exists"));
                        } catch (err: any) {
                          showNotice("error", err.message);
                        }
                      }}
                    >
                      <ArrowUpToLine className="mr-2 h-4 w-4" />
                      {t("Prepend Group")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        try {
                          validateGroup();
                          const newGroup = getValues();
                          if (
                            [...prependSeq, ...groupList, ...appendSeq].every(
                              (g) => g.name !== newGroup.name,
                            )
                          )
                            setAppendSeq([...appendSeq, newGroup]);
                          else throw new Error(t("Group Name Already Exists"));
                        } catch (err: any) {
                          showNotice("error", err.message);
                        }
                      }}
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      {t("Append Group")}
                    </Button>
                  </div>
                </div>

                <Separator orientation="vertical" />

                <div className="w-1/2 flex flex-col">
                  <BaseSearchBox
                    onSearch={(matcher) => setMatch(() => matcher)}
                  />
                  <div className="flex-1 min-h-0 mt-2 rounded-md border">
                    <Virtuoso
                      className="h-full"
                      totalCount={
                        filteredGroupList.length +
                        (filteredPrependSeq.length > 0 ? 1 : 0) +
                        (filteredAppendSeq.length > 0 ? 1 : 0)
                      }
                      itemContent={(index) => {
                        let shift = filteredPrependSeq.length > 0 ? 1 : 0;
                        if (filteredPrependSeq.length > 0 && index === 0) {
                          return (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={onPrependDragEnd}
                            >
                              <SortableContext
                                items={filteredPrependSeq.map((x) => x.name)}
                              >
                                {filteredPrependSeq.map((item) => (
                                  <EditorGroupItem
                                    key={item.name}
                                    id={item.name}
                                    type="prepend"
                                    group={item}
                                    onDelete={() =>
                                      setPrependSeq(
                                        prependSeq.filter(
                                          (v) => v.name !== item.name,
                                        ),
                                      )
                                    }
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          );
                        } else if (index < filteredGroupList.length + shift) {
                          const newIndex = index - shift;
                          const currentGroup = filteredGroupList[newIndex];
                          return (
                            <EditorGroupItem
                              key={currentGroup.name}
                              id={currentGroup.name}
                              type={
                                deleteSeq.includes(currentGroup.name)
                                  ? "delete"
                                  : "original"
                              }
                              group={currentGroup}
                              onDelete={() => {
                                if (deleteSeq.includes(currentGroup.name)) {
                                  setDeleteSeq(
                                    deleteSeq.filter(
                                      (v) => v !== currentGroup.name,
                                    ),
                                  );
                                } else {
                                  setDeleteSeq((prev) => [
                                    ...prev,
                                    currentGroup.name,
                                  ]);
                                }
                              }}
                            />
                          );
                        } else {
                          return (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={onAppendDragEnd}
                            >
                              <SortableContext
                                items={filteredAppendSeq.map((x) => x.name)}
                              >
                                {filteredAppendSeq.map((item) => (
                                  <EditorGroupItem
                                    key={item.name}
                                    id={item.name}
                                    type="append"
                                    group={item}
                                    onDelete={() =>
                                      setAppendSeq(
                                        appendSeq.filter(
                                          (v) => v.name !== item.name,
                                        ),
                                      )
                                    }
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              </form>
            </Form>
          ) : (
            <div className="h-full rounded-md border">
              <MonacoEditor
                height="100%"
                language="yaml"
                value={currData}
                theme={themeMode === "light" ? "vs" : "vs-dark"}
                options={{
                  tabSize: 2,
                  minimap: {
                    enabled: document.documentElement.clientWidth >= 1500,
                  },
                  mouseWheelZoom: true,
                  quickSuggestions: {
                    strings: true,
                    comments: true,
                    other: true,
                  },
                  padding: { top: 16 },
                  fontFamily: `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"${getSystem() === "windows" ? ", twemoji mozilla" : ""}`,
                  fontLigatures: false,
                  smoothScrolling: true,
                }}
                onChange={(value) => setCurrData(value)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("Cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit(handleSave)}>
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
