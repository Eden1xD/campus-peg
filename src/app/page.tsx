import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "Escola viva",
    body: "Alunos chegam pela rua, passam pelo portão, sentam em carteiras reais e formam fila quando a cantina não dá conta.",
  },
  {
    title: "Construção com consequência",
    body: "Prévia verde/vermelha, custo, porta e rota validados com A*. Obras passam por 8 etapas com trabalhadores no canteiro.",
  },
  {
    title: "Diretor no mundo",
    body: "Entre em primeira pessoa, ande pela escola com colisão e cumpra missões de inspeção em locais específicos.",
  },
  {
    title: "Materiais procedurais PBR",
    body: "Asfalto, concreto, tijolo, madeira, vidro, grama e piso tátil com cor, normal e roughness gerados no dispositivo.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,#2b1f45,#0b0912_60%)] px-6 py-14 text-[#f4efff]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#8b6ad0] to-[#5c3f9c] text-sm font-extrabold tracking-wide shadow-lg">
              PEG
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#b6aac9]">Progressão Estudantil Gremista</p>
              <p className="text-sm font-semibold">Plataforma PEG</p>
            </div>
          </div>
          <span className="rounded-full border border-[#b79be6]/30 bg-[#1a1428]/70 px-3 py-1 text-xs text-[#c8b8e6]">
            rota isolada · protótipo
          </span>
        </header>

        <section className="grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b79be6]">Novo módulo experimental</p>
            <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.02] text-white">
              PEG — <span className="text-[#d3bdf7]">Minha Escola</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#c3b8d6]">
              Uma escola brasileira contemporânea em 3D: rua com faixa de pedestres e piso tátil, portão e guarita, sala de
              aula com interior funcional, cantina com fila real, obras por etapas, economia explicada e missões — tudo com
              o mesmo PEG, em uma rota separada que não altera autenticação, banco oficial ou XP.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/teste-escola"
                className="inline-flex items-center gap-2 rounded-xl border border-[#c8b0f6]/40 bg-gradient-to-br from-[#8a68cf] to-[#64459f] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(98,67,158,0.45)] transition hover:-translate-y-0.5"
              >
                Entrar na escola 3D
                <span aria-hidden="true">→</span>
              </Link>
              <span className="text-xs text-[#9c8fb3]">Melhor em desktop com WebGL ativo. Também funciona no celular.</span>
            </div>
          </div>

          <div className="rounded-3xl border border-[#b79be6]/25 bg-[#17111f]/85 p-6 shadow-[0_24px_70px_rgba(5,3,10,0.6)]">
            <div className="flex items-center justify-between text-xs text-[#a99bbf]">
              <span>Prévia da rotina</span>
              <span>dia 1 · 07:40</span>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["07:00", "Ônibus param no ponto; alunos cruzam a faixa e entram pelo portão."],
                ["07:45", "Turma A ocupa as carteiras; professora conduz a aula."],
                ["09:15", "Intervalo: pátio coberto, bebedouro e fila da cantina."],
                ["11:30", "Almoço: mesas reais definem a fila; merenda consome estoque."],
                ["15:15", "Saída: alunos retornam ao portão e desaparecem do mapa."],
              ].map(([time, text]) => (
                <div key={time} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                  <span className="shrink-0 font-mono text-xs text-[#f0b95a]">{time}</span>
                  <span className="text-xs leading-relaxed text-[#cfc5e1]">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-[#b79be6]/20 bg-[#160f22]/70 p-5">
              <h2 className="text-sm font-semibold text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#b7abc9]">{feature.body}</p>
            </article>
          ))}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-[#8c80a3]">
          <span>Salvamento local + PostgreSQL · anúncios opcionais do PEG · sem XP oficial nesta etapa</span>
          <Link className="text-[#c8b0f6] hover:underline" href="/teste-escola">
            Abrir /teste-escola
          </Link>
        </footer>
      </div>
    </main>
  );
}
