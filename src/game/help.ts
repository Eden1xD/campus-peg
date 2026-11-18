/**
 * Ajuda contextual: todas as explicações são derivadas do estado real da simulação.
 * Nenhuma resposta é inventada — se não houver dado, o problema não aparece.
 */
import { BUILDABLE_BY_KIND, GATE, phaseFor } from "./config";
import { dir, incidentSteps, OCC_INFO } from "./director";
import { entryPoint, footprintOf } from "./layout";
import { findPath } from "./nav";
import { isSensitive, noiseAt, noiseLabel } from "./noise";
import { prog, roomLabelFor } from "./progression";
import { canteenCounters } from "./director";
import type { Sim } from "./sim";

export interface Diagnostic {
  id: string;
  severity: 1 | 2 | 3;
  title: string;
  what: string;
  why: string;
  options: string[];
  prevent: string;
  steps?: string[];
  x?: number;
  z?: number;
  w?: number;
  d?: number;
}

export function diagnostics(sim: Sim): Diagnostic[] {
  const w = sim.world;
  const d = dir(w);
  const out: Diagnostic[] = [];
  const students = w.agents.filter((a) => a.role === "student" && (a.status ?? "ativo") === "ativo");
  // incidentes abertos (com etapa atual)
  for (const o of d.occurrences.filter((x) => x.status === "aberta")) {
    const steps = incidentSteps(o);
    const cur = steps[o.stage];
    out.push({
      id: `inc-${o.id}`, severity: 3, title: o.title,
      what: o.type === "fiscalizacao" ? "Um fiscal está avaliando higiene, organização e segurança." : `Etapa ${Math.min(o.stage + 1, steps.length)} de ${steps.length}: ${cur?.title ?? "verificação"}.`,
      why: o.cause || OCC_INFO[o.type].how,
      options: cur ? cur.options(sim, o).map((op) => `${op.label}${op.cost ? ` (R$ ${op.cost})` : ""}${op.block ? " — indisponível" : ""}`) : [],
      prevent: o.type === "cano" ? "Mantenha a conservação de banheiros e cantina acima de 80% e use reparos definitivos." :
        o.type === "energia" ? "Reforce o quadro elétrico antes de instalar muitos computadores e ar-condicionado." :
        o.type === "merenda" ? "Suba o estoque mínimo, mantenha a reposição automática e uma reserva." :
        o.type === "confusao" ? "Ânimo alto e áreas de convivência confortáveis reduzem conflitos; prefira mediação." :
        o.type === "professor" ? "Professores com descanso baixo faltam mais: contrate equipe suficiente." : "Mantenha limpeza e organização em dia.",
      steps: steps.map((s, i) => `${i < o.stage ? "✓" : i === o.stage ? "→" : "·"} ${s.title}`),
      x: o.x, z: o.z, w: 3, d: 3,
    });
  }
  // salas com mais alunos que carteiras
  const seats = sim.seats.filter((s) => s.kind === "classroom").length;
  const noSeat = students.filter((a) => a.waitReason === "sem-assento");
  if (students.length > seats || noSeat.length) {
    const room = w.buildings.find((b) => b.kind === "classroom" && b.progress >= 1);
    out.push({
      id: "assentos", severity: 3, title: "Faltam carteiras",
      what: `${noSeat.length || students.length - seats} aluno(s) sem lugar em aula.`,
      why: `A escola tem ${seats} carteiras em salas prontas e ${students.length} alunos ativos.`,
      options: ["Investimento do dia: ampliar salas (+3 carteiras)", "Construir outra sala (o encaixe permite encostar na existente)", "Reduzir matrículas em Alunos"],
      prevent: "Antes de aceitar novas matrículas, confira a capacidade no Boletim do dia.",
      x: room?.x, z: room?.z, w: room ? footprintOf(room).w : 4, d: room ? footprintOf(room).d : 4,
    });
  }
  // acessos interrompidos
  for (const b of w.buildings) {
    if (b.progress < 1 || b.kind === "path" || b.kind === "tactile" || BUILDABLE_BY_KIND[b.kind]?.open) continue;
    const r = findPath(sim.grid, { x: GATE.x, z: GATE.z + 1.5 }, entryPoint(b), { maxExpanded: 15000 });
    if (!r.reachable) {
      const e = entryPoint(b);
      out.push({ id: `acesso-${b.id}`, severity: 3, title: `${roomLabelFor(b, w.buildings)} sem acesso`,
        what: "Ninguém consegue chegar à porta a partir do portão.", why: "A entrada está cercada por outra construção ou fora da área comprada.",
        options: ["Mover a construção que bloqueia (Mover no prédio)", "Girar o prédio para a porta dar para um caminho", "Construir corredor coberto ou caminho"],
        prevent: "Na prévia, a seta amarela mostra a porta e a área de 2 m que precisa ficar livre.", x: e.x, z: e.z, w: 2.2, d: 2.2 });
    }
  }
  // cantina: capacidade de atendimento × demanda
  const canteen = w.buildings.find((b) => b.kind === "canteen" && b.progress >= 1);
  if (canteen && w.daily.queuePeak > 5) {
    const perMin = (canteenCounters(w) / 1.3).toFixed(1);
    out.push({ id: "cantina", severity: 2, title: "Fila longa na cantina",
      what: `A fila chegou a ${w.daily.queuePeak} alunos hoje.`,
      why: `A cantina atende ${perMin} aluno(s) por minuto com ${canteenCounters(w)} balcão(ões); ${students.length} alunos chegam quase juntos no almoço.`,
      options: ["Segundo balcão de merenda (Melhorias)", "Delegar “Acompanhar fila” (+40% de ritmo)", "Contratar mais funcionários de cantina"],
      prevent: "Um segundo ponto de atendimento costuma render mais que ampliar o prédio.",
      x: canteen.x, z: canteen.z, w: footprintOf(canteen).w, d: footprintOf(canteen).d });
  }
  // sujeira
  const dirty = w.buildings.filter((b) => b.progress >= 1 && b.dirt > 55).sort((a, b) => b.dirt - a.dirt)[0];
  if (dirty) {
    const cust = w.staff.filter((m) => m.role === "custodian").length;
    out.push({ id: `sujeira-${dirty.id}`, severity: 2, title: `${roomLabelFor(dirty, w.buildings)} sujo(a)`,
      what: `Sujeira em ${Math.round(dirty.dirt)}%: higiene e satisfação caem para quem usa o ambiente.`,
      why: cust ? `${cust} zelador(es) para ${w.buildings.filter((b) => b.progress >= 1).length} ambientes; estoque de limpeza ${Math.floor(w.stock.cleaning)}.` : "A escola não tem zelador contratado.",
      options: ["Contratar zelador (Equipe)", dirty.kind === "bathroom" ? "Kit de higiene (sujeira acumula pela metade)" : "Investimento do dia: manutenção (−25 de sujeira)", "Repor material de limpeza (Estoque)"],
      prevent: "Um zelador para cada 4–5 ambientes mantém a limpeza estável.", x: dirty.x, z: dirty.z, w: footprintOf(dirty).w, d: footprintOf(dirty).d });
  }
  // conservação
  const worn = w.buildings.filter((b) => b.progress >= 1 && b.condition < 55).sort((a, b) => a.condition - b.condition)[0];
  if (worn) out.push({ id: `conserva-${worn.id}`, severity: 2, title: `${roomLabelFor(worn, w.buildings)} desgastado(a)`,
    what: `Conservação em ${Math.round(worn.condition)}%.`, why: "O uso diário desgasta os prédios; conservação baixa aumenta a chance de vazamentos.",
    options: ["Delegar “Chamar manutenção” (+20)", "Investimento do dia: manutenção (+15 em todos)"], prevent: "Manutenção preventiva a cada poucos dias reduz incidentes.",
    x: worn.x, z: worn.z, w: footprintOf(worn).w, d: footprintOf(worn).d });
  // barulho em salas sensíveis
  for (const b of w.buildings.filter((x) => x.progress >= 1 && isSensitive(x.kind))) {
    const n = noiseAt(w, b.x, b.z, undefined, { x: b.x, z: b.z });
    if (n.level > 0.55) {
      out.push({ id: `barulho-${b.id}`, severity: 1, title: `Barulho em ${roomLabelFor(b, w.buildings)}`,
        what: `Barulho ${noiseLabel(n.level)} nos horários de intervalo e atividades.`, why: n.top ? `${n.top.label} a ${Math.round(n.top.dist)} m.` : "Várias fontes próximas.",
        options: ["Paisagismo nível 2 (árvores atenuam)", "Mover a fonte de barulho para longe", "Construir salas nos fundos (lote norte)"],
        prevent: "Na prévia de construção aparece o barulho previsto.", x: b.x, z: b.z, w: footprintOf(b).w, d: footprintOf(b).d });
      break;
    }
  }
  // lixo
  if (d.litter.length > 4) {
    const l = d.litter[0];
    out.push({ id: "lixo", severity: 1, title: "Lixo no chão", what: `${d.litter.length} embalagens no chão.`, why: "Depois do intervalo e do almoço, sem coleta seletiva e com poucos zeladores, o lixo acumula.",
      options: ["Recolher em 1ª pessoa (toque no lixo)", "Contratar zelador", "Coleta seletiva"], prevent: "Lixeiras seletivas reduzem o lixo pela metade.", x: l.x, z: l.z, w: 3, d: 3 });
  }
  // matrículas travadas
  const lim = prog(w).enrollLimit;
  if (lim) out.push({ id: "matriculas", severity: 1, title: "Matrículas travadas", what: lim, why: "Novas matrículas respeitam carteiras, lugares na cantina, banheiros e professores.",
    options: ["Ampliar o recurso que está no limite"], prevent: "Cresça os serviços junto com as salas." });
  // horário
  if (phaseFor(w.minutes) === "class" && w.agents.some((a) => a.skipping)) {
    const a = w.agents.find((x) => x.skipping)!;
    out.push({ id: "fora-sala", severity: 2, title: "Aluno fora da sala", what: `${a.name} saiu durante a aula.`, why: "Ânimo baixo e falta de acompanhamento.",
      options: ["Orientar de volta à aula (ficha do aluno)", "Delegar “Conversar com um aluno”"], prevent: "Elogios e conversas mantêm o ânimo.", x: a.x, z: a.z, w: 1.5, d: 1.5 });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export interface HelpTopic { id: string; title: string; body: string[]; tags: string }
export const HELP_TOPICS: HelpTopic[] = [
  { id: "controles", title: "Controles", tags: "mouse teclado toque celular câmera mover girar zoom", body: [
    "Computador: arraste com o botão esquerdo para girar, botão direito (ou Shift + arrastar) move, roda aproxima. WASD/setas movem; F alterna 1ª pessoa; P abre o modo foto; Espaço pausa; 1–3 mudam a velocidade.",
    "Celular: um dedo gira, dois dedos movem, pinça aproxima. Toque curto seleciona; arrastar nunca compra nem seleciona. Em 1ª pessoa, o analógico fica à esquerda e o botão de ação aparece só quando há algo perto.",
  ] },
  { id: "construir", title: "Como construir", tags: "obra prévia encaixe girar porta sala encostar", body: [
    "Menu da escola → Construir → escolha o ambiente. O primeiro toque fixa a prévia; depois você pode tocar em Girar, Desfazer, Construir ou Cancelar sem mover a obra.",
    "Verde = posição válida; vermelho = inválida, com o motivo exato (Porta bloqueada, Sobreposição com outra sala, Fora do terreno). A seta amarela é a porta: 2 m à frente dela precisam ficar livres.",
    "Salas podem encostar parede com parede; o encaixe automático alinha as bordas. Nenhuma passagem interna é criada sozinha.",
    "Modo planejamento (Gabinete → Planejar) desenha obras sem gastar e mostra custo, manutenção e validade de cada uma.",
  ] },
  { id: "dinheiro", title: "Dinheiro e despesas", tags: "verba saldo salário despesa manutenção custo", body: [
    "Às 7h entra a verba pública; às 7h10 sai a folha. No fim do dia saem energia, água e manutenção das melhorias.",
    "O Boletim do dia mostra entradas e saídas por categoria e compara com o dia anterior.",
    "Melhorias têm manutenção diária: ela aparece antes da compra.",
  ] },
  { id: "pessoas", title: "Alunos, professores e horários", tags: "aluno professor turma horário aula intervalo", body: [
    "Chegada às 7h, aulas até 9h15, intervalo, aula até 11h30, almoço, aula, clubes e saída às 15h15.",
    "Cada aluno tem ficha com frequência, interesses, histórias e registros. Professores descansados faltam menos; a capacitação aumenta a habilidade.",
  ] },
  { id: "crises", title: "Manutenção e incidentes", tags: "cano energia merenda conflito professor ausente crise reparo delegar", body: [
    "Incidentes seguem etapas: identificar → decidir → executar → verificar. Cada opção mostra custo, tempo e consequência.",
    "Você pode resolver pessoalmente em 1ª pessoa (um toque, sem segurar botão) ou delegar: o funcionário caminha até o local e você acompanha a previsão.",
    "Incidentes nascem de condições reais (conservação, carga elétrica, estoque, ânimo). A dificuldade limita quantos acontecem ao mesmo tempo e dá um período de recuperação.",
  ] },
  { id: "progressao", title: "Missões, reputação e desbloqueios", tags: "missão estrela reputação desbloqueio especialização projeto", body: [
    "A reputação vai de 1,0 a 5,0 estrelas (Ensino, Higiene, Alimentação e Segurança). Toque na nota para ver o que segura a média.",
    "Três missões rápidas por dia, objetivos de vários dias com itens cosméticos, projetos em etapas e especializações combináveis.",
  ] },
  { id: "terreno", title: "Terreno e expansão", tags: "lote parcela comprar expandir muro mapa", body: [
    "A escola começa no campus original. Compre lotes vizinhos em Gabinete → Terreno: o muro acompanha a área e o trecho interno some.",
    "Construir longe do portão aumenta o tempo de caminhada: a prévia avisa e sugere corredores cobertos.",
  ] },
  { id: "raiox", title: "Raio-X da escola", tags: "raio-x fluxo barulho conforto sombra acessibilidade serviços diagnóstico", body: [
    "Botão Raio-X no canto: escolha uma camada (fluxo, acessibilidade, limpeza, barulho, conforto ou serviços). Toque no chão colorido para ver a explicação e sugestões.",
    "As camadas atualizam a cada poucos segundos, não a cada quadro.",
  ] },
];
export function searchTopics(q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return HELP_TOPICS;
  return HELP_TOPICS.filter((h) => (h.title + " " + h.tags + " " + h.body.join(" ")).toLowerCase().includes(t));
}

// preferências da ajuda (fora do save: valem para o aparelho)
const KEY = "peg-help-prefs";
interface HelpPrefs { dismissed: string[]; tips: boolean }
export function helpPrefs(): HelpPrefs {
  if (typeof window === "undefined") return { dismissed: [], tips: true };
  try { return { dismissed: [], tips: true, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { dismissed: [], tips: true }; }
}
export function saveHelpPrefs(p: HelpPrefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* armazenamento indisponível */ } }
export function dismissTip(id: string) { const p = helpPrefs(); if (!p.dismissed.includes(id)) p.dismissed.push(id); saveHelpPrefs(p); }
