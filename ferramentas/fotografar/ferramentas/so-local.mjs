// Carregado com `node --import` ANTES do servidor da Saga (server/index.mjs), sem mexer nele:
// todo `listen(porta)` sem endereço passa a escutar só em 127.0.0.1. O servidor faz
// `servidor.listen(PORT, cb)`, que sozinho abriria a porta para a rede inteira da máquina.
import net from 'node:net';

const original = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const primeiro = args[0];
  if (typeof primeiro === 'number' || (typeof primeiro === 'string' && /^\d+$/.test(primeiro))) {
    if (typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1');
  } else if (primeiro && typeof primeiro === 'object' && !('path' in primeiro) && !primeiro.host) {
    args[0] = { ...primeiro, host: '127.0.0.1' };
  }
  return original.apply(this, args);
};
