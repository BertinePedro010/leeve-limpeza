import BlockedScreenClient from "@/components/BlockedScreenClient";

// Deliberately public: no requireUser(), no DB/Prisma call, no data fetch.
// Must stay reachable no matter what (that is the whole point of this
// screen), and must never reveal any internal data - clients, OS, financial
// figures, or technical details - to whoever lands here.
export default function BlockedPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-8 text-center">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-black text-slate-900">Acesso temporariamente bloqueado</h1>
        <p className="mt-3 text-sm text-slate-500">
          O acesso ao LeeveLimpeza está temporariamente bloqueado por pendência financeira.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Para regularizar o acesso, entre em contato com o financeiro ou suporte.
        </p>
        <BlockedScreenClient />
      </div>
    </div>
  );
}
