const paths: Record<string, string> = {
  speaker: 'M3 10v4h4l5 4V6L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z',
  mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z',
  micOff: 'M19 11h-2a5 5 0 0 1-.6 2.4l1.5 1.5A7 7 0 0 0 19 11zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.4 2.7l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a6.9 6.9 0 0 0 2.4-.8l4.3 4.3 1.3-1.3zM15 11V5a3 3 0 0 0-6 0v.2l6 6z',
  head: 'M12 3a8 8 0 0 0-8 8v6a3 3 0 0 0 3 3h2v-7H6v-2a6 6 0 0 1 12 0v2h-3v7h2a3 3 0 0 0 3-3v-6a8 8 0 0 0-8-8z',
  headOff: 'M12 3a8 8 0 0 0-8 8v6a3 3 0 0 0 3 3h2v-7H6v-2a6 6 0 0 1 12 0v2h-3v7h2a3 3 0 0 0 3-3v-6a8 8 0 0 0-8-8zM3 3l18 18-1.4 1.4L1.6 4.4z',
  camera: 'M4 6h11a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  screen: 'M3 5h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 2-4 4h3v4h2v-4h3z',
  hangup: 'M12 9c-2.7 0-5.2.6-7.4 1.7-.5.3-.7.9-.5 1.4l.9 2.1c.2.5.8.7 1.3.5l2.4-1c.5-.2.7-.7.6-1.2l-.2-1.2a10 10 0 0 1 5.8 0l-.2 1.2c-.1.5.1 1 .6 1.2l2.4 1c.5.2 1.1 0 1.3-.5l.9-2.1c.2-.5 0-1.1-.5-1.4A16 16 0 0 0 12 9z',
  gear: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3H9l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1L9 21h6l.4-2.7a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  pessoas: 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  // O S da Saga: a marca do Berserk é a marca do app, não um símbolo à parte. Os oito
  // vértices saíram da própria logo — o desenho foi lido em grade e convertido —, então
  // as duas mordidas e a inclinação são as de lá, não uma imitação de olho. Cheio e sem
  // detalhe: ele vive a 13 px ao lado do nome, e ali só sobrevive silhueta densa.
  berserk: 'M13.7 1 L20.7 4.7 L12.2 8.8 L21.2 16.1 L12.7 23 L8.8 23 L12.2 15.2 L2.9 7.9 Z',
  // Clipe de papel: é o que se reconhece como anexo em qualquer lugar.
  anexo: 'M16.5 6.5v8.75a4.25 4.25 0 0 1-8.5 0V5.75a2.75 2.75 0 0 1 5.5 0v9a1.25 1.25 0 0 1-2.5 0V6.5H9.5v8.25a2.75 2.75 0 0 0 5.5 0v-9a4.25 4.25 0 0 0-8.5 0v9.5a5.75 5.75 0 0 0 11.5 0V6.5h-1.5z',
  texto: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z',
  send: 'M2 21l21-9L2 3v7l15 2-15 2z',
  expandir: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
  // Alto-falante cortado: o som da live desligado por quem assiste.
  speakerOff: 'M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z',
  // Moldura com cantos: preencher o quadro com a imagem, cortando as bordas.
  aspecto: 'M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z',
  // Mais, dentro de um círculo: "juntar alguma coisa aqui". É o gesto que o pessoal já
  // reconhece na esquerda de um campo de conversa — anexar, sem precisar da palavra.
  mais: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 9h4v2h-4v4h-2v-4H7v-2h4V7h2z',
  // Olho: quem está ASSISTINDO. O mesmo desenho que todo mundo usa para "ver" — aqui não
  // é hora de inventar símbolo, ele aparece a 13 px ao lado de um nome.
  olho: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  // Cadeado fechado: a sala que só alguns cargos veem. Pequeno e cheio, porque vive a
  // 13 px no fim da linha da sala.
  cadeado: 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3zm0 11a1.5 1.5 0 0 1 .5 2.9V19h-1v-1.1A1.5 1.5 0 0 1 12 15z',
  // Seta para baixo sobre uma linha: SALVAR no disco. O anexo do chat não abre — ele vai
  // para onde a pessoa escolher, pelo diálogo do sistema.
  baixar: 'M11 3h2v9.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4L11 12.2V3zM5 19h14v2H5z',
  // Moldura com foto: é o que se reconhece como "mandar imagem" num campo de conversa.
  gif: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zM8.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 17l3-4 2 2.5L15 12l3 5H7z',
  // Controle de videogame: os jogos. Ao lado do nome de quem está jogando ele é o botão que
  // leva à partida — como o selo AO VIVO de quem transmite.
  controle: 'M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
  // Uma pessoa com um "+": convidar. É gente que chega, não um objeto que se cria — por
  // isso não é o `mais` genérico.
  convidar: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  // Um quadro com a seta saindo dele: mandar a live para FORA da Saga, por cima do jogo.
  // É o mesmo desenho que todo mundo reconhece como "abrir noutra janela" — aqui não é
  // hora de inventar símbolo, ele vive a 17 px na barra do quadro flutuante.
  paraFora: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z',
  // Seta saindo por uma porta: sair do servidor.
  sair: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
