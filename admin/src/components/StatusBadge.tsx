const colors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PUBLISHED: "bg-blue-100 text-blue-800",
};

const labels: Record<string, string> = {
  PENDING: "Очікує",
  APPROVED: "Схвалено",
  REJECTED: "Відхилено",
  PUBLISHED: "Опубліковано",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}`}
    >
      {labels[status] || status}
    </span>
  );
}
