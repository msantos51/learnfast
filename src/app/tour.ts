// Tutorial para quem abre o site pela primeira vez: alguns passos, cada um a destacar uma parte do ecrã.

export interface TourStep {
  title: string;
  text: string;
  /** Elementos a destacar, por ordem de preferência (usa o primeiro que estiver visível). */
  targets?: string[];
}

export const TOUR_KEY = 'mapa:tour-visto';

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Bem-vindo ao Mapa de Compassos',
    text: 'Carregas um ficheiro Guitar Pro e vês a música dividida por secções e compassos, com o tom de cada compasso numa cor. Depois praticas parte a parte, com a tablatura a acompanhar. Mostro-te tudo em 1 minuto.',
  },
  {
    title: 'Carrega a tua música',
    text: 'Aceita ficheiros Guitar Pro (.gp3, .gp4, .gp5, .gpx, .gp) e MusicXML. Também podes arrastar o ficheiro para a página. O ficheiro é lido só no teu browser.',
    targets: ['label.btn.primary[for="fileInput"]'],
  },
  {
    title: 'As tuas músicas ficam guardadas',
    text: 'Cada música que carregas fica em “As minhas músicas”, neste browser, com as tuas correções. Da próxima vez abre logo a última.',
    targets: ['#libraryBtn'],
  },
  {
    title: 'Escolhe o teu instrumento',
    text: 'O tom de cada compasso é detetado a partir do instrumento escolhido. Se a música tiver baixo, começa por ele.',
    targets: ['.top-actions .track-pick'],
  },
  {
    title: 'O esquema da música',
    text: 'Cada quadrado é um compasso, com a cor da nota (Dó vermelho, Ré laranja, Mi amarelo…). Toca num compasso para ir para lá; “Praticar” repete a secção em loop. Se o tom não estiver certo, podes corrigi-lo.',
    targets: ['#chart .section', '#chart'],
  },
  {
    title: 'A tablatura acompanha',
    text: 'Clica num compasso da tablatura e escolhe “Expandir” para o ver em grande, com a contagem (1 & 2 & 3 & 4 &) por baixo, ou “Loop” para o repetir.',
    targets: ['.tabpanel', '#vTab'],
  },
  {
    title: 'O leitor',
    text: 'Tocar, compasso anterior e seguinte, velocidade, loop, metrónomo, contagem e “tocar por cima” (silencia o teu instrumento) ou “só o meu” (ouves só o teu instrumento). No computador, Espaço toca e pausa.',
    targets: ['#dock'],
  },
  {
    title: 'Pronto!',
    text: 'Podes rever este tutorial ou ler o guia completo em “Como funciona”, no ícone “?” lá em cima.',
    targets: ['#helpBtn'],
  },
];

export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; }
}
export function markTourSeen(): void {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* sem armazenamento */ }
}

/** Primeiro destino visível no ecrã (ou null para um passo centrado). */
export function visibleTarget(step: TourStep, doc: Document = document): HTMLElement | null {
  for (const sel of step.targets ?? []) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el && el.offsetParent !== null && el.getClientRects().length) return el;
  }
  return null;
}
