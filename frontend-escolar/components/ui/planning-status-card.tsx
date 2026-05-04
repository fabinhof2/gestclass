type PlanningStatusCardProps = {
  title: string;
  value: string;
  note: string;
};

export default function PlanningStatusCard({
  title,
  value,
  note,
}: PlanningStatusCardProps) {
  return (
    <div className="card-base p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <h3 className="mt-2 text-3xl font-bold text-slate-900">{value}</h3>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}