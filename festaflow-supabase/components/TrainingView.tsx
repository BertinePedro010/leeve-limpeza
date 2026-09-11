"use client";

import { useMemo, useState } from "react";
import { TRAINING_MODULES, type TrainingModule } from "@/lib/training-content";

// Heading -> box style + icon, shared by the on-screen view. "Passo a passo"
// renders as a numbered list (it's a sequence); every other heading renders
// as plain paragraphs, since numbering them would encode an order that
// isn't actually there.
const SECTION_STYLE: Record<string, { box: string; heading: string; icon: string; ordered?: boolean }> = {
  "Para que serve?": { box: "rounded-2xl border bg-white p-5 shadow-sm", heading: "text-slate-500", icon: "🎯" },
  "Como fazer": { box: "rounded-2xl border bg-white p-5 shadow-sm", heading: "text-slate-500", icon: "🛠️" },
  "Passo a passo": { box: "rounded-2xl border bg-white p-5 shadow-sm", heading: "text-slate-500", icon: "🧭", ordered: true },
  "Exemplo": { box: "rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5", heading: "text-slate-500", icon: "💡" },
  "Importante": { box: "rounded-2xl border border-amber-200 bg-amber-50 p-5", heading: "text-amber-700", icon: "⚠️" },
  "Evite este erro": { box: "rounded-2xl border border-rose-200 bg-rose-50 p-5", heading: "text-rose-700", icon: "🚫" },
};

// Strips accents so "endereço" and "endereco" match the same content -
// module text is written without accents (same ASCII convention as the rest
// of this codebase), so a query typed WITH accents would otherwise match
// nothing at all.
function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Searches title, summary, every section (heading + body) and every FAQ
// entry - matches the spec's examples directly ("boleto" -> Ordens de
// Servico, since the payment methods line lives in that module's body).
function matchesSearch(m: TrainingModule, term: string): boolean {
  if (!term) return true;
  const haystack = normalizeSearchText([
    m.title,
    m.summary,
    ...m.sections.flatMap((s) => [s.heading, ...s.body]),
    ...(m.faq ?? []).flatMap((f) => [f.q, f.a]),
  ].join(" \n "));
  return haystack.includes(normalizeSearchText(term));
}

function SectionBlock({ section }: { section: { heading: string; body: string[] } }) {
  const style = SECTION_STYLE[section.heading] ?? { box: "rounded-2xl border bg-white p-5 shadow-sm", heading: "text-slate-500", icon: "•" };
  return <div className={style.box}>
    <h4 className={`text-xs font-black uppercase tracking-wide ${style.heading}`}>{style.icon} {section.heading}</h4>
    {style.ordered
      ? <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-800">{section.body.map((line, i) => <li key={i}>{line}</li>)}</ol>
      : <div className="mt-2 space-y-2 text-sm text-slate-800">{section.body.map((line, i) => <p key={i}>{line}</p>)}</div>}
  </div>;
}

function ModuleContent({ mod }: { mod: TrainingModule }) {
  return <article className="min-w-0 space-y-4">
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><span className="text-2xl">{mod.icon}</span><h3 className="text-xl font-black">{mod.title}</h3></div>
      <p className="mt-2 text-sm text-slate-500">{mod.summary}</p>
    </div>
    {mod.sections.map((s) => <SectionBlock key={s.heading} section={s} />)}
    {mod.faq && <div className="space-y-3">
      {mod.faq.map((f) => <details key={f.q} className="group rounded-2xl border bg-white p-5 shadow-sm">
        <summary className="cursor-pointer list-none font-black text-slate-800 marker:content-none">
          <span className="mr-2 inline-block text-indigo-600 transition-transform group-open:rotate-90">›</span>{f.q}
        </summary>
        <p className="mt-2 pl-5 text-sm text-slate-600">{f.a}</p>
      </details>)}
    </div>}
  </article>;
}

// Full printable manual - same TRAINING_MODULES data as the on-screen view,
// rendered flat top to bottom (never a second, hand-written copy of the text).
function TrainingPrintView({ close }: { close: () => void }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
    <div className="no-print sticky top-0 z-10 flex justify-end gap-2 border-b bg-white p-4">
      <button onClick={() => window.print()} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white">Imprimir / Salvar PDF</button>
      <button onClick={close} className="rounded-xl border px-4 py-2 font-black text-slate-600">Fechar</button>
    </div>
    <div className="print-page mx-auto max-w-3xl p-10">
      <div className="border-b pb-6">
        <h1 className="text-2xl font-black">LeeveLimpeza</h1>
        <p className="text-sm text-slate-500">Manual de Treinamento</p>
        <p className="mt-1 text-xs text-slate-400">Gerado em {new Date().toLocaleString("pt-BR")}</p>
      </div>
      {TRAINING_MODULES.map((m) => <section key={m.id} className="mt-8 break-inside-avoid">
        <h2 className="text-lg font-black">{m.icon} {m.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{m.summary}</p>
        {m.sections.map((s) => <div key={s.heading} className="mt-3">
          <h3 className="text-xs font-black uppercase text-slate-500">{s.heading}</h3>
          <div className="mt-1 space-y-1 text-sm text-slate-800">{s.body.map((line, i) => <p key={i}>{line}</p>)}</div>
        </div>)}
        {m.faq && <div className="mt-3">
          <h3 className="text-xs font-black uppercase text-slate-500">Perguntas frequentes</h3>
          {m.faq.map((f) => <div key={f.q} className="mt-2 text-sm"><p className="font-bold text-slate-800">{f.q}</p><p className="text-slate-600">{f.a}</p></div>)}
        </div>}
      </section>)}
    </div>
  </div>;
}

// Central de Treinamento / Ajuda - static, read-only help content built
// entirely from lib/training-content.ts. Deliberately reads nothing from the
// branch/clients/orders/finance state the rest of the app carries: this
// screen is reachable by every authenticated user regardless of module
// permissions (see canUseModule in SaasApp.tsx) and must never expose
// business data, only instructions on how to use the system.
export default function TrainingView() {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(TRAINING_MODULES[0].id);
  const [showPrint, setShowPrint] = useState(false);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => TRAINING_MODULES.filter((m) => matchesSearch(m, term)), [term]);
  // Keeps the current selection if it still matches the search; otherwise
  // falls back to the first match - a plain render-time derivation, no
  // effect/setState needed to keep it in sync.
  const active = filtered.find((m) => m.id === activeId) ?? filtered[0] ?? null;

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-indigo-600">LeeveLimpeza</p>
      <h2 className="text-2xl font-black">Central de Treinamento</h2>
      <p className="mt-1 text-sm text-slate-500">Aprenda a utilizar o sistema de forma simples e rapida.</p>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar no treinamento..." aria-label="Pesquisar no treinamento" className="w-full rounded-xl border p-3 pl-9 text-sm" />
      </div>
      <button onClick={() => setShowPrint(true)} className="shrink-0 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">📄 Baixar Manual em PDF</button>
    </div>

    {filtered.length === 0 && <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Nenhum conteudo encontrado para &quot;{search}&quot;.</div>}

    {filtered.length > 0 && active && <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-start">
      <nav aria-label="Modulos do treinamento" className="lg:sticky lg:top-4">
        <div className="overflow-x-auto rounded-2xl border bg-white p-2">
          <div className="flex gap-1 lg:flex-col">
            {filtered.map((m) => <button key={m.id} type="button" onClick={() => setActiveId(m.id)} aria-current={active.id === m.id} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-bold lg:whitespace-normal ${active.id === m.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{m.icon}</span><span>{m.title}</span>
            </button>)}
          </div>
        </div>
      </nav>

      <ModuleContent mod={active} />
    </div>}

    {showPrint && <TrainingPrintView close={() => setShowPrint(false)} />}
  </div>;
}
