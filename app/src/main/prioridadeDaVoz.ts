/**
 * A voz que sai não pode perder o processador para o jogo — a regra, pura e testada. Quem
 * fala com o sistema é `voz.ts`.
 *
 * O caminho da voz que sai mora inteiro DENTRO da Saga: o microfone entra pelo serviço de
 * áudio do Chromium, o filtro de ruído e o corte rodam na tela, a tela codifica, e o serviço
 * de rede manda os pacotes. O Discord faz isso num motor de voz próprio; aqui é o Chromium.
 * Medido na Saga aberta no Windows do dono (24/11/2026):
 *
 * | processo | classe | o que o Chromium faz por ele |
 * |---|---|---|
 * | serviço de áudio | normal, mas as linhas do microfone em tempo real (26) | tira do "ignorar a resolução do relógio" |
 * | GPU | **acima do normal** | o mesmo |
 * | tela (filtro, codificar) | normal; as linhas de áudio em 15, o resto em 8 | nada — a energia fica a critério do Windows |
 * | rede (os pacotes) | normal | nada |
 *
 * Com o jogo na frente, em tela cheia, o Windows dá a vez ao jogo — e o jogo roda no máximo
 * de quadros. Foi o que o Faro relatou com o WoW: a voz dele travava, e parava de travar ao
 * voltar para a Saga, que é quando a preferência troca de lado e o WoW cai para o limite de
 * quadros de segundo plano. Então, durante a call, a tela e a rede sobem para "acima do
 * normal" — o degrau em que o próprio Chromium já põe a GPU — e saem da economia de energia
 * do Windows, como o Chromium já faz com o áudio e a GPU.
 */

/** O que interessa de `app.getAppMetrics()`. */
export type Metrica = { pid: number; type: string; serviceName?: string };
export type Alvo = { pid: number; nome: 'tela' | 'rede' };

const pidValido = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

/** Os dois processos por onde a voz passa e que ninguém mais protege. */
export function alvosDaVoz(metricas: Metrica[], pidDaTela: number): Alvo[] {
  const alvos: Alvo[] = [];
  if (pidValido(pidDaTela)) alvos.push({ pid: pidDaTela, nome: 'tela' });
  const rede = metricas.find((m) => m.type === 'Utility' && m.serviceName === 'network.mojom.NetworkService');
  if (rede && pidValido(rede.pid) && rede.pid !== pidDaTela) alvos.push({ pid: rede.pid, nome: 'rede' });
  return alvos;
}

/** O número que o `os.getPriority` devolve no Windows (é a tabela da libuv), em palavras. */
export function nomeDaPrioridade(n: number): string {
  switch (n) {
    case 19: return 'ociosa';
    case 10: return 'abaixo do normal';
    case 0: return 'normal';
    case -7: return 'acima do normal';
    case -14: return 'alta';
    case -20: return 'tempo real';
    default: return String(n);
  }
}

/**
 * O PowerShell que tira os processos da economia de energia do Windows.
 *
 * É `SetProcessInformation(ProcessPowerThrottling)` com controle 5 e estado 0: o 1 diz "não
 * reduza a minha velocidade" (o EcoQoS, que joga a linha para o núcleo econômico e baixa o
 * relógio) e o 4, "não ignore o relógio fino que eu pedir" — o Windows 11 ignora o de quem
 * está coberto e mudo, e a janela coberta pelo jogo é exatamente isso. Sem o controle, quem
 * decide é a heurística do Windows, que vê a Saga atrás do jogo.
 *
 * O Node não chama a API do Windows, e por isso o PowerShell — que monta a chamada por
 * reflexão, sem compilador: medido, ~240 ms, uma vez por processo. Uma linha só, e sem aspas
 * duplas: vai como argumento do `-Command`, igual ao da atividade, e aspas duplas dentro de
 * argumento no Windows são onde as regras de escape mudam de programa para programa.
 */
export function scriptDaEnergia(pids: number[]): string | null {
  const validos = pids.filter(pidValido);
  if (!validos.length) return null;
  return [
    "$ErrorActionPreference='Stop'",
    "$a=[AppDomain]::CurrentDomain.DefineDynamicAssembly([Reflection.AssemblyName]::new('SagaVoz'),[Reflection.Emit.AssemblyBuilderAccess]::Run)",
    "$t=$a.DefineDynamicModule('SagaVoz').DefineType('K',[Reflection.TypeAttributes]'Public,Class')",
    "function Def($n,$r,$p){$m=$t.DefinePInvokeMethod($n,'kernel32.dll',[Reflection.MethodAttributes]'Public,Static,PinvokeImpl',"
      + "[Reflection.CallingConventions]::Standard,$r,[Type[]]$p,[Runtime.InteropServices.CallingConvention]::Winapi,"
      + "[Runtime.InteropServices.CharSet]::Auto);$m.SetImplementationFlags([Reflection.MethodImplAttributes]::PreserveSig)}",
    "Def 'OpenProcess' ([IntPtr]) @([UInt32],[bool],[UInt32])",
    "Def 'SetProcessInformation' ([bool]) @([IntPtr],[Int32],[UInt32[]],[UInt32])",
    "Def 'GetProcessInformation' ([bool]) @([IntPtr],[Int32],[UInt32[]],[UInt32])",
    "Def 'CloseHandle' ([bool]) @([IntPtr])",
    '$k=$t.CreateType()',
    // 0x1200 = mudar e ler informação do processo; 4 = ProcessPowerThrottling; 12 bytes =
    // versão, controle e estado. Responde o que LEU de volta, não o que pediu.
    `foreach($id in @(${validos.join(',')})){$h=$k::OpenProcess(0x1200,$false,[UInt32]$id);`
      + "if($h -eq [IntPtr]::Zero){('{0} abrir' -f $id);continue};"
      + '$ok=$k::SetProcessInformation($h,4,[UInt32[]]@(1,5,0),12);'
      + '$v=[UInt32[]]@(1,0,0);[void]$k::GetProcessInformation($h,4,$v,12);[void]$k::CloseHandle($h);'
      + "('{0} {1} {2} {3}' -f $id,$ok,$v[1],$v[2])}",
  ].join('; ');
}

/**
 * Lê a resposta do script: para cada processo, se ficou FORA da economia — o controle com o
 * bit 1 e o estado sem ele, lidos de volta do sistema.
 */
export function lerEnergia(saida: string): Map<number, boolean> {
  const feitos = new Map<number, boolean>();
  for (const linha of saida.split(/\r?\n/)) {
    const [pid, ok, controle, estado] = linha.trim().split(/\s+/);
    const n = Number(pid);
    if (!pidValido(n)) continue;
    const c = Number(controle);
    const e = Number(estado);
    feitos.set(n, ok === 'True' && Number.isInteger(c) && Number.isInteger(e) && (c & 1) === 1 && (e & 1) === 0);
  }
  return feitos;
}
