/**
 * ModHead — encabezado de módulo con la línea del login:
 * panel degradado azul Cálidda, eyebrow, título blanco y acciones.
 */
export default function ModHead({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B5FA5] via-[#0088C7] to-[#00A9CE] text-white p-5 md:p-6 shadow-lg shadow-sky-900/10">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-white/10" />
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[220px]">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-white/75">{eyebrow}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {desc && <p className="text-sm text-white/80 mt-1 max-w-2xl">{desc}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
