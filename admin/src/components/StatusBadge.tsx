import Icon from "./Icon";

const config: Record<string, { bg: string; text: string; icon: string }> = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", icon: "schedule" },
  APPROVED: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "check_circle" },
  REJECTED: { bg: "bg-red-50", text: "text-red-700", icon: "cancel" },
  PUBLISHED: { bg: "bg-blue-50", text: "text-blue-700", icon: "public" },
};

const labels: Record<string, string> = {
  PENDING: "Очікує",
  APPROVED: "Схвалено",
  REJECTED: "Відхилено",
  PUBLISHED: "Опубліковано",
};

export default function StatusBadge({ status }: { status: string }) {
  const c = config[status] || { bg: "bg-neutral-100", text: "text-neutral-600", icon: "help" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      <Icon name={c.icon} size={14} />
      {labels[status] || status}
    </span>
  );
}
