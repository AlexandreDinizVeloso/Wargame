# Cartografia da v0.3

## Fonte e direitos

A geometria foi derivada de [Natural Earth, Admin 0 — Countries, escala 1:110m](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/). Os dados do Natural Earth são de **domínio público**. A fonte exata usada pelo gerador está em `scripts/generate-map.py`, no repositório `nvkelso/natural-earth-vector`.

O resultado incorporado em `shared/world-geometry.json` permite executar o jogo offline, sem buscar mapas ou tiles durante uma partida. Não é necessária chave de provedor cartográfico.

## Agrupamento e projeção

- Europa: 16 regiões; Américas: 16; Ásia/Pacífico: 16; MENA/África: oito.
- Os países atuais são unidos ou cortados em regiões grandes de jogo. O cenário usa nomes e temas de 1550, mas os limites são uma abstração cartográfica moderna.
- A projeção é equiretangular: `x = (longitude+180)×4`, `y = (85−latitude)×4`. Os polígonos mantêm coordenadas do mundo, não pixels de tela.
- Cada região pode ter vários anéis exteriores, como ilhas. O contrato envia `rings` e `path`, além do centro representativo e vizinhos. O cliente web usa esses anéis para desenhar o mapa e suas camadas.
- Treze zonas marítimas agrupam rotas oceânicas. Sua forma é indicativa de navegação; não pretende representar fronteiras marítimas ou costa hidrográfica exata.

Vizinhanças terrestres vêm da proximidade de contornos e travessias estratégicas curtas explicitadas no gerador: Canal da Mancha, estreitos nórdicos, Grécia/Anatólia, Japão/Coreia/China, Malaia/Arquipélagos, Caribe e Bering. Essas ligações permitem uma abstração continental jogável. Travessias oceânicas longas usam transporte naval. O grafo é recíproco e passa por testes de conectividade.

## Regenerar

A regeneração é opcional; o jogo usa o JSON já incluído. Em um ambiente com Python e Shapely:

```sh
python3 -m pip install shapely
python3 scripts/generate-map.py
npx prettier --write shared/world-geometry.json
```

O gerador baixa a fonte pública para um cache temporário, usa uniões/cortes de polígonos, simplifica vértices e grava a geometria. A configuração de custos, terrenos, recursos, mares e escopo fica em `shared/map.ts`.
