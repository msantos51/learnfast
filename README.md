# Mapa de Compassos

Plataforma para aprender músicas a partir de ficheiros Guitar Pro. Carregas o ficheiro e o site:

- divide a música pelas **secções** marcadas no ficheiro (Intro, Verso, Refrão…);
- deteta o **tom de cada compasso** e mostra-o num quadrado com a **cor da nota** (convenção Boomwhackers: Dó vermelho … Si rosa);
- mostra a **tablatura** sincronizada e toca a música, com **loop por secção**, velocidade de 25 % a 150 %, metrónomo, contagem e "tocar por cima" (silencia a tua pista);
- deixa **editar** tudo (tons, nomes, dividir e juntar secções) e **copiar para o Excel**.

Os ficheiros são lidos só no browser: nada é enviado para um servidor.

## Começar

Precisas do Node.js 22.

```bash
npm install
npm run dev        # servidor local em http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes (deteção dos acordes, notas, exportação) |
| `npm run typecheck` | Verifica os tipos TypeScript |
| `npm run build` | Gera o site em `dist/` |
| `npm run preview` | Serve o `dist/` localmente |

## Estrutura

```
index.html                 Página principal (estrutura e ícones)
licencas.html              Termos, privacidade e licenças
src/
  main.ts                  Interface: esquema, linha temporal, leitor, ajustes
  fonts.ts                 Fontes alojadas no site (Fontsource)
  styles.css               Estilos (tokens de cor, modo claro e escuro)
  analysis/
    analyze.ts             Deteção do tom por compasso e secções (módulo puro, testado)
    parse.ts               Leitura dos ficheiros, com recurso a Windows-1252 nos GP3–GP5
  app/
    notes.ts               Nome escrito → nota (A, F#m, Dó, Sib…) para as cores
    export.ts              Exportar para Excel e texto
    sync.ts                Atraso do cursor/esquema para compensar a latência do áudio
tests/                     Testes (Vitest) e ficheiro .gp5 de exemplo
scripts/
  copy-alphatab.mjs        Copia o alphaTab, a fonte e os sons para public/vendor
  make-fixture.py          Gera o .gp5 de teste (precisa de `pip install pyguitarpro`)
```

### Como funciona a deteção

Para cada compasso soma a duração de cada nota (das pistas escolhidas) por classe de nota, dá mais peso à
nota mais grave de cada tempo, à pista de baixo e ao início do compasso, e compara com modelos de acorde
maior, menor e power chord. Se o ficheiro tiver acordes escritos, usa esses.

### alphaTab

A leitura dos ficheiros, a tablatura e o som usam o [alphaTab](https://alphatab.net) (MPL-2.0). É servido como
script clássico a partir de `public/vendor/alphatab` (criado pelo `npm run vendor`, que corre antes do `dev`
e do `build`), porque os workers do leitor reabrem esse mesmo ficheiro. A fonte Bravura (OFL) e o banco de
sons Sonivox (Apache 2.0) vêm no pacote do alphaTab; o script copia também os textos das licenças.

### Fontes

Unbounded, Manrope e JetBrains Mono (OFL) vêm do [Fontsource](https://fontsource.org) e são servidas pelo próprio
site (`src/fonts.ts`). Não há pedidos a servidores de terceiros, o que evita enviar o IP de quem visita à Google.

## Termos, privacidade e licenças

A página `licencas.html` (ligada no rodapé) tem os termos de utilização, a nota de privacidade e as licenças de
todos os componentes de terceiros. Se acrescentares uma dependência que vá para o site, acrescenta-a lá.

O código deste repositório é © 2026 Miguel Santos, todos os direitos reservados (ver `LICENSE`).

## Publicação

Cada push para a `main` publica o site no GitHub Pages (`.github/workflows/deploy.yml`).
Na primeira vez, ativa em **Settings → Pages → Source: GitHub Actions**.

Cada PR corre os testes, a verificação de tipos e o build (`.github/workflows/ci.yml`).
