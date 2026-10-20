# Jogar online sem IPv4 público

O anfitrião executa o servidor Node.js. Os outros participantes só precisam de navegador e de uma rota de rede até o anfitrião. A mesma porta TCP, por padrão **3000**, serve a interface e o WebSocket. O código de sala não atravessa NAT e não faz descoberta de servidores.

## Qual opção escolher

| Opção              | Indicação                                                   | Requisitos e limites                                                                                                                       |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Tailscale          | Recomendação para grupo privado com Windows, Linux ou macOS | Participantes entram na rede privada autorizada; funciona atrás de muitos NATs/CGNATs usando conexão direta ou retransmissão               |
| Radmin VPN         | Grupo que já usa Windows e Radmin                           | Anfitrião Windows e amigos na mesma rede Radmin; servidor no Windows simplifica o acesso                                                   |
| IPv6 global        | Grupo com conectividade IPv6 funcionando                    | Anfitrião e clientes precisam de IPv6 alcançável; regras de entrada no firewall e possíveis bloqueios do provedor precisam ser verificados |
| Servidor hospedado | Amigos abrem um link sem instalar uma rede virtual          | Hospedagem que suporte processo Node persistente e WebSocket; custos variam; precisa de HTTPS para acesso público                          |

Instalar uma rede virtual é necessário apenas nos computadores do grupo nessa modalidade. Não é necessário que cada cliente instale Node.js ou o repositório. Na alternativa de servidor hospedado com endereço público, todos acessam diretamente pelo navegador.

## Tailscale em um computador anfitrião

1. Instale o [Tailscale](https://tailscale.com/kb/1017/install) no anfitrião e nos computadores dos convidados. Configure o compartilhamento/dispositivos autorizados na rede privada.
2. No anfitrião, instale Node.js e execute `npm ci`, `npm run build` e `npm start` na pasta do projeto.
3. Veja o endereço atribuído ao anfitrião na rede Tailscale, normalmente no intervalo `100.x.x.x` ou usando MagicDNS configurado.
4. Os amigos acessam `http://IP-TAILSCALE-DO-ANFITRIAO:3000` e informam o código de sala. Não precisam abrir porta no roteador de casa.
5. Se não houver conexão, verifique se os dispositivos estão autorizados, se a política da rede permite esse acesso e se o firewall do anfitrião aceita a porta na interface/rede privada.

Esta é uma instrução para o computador do usuário. Não foi instalado um cliente VPN no ambiente cloud gerenciado. Se a aplicação ficar na nuvem, use os recursos de acesso ou VPN do provedor.

## Radmin VPN no Windows

1. Anfitrião e convidados instalam o [Radmin VPN](https://www.radmin-vpn.com/) e entram na mesma rede virtual.
2. O anfitrião instala Node.js no Windows e executa, no PowerShell, na pasta do projeto:

```powershell
npm ci
npm run build
npm start
```

3. Os amigos usam `http://IP-RADMIN-DO-ANFITRIAO:3000`, com o endereço exibido pelo Radmin, e entram na sala.
4. No firewall do Windows, autorize a porta do servidor para a rede/adaptador apropriado. Não é necessário liberar todas as portas.

O Radmin VPN tem foco em Windows. Se o servidor rodar em WSL2, o endereço/encaminhamento entre a máquina virtual e o adaptador Radmin pode exigir configuração adicional. Para a primeira sessão, executar Node diretamente no Windows evita essa etapa. Para anfitrião Linux ou macOS, a opção Tailscale costuma ser mais adequada.

## IPv6

Estar atrás de CGNAT em IPv4 não impede necessariamente um IPv6 global, mas um endereço local `fe80::` não é suficiente. O fato de o anfitrião ter IPv6 também não garante que todos os amigos consigam acessá-lo.

No Linux/macOS:

```sh
HOST=:: npm start
```

No PowerShell:

```powershell
$env:HOST = '::'
npm start
```

O navegador usa o endereço IPv6 entre colchetes: `http://[IPV6-GLOBAL-DO-ANFITRIAO]:3000`. O anfitrião precisa permitir o TCP 3000 no firewall do sistema e, quando existir, no firewall IPv6 do roteador. O provedor e a rede dos clientes também precisam permitir a comunicação.

Para exposição direta à internet, coloque HTTPS/WSS por meio da hospedagem ou de um proxy reverso e acrescente a gestão de acesso necessária. O servidor atual não implementa TLS próprio. Em uma rede privada autorizada, o acesso HTTP ao endereço virtual serve para a primeira sessão de teste.

## Diagnóstico de uma sessão

Se nem o anfitrião acessa a aplicação, verifique se o processo está rodando e se a porta está correta. A rota `/api/health` responde com `status: ok`. Se o anfitrião acessa e os convidados não, o problema está na rota de rede, endereço ou firewall. Se a página abre mas não conecta, verifique o suporte a WebSocket no caminho e, usando HTTPS, se o proxy permite WSS.

Todos devem usar o mesmo endereço de servidor. Duas pessoas executando uma cópia local criam servidores separados; o mesmo código não sincroniza essas instâncias.

O cronômetro continua mesmo se alguém se desconectar. O anfitrião pode substituir um ausente por bot no lobby ou no painel de Diplomacia durante a campanha. A substituição encerra a sessão desse jogador na partida. Se o anfitrião desconectar, outra pessoa conectada assume o controle da sala. Reconexão recupera a sessão enquanto ela não foi substituída e o servidor não foi reiniciado. Salas atuais ficam em memória: **não use ainda uma sessão de 5 horas como se ela tivesse salvamento automático**.

## O que foi verificado neste ambiente

A instalação pelo lockfile, compilação, testes de regras e uma partida com três navegadores foram verificados neste ambiente. O servidor de produção respondeu por IPv4 local e pelo loopback IPv6 `::1`, usando `HOST=::`. Acesso via Radmin, Tailscale ou IPv6 entre computadores do grupo depende das redes reais e não foi verificado daqui. O guia descreve como hospedar; não representa uma conexão externa já configurada.
