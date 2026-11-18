"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { continueAfterDay, getDayReport, subscribeDayReport } from "../sim";
import styles from "./boletim.module.css";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const serverSnapshot = () => null;
const CAT: Record<string, string> = { verba: "Verba pública", obra: "Obras e terrenos", salario: "Salários", utilidades: "Energia, água e reparos", cantina: "Cantina", evento: "Eventos", estoque: "Estoque", missao: "Missões", melhoria: "Melhorias e projetos" };

function CountUp({ value, money }: { value: number; money?: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money ? currency.format(v) : v}</>;
}
function Trend({ now, before, invert }: { now: number; before?: number; invert?: boolean }) {
  if (before === undefined) return <span className={styles.trendFlat}>primeiro dia</span>;
  const d = Math.round(now - before);
  if (d === 0) return <span className={styles.trendFlat}>= igual a ontem</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={good ? styles.trendUp : styles.trendDown}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} vs. ontem</span>;
}

/** Boletim do dia: a partida fica pausada até o jogador escolher continuar. */
export function DayEndReport() {
  const report = useSyncExternalStore(subscribeDayReport, getDayReport, serverSnapshot);
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!report) return;
    setPage(0);
    if (document.pointerLockElement) document.exitPointerLock();
    root.current?.focus();
  }, [report]);
  if (!report) return null;
  const d = report.director;
  const pr = report.progress;
  const net = report.income - report.expenses;
  const c = pr?.compare ?? null;
  const stars = d?.starsEnd ?? 3;
  const score = Math.round(
    (stars / 5) * 40 + Math.min(100, pr?.learning ?? 50) * 0.2 + Math.min(100, pr?.hygiene ?? 50) * 0.15 + (net >= 0 ? 15 : Math.max(0, 15 + net / 200)) +
    (d ? Math.max(0, 10 - d.occurrences.ignored * 4) : 5),
  );
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
  const gradeText = { A: "Dia exemplar", B: "Bom dia de gestão", C: "Dia regular", D: "Dia difícil", E: "Dia crítico" }[grade];
  const cats = Object.entries(report.byCat ?? {}).filter(([, v]) => Math.round(v) !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxCat = Math.max(1, ...cats.map(([, v]) => Math.abs(v)));
  const pages = ["Resumo", "Dinheiro", "Escola", "Pessoas", "Amanhã"];
  const next = () => setPage((p) => Math.min(pages.length - 1, p + 1));
  return (
    <div className={styles.wrap} role="dialog" aria-modal="true" aria-labelledby="boletim-title" ref={root} tabIndex={-1}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1)); }}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <div>
            <small>Boletim do dia · jogo pausado</small>
            <h2 id="boletim-title">Fim do dia {report.day}</h2>
          </div>
          <div className={styles.grade} data-grade={grade}><b>{grade}</b><span>{gradeText}</span></div>
        </header>
        <nav className={styles.pages} aria-label="Páginas do boletim">
          {pages.map((p, i) => <button key={p} className={i === page ? styles.pageOn : ""} onClick={() => setPage(i)} aria-current={i === page}>{i + 1}. {p}</button>)}
        </nav>
        <div className={styles.body}>
          {page === 0 && (
            <>
              <div className={styles.cards}>
                <div className={styles.card}><small>Saldo do dia</small><b className={net < 0 ? styles.neg : styles.pos}>{net >= 0 ? "+" : ""}<CountUp value={net} money /></b><Trend now={net} before={c ? c.income - c.expenses : undefined} /></div>
                <div className={styles.card}><small>Aprendizagem</small><b><CountUp value={pr?.learning ?? 0} /></b><Trend now={pr?.learning ?? 0} before={c?.learning} /></div>
                <div className={styles.card}><small>Refeições</small><b><CountUp value={report.meals} /></b><Trend now={report.meals} before={c?.meals} /></div>
                <div className={styles.card}><small>Higiene</small><b><CountUp value={pr?.hygiene ?? 0} /></b><Trend now={pr?.hygiene ?? 0} before={c?.hygiene} /></div>
                <div className={styles.card}><small>Presença</small><b>{d?.attendance ?? "—"}<em>/{d?.expected ?? report.enrolled}</em></b><Trend now={d?.attendance ?? 0} before={c?.attendance} /></div>
                <div className={styles.card}><small>Reputação</small><b>{(d?.starsEnd ?? 0).toFixed(1)}★</b><span className={(d?.starsEnd ?? 0) >= (d?.starsStart ?? 0) ? styles.trendUp : styles.trendDown}>começou em {(d?.starsStart ?? 0).toFixed(1)}★</span></div>
              </div>
              {d?.observation && <p className={styles.quote}>“{d.observation}”</p>}
              {d?.focus && <p className={styles.note}><b>Prioridade do dia ({d.focus.area}):</b> {d.focus.result ?? "sem avaliação"}</p>}
            </>
          )}
          {page === 1 && (
            <>
              <div className={styles.money}>
                <div><small>Saldo inicial</small><b>{currency.format(d?.startBudget ?? report.budget - net)}</b></div>
                <div><small>Entradas</small><b className={styles.pos}>+{currency.format(report.income)}</b></div>
                <div><small>Saídas</small><b className={styles.neg}>−{currency.format(report.expenses)}</b></div>
                <div><small>Saldo para amanhã</small><b>{currency.format(report.budget)}</b></div>
              </div>
              <h3>Para onde foi o dinheiro</h3>
              {cats.length === 0 && <p className={styles.note}>Sem movimentações registradas por categoria (save anterior à atualização).</p>}
              {cats.map(([k, v]) => (
                <div key={k} className={styles.bar}>
                  <span>{CAT[k] ?? k}</span>
                  <div><i className={v < 0 ? styles.barNeg : styles.barPos} style={{ width: `${(Math.abs(v) / maxCat) * 100}%` }} /></div>
                  <b className={v < 0 ? styles.neg : styles.pos}>{v > 0 ? "+" : ""}{currency.format(v)}</b>
                </div>
              ))}
              {c && <p className={styles.note}>Ontem: entradas {currency.format(c.income)} · saídas {currency.format(c.expenses)}.</p>}
              {report.partial && <p className={styles.note}>Save antigo: o total considera os lançamentos disponíveis.</p>}
            </>
          )}
          {page === 2 && pr && (
            <>
              <h3>Problemas</h3>
              <ul className={styles.list}>
                {pr.resolved.map((x, i) => <li key={`r${i}`} className={styles.ok}>✓ Resolvido: {x}</li>)}
                {pr.pending.map((x, i) => <li key={`p${i}`} className={styles.warnLi}>! Pendente: {x}</li>)}
                {!pr.resolved.length && !pr.pending.length && <li>Nenhum problema registrado hoje.</li>}
              </ul>
              {d && <p className={styles.note}>Incidentes: {d.occurrences.opened} abertos · {d.occurrences.resolved} resolvidos · {d.occurrences.ignored} ignorados · {d.actions} ações do diretor · fila máxima {report.queuePeak}.</p>}
              <h3>Obras, projetos e objetivos</h3>
              <ul className={styles.list}>
                {pr.works.map((x) => <li key={x}>🏗 {x}</li>)}
                {pr.projects.map((x) => <li key={x}>📋 {x}</li>)}
                {pr.objectives.map((x) => <li key={x} className={styles.ok}>🏆 {x}</li>)}
                {d && d.missionsDone > 0 && <li className={styles.ok}>{d.missionsDone} missão(ões) rápida(s) concluída(s)</li>}
                {!pr.works.length && !pr.projects.length && !pr.objectives.length && !(d?.missionsDone) && <li>Nada em andamento. Que tal iniciar um projeto no Gabinete?</li>}
              </ul>
              {pr.upkeep > 0 && <p className={styles.note}>Manutenção das melhorias hoje: {currency.format(pr.upkeep)}.</p>}
            </>
          )}
          {page === 3 && pr && (
            <>
              <h3>Destaques dos alunos</h3>
              <ul className={styles.list}>{pr.highlights.length ? pr.highlights.map((x) => <li key={x}>⭐ {x}</li>) : <li>Sem destaques registrados hoje.</li>}</ul>
              {pr.semester && <><h3>Relatório do semestre</h3><ul className={styles.list}>{pr.semester.map((x) => <li key={x}>{x}</li>)}</ul></>}
              {pr.graduation && <><h3>🎓 Formatura</h3><ul className={styles.list}>{pr.graduation.map((x) => <li key={x}>{x}</li>)}</ul></>}
            </>
          )}
          {page === 4 && pr && (
            <>
              <h3>Confirmado para amanhã</h3>
              <ul className={styles.list}>{pr.tomorrow.length ? pr.tomorrow.map((x) => <li key={x}>📅 {x}</li>) : <li>Nenhum acontecimento agendado. Use o Gabinete para iniciar projetos, competições ou planejar obras.</li>}</ul>
              <p className={styles.note}>A prévia lista apenas o que já está agendado na simulação.</p>
            </>
          )}
        </div>
        <footer className={styles.foot}>
          {page < pages.length - 1 ? (
            <>
              <button onClick={next}>Próxima página →</button>
              <button className={styles.ghost} onClick={continueAfterDay}>Pular e começar o dia {report.day + 1}</button>
            </>
          ) : (
            <button className={styles.go} onClick={continueAfterDay}>Começar próximo dia</button>
          )}
        </footer>
      </div>
    </div>
  );
}
