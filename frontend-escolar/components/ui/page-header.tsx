type PageHeaderProps = {
  title: string;
  description: string;
};

export default function PageHeader({
  title,
  description,
}: PageHeaderProps) {
  return (
    <div className="card-base relative mb-6 overflow-hidden px-6 py-5 md:px-7 md:py-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-[rgba(142,185,173,0.12)] via-[rgba(216,141,98,0.08)] to-transparent" />
      <div className="relative">
        <div className="mb-3 inline-flex items-center rounded-full border border-[rgba(47,108,103,0.14)] bg-white/55 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary)]">
          EduConnect
        </div>
        <h1 className="page-title text-3xl md:text-5xl font-bold leading-none">
          {title}
        </h1>
        <p className="page-subtitle mt-3 max-w-3xl text-sm md:text-base leading-7">
          {description}
        </p>
      </div>
    </div>
  );
}
