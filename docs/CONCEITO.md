# Concórdia — direção de jogo na v0.3

## Da conquista à governança

A sessão continua voltada a 3–8 pessoas, entre a leitura rápida de Risk/War e decisões selecionadas de Grand Strategy. Ordens são simultâneas; alianças ajudam, mas podem ser rompidas. A ambientação usa a Terra e nações por volta de 1550, com territórios e instituições simplificados.

A v0.3 troca os quatro legados percentuais por dois resultados explícitos: **Dominação Total** e **Pacificação Imperial**. Economia, religião e comércio deixam de pontuar vitórias isoladas; passam a sustentar guerra, negociação e formação de um conselho imperial.

## Escolhas que podem ser experimentadas

- **Governar ou ocupar:** tomar uma cidade inimiga gera ocupação. O tratado decide se a propriedade muda; integração e revolta continuam importando.
- **Compor e posicionar:** infantaria protege canhões, cavalaria procura terreno aberto e frotas levam exércitos a outras costas. Moral, treinamento e suprimento limitam a força bruta.
- **Construir e mobilizar:** cidade e batalhão possuem ordens próprias. Um mercado pode ser construído enquanto seu exército marcha.
- **Declarar ou negociar:** guerra formal convoca aliados e causa desgaste. Termos de paz produzem efeitos duradouros, incluindo submissão e religião estatal.
- **Dissuadir ou conquistar:** o Imperador pode ameaçar uma retaliação coletiva. O contador de paz considera o mundo inteiro, incluindo guerras fora da Dieta.
- **Converter ou tolerar:** as quatro doutrinas afetam exércitos, infraestrutura e receitas. Cidades Sagradas recolhem dízimos globais; conversão rápida cria tensão.

As crenças Sol Invictus, Conclave Mercante, Sínodo Reformado e Tradição Ancestral são abstrações fictícias de jogo. Não representam atributos inerentes de povos ou religiões reais. Os nomes históricos das nações e a cartografia atual agrupada não tornam o cenário uma simulação histórica precisa.

## Escopo e duração

Rápido usa um teatro de 16 terras: Europa, Américas ou Ásia/Pacífico. Campanha usa os três mais MENA/África, com 56 terras e 13 zonas marítimas. Escolher um teatro desloca nações cuja sede histórica não pertence ao tabuleiro.

Os limites de planejamento são 60 minutos no Rápido e cinco horas na Campanha. Confirmação antecipada e vitória antes do limite encurtam a sessão. Essas durações precisam ser medidas com pessoas; bots não negociam em tempo real.

## Mesa de comando

A HUD ocupa a janela inteira. Cidades e formações têm alvos de clique distintos. Janelas desanexáveis permitem montar uma mesa com administração, exército, diplomacia, Dieta e relatórios abertos ao mesmo tempo. O replay e o som apresentam os eventos já resolvidos pelo servidor; não influenciam a matemática.

Os relatórios JSON e TXT permitem examinar todas as rodadas, guerras, baixas, economia e eleições. O objetivo é usar evidência de partidas para orientar próximos ajustes. Os bots têm prioridades diferentes e não substituem um playtest humano.

## Arquitetura

O cliente web oferece acesso simples por navegador, incluindo celulares. O servidor recebe comandos JSON e mantém o estado autoritativo. Nenhuma regra exige React, SVG ou DOM; uma interface Godot futura pode consumir os mesmos dados e eventos.

As campanhas são salvas em disco e podem ser retomadas após queda. Arquivos v0.2 são preservados e migrados; o mapa antigo permanece nessas campanhas para evitar redistribuir territórios já conquistados.

## Evoluções que ainda não fazem parte desta versão

- Névoa de guerra e inteligência com informação parcial.
- Mapas e fronteiras verdadeiramente históricos por data.
- Cliente nativo Godot com apresentação própria.
- Transporte de múltiplos batalhões por frota e rotas comerciais marítimas explícitas.
- Ferramentas de modificação de cenários e geração de nações pelo usuário.

Essas ideias não são requisitos funcionais pendentes da v0.3 entregue; definem expansões além do escopo atual.
