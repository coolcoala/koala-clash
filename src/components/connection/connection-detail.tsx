import dayjs from "dayjs";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useLockFn } from "ahooks";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deleteConnection } from "@/services/api";
import parseTraffic from "@/utils/parse-traffic";
import { t } from "i18next";
import { Button } from "@/components/ui/button";

export interface ConnectionDetailRef {
  open: (detail: IConnectionsItem) => void;
}

export const ConnectionDetail = forwardRef<ConnectionDetailRef>(
  (props, ref) => {
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<IConnectionsItem>(null!);

    useImperativeHandle(ref, () => ({
      open: (detail: IConnectionsItem) => {
        setDetail(detail);
        setOpen(true);
      },
    }));

    const handleOpenChange = (isOpen: boolean) => {
      setOpen(isOpen);
    };

    if (!detail) return null;

    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-[520px] overflow-y-auto p-0 flex flex-col"
        >
          <SheetHeader className="p-6 pb-4">
            <SheetTitle>{t("Connection Details")}</SheetTitle>
          </SheetHeader>
          <div className="flex-grow overflow-y-auto p-6 pt-0">
            <InnerConnectionDetail
              data={detail}
              onClose={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  },
);

interface InnerProps {
  data: IConnectionsItem;
  onClose?: () => void;
}

const InnerConnectionDetail = ({ data, onClose }: InnerProps) => {
  const { metadata, rulePayload } = data;
  const chains = [...data.chains].reverse().join(" / ");
  const rule = rulePayload ? `${data.rule}(${rulePayload})` : data.rule;
  const host = metadata.host
    ? `${metadata.host}:${metadata.destinationPort}`
    : `${metadata.remoteDestination}:${metadata.destinationPort}`;
  const Destination = metadata.destinationIP
    ? metadata.destinationIP
    : metadata.remoteDestination;

  const information = [
    { label: t("Host"), value: host },
    { label: t("Downloaded"), value: parseTraffic(data.download).join(" ") },
    { label: t("Uploaded"), value: parseTraffic(data.upload).join(" ") },
    {
      label: t("DL Speed"),
      value: parseTraffic(data.curDownload ?? -1).join(" ") + "/s",
    },
    {
      label: t("UL Speed"),
      value: parseTraffic(data.curUpload ?? -1).join(" ") + "/s",
    },
    {
      label: t("Chains"),
      value: chains,
    },
    { label: t("Rule"), value: rule },
    {
      label: t("Process"),
      value: `${metadata.process}${
        metadata.processPath ? `(${metadata.processPath})` : ""
      }`,
    },
    { label: t("Time"), value: dayjs(data.start).fromNow() },
    {
      label: t("Source"),
      value: `${metadata.sourceIP}:${metadata.sourcePort}`,
    },
    { label: t("Destination"), value: Destination },
    { label: t("DestinationPort"), value: `${metadata.destinationPort}` },
    { label: t("Type"), value: `${metadata.type}(${metadata.network})` },
  ];

  const onDelete = useLockFn(async () => deleteConnection(data.id));

  return (
    <div className="select-text text-muted-foreground">
      {information.map((each) => (
        <div key={each.label} className="mb-1">
          <b className="text-foreground">{each.label}</b>
          <span className="break-all text-foreground">: {each.value}</span>
        </div>
      ))}

      <div className="text-right mt-4">
        <Button
          title={t("Close Connection")}
          onClick={() => {
            onDelete();
            onClose?.();
          }}
        >
          {t("Close Connection")}
        </Button>
      </div>
    </div>
  );
};
