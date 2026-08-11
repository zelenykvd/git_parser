import Icon from "./Icon";

const config: Record<string, { cls: string; icon: string; spin?: boolean }> = {
  PENDING: { cls: "bg-warn-soft text-warn", icon: "schedule" },
  APPROVED: { cls: "bg-success-soft text-success", icon: "check_circle" },
  PUBLISHING: { cls: "bg-violet-soft text-violet", icon: "sync", spin: true },
  REJECTED: { cls: "bg-danger-soft text-danger", icon: "cancel" },
  PUBLISHED: { cls: "bg-brand-soft text-brand", icon: "public" },
};

const labels: Record<string, string> = {
  PENDING: "Очікує",
  APPROVED: "Схвалено",
  PUBLISHING: "Публікується",
  REJECTED: "Відхилено",
  PUBLISHED: "Опубліковано",
};

export default function StatusBadge({ status }: { status: string }) {
  const c = config[status] || { cls: "bg-elev text-muted", icon: "help" };
  return (
    <span
      className={`inline-flex items-center gap-1 pl-1.5 pr-2.5 py-0.5 rounded-full text-xs font-medium animate-popIn ${c.cls}`}
    >
      <Icon name={c.icon} size={14} className={c.spin ? "animate-spin" : ""} />
      {labels[status] || status}
    </span>
  );
}
