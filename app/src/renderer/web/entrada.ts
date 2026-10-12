// A Saga no navegador: a ponte primeiro, o app depois. A ordem dos imports é a ordem em que
// os módulos rodam — e há módulos do app que leem `window.desktop` ao carregar.
import './navegador';
import '../src/main';
