import type { Membro } from '../api';

/** Como o membro aparece: identificador antes, e arco-íris se for Turbo. */
export function Nome({ membro, nome, id, turbo }: {
  membro?: Pick<Membro, 'nome' | 'idExibido' | 'turbo'>;
  nome?: string;
  id?: string | null;
  turbo?: boolean;
}) {
  const texto = membro?.nome ?? nome ?? '';
  const identificador = membro?.idExibido ?? id ?? null;
  const ehBerserk = membro?.turbo ?? turbo ?? false;

  return (
    <>
      {identificador && <span className={`id-do-membro ${ehBerserk ? 'berserk' : ''}`}>{identificador}</span>}
      <span className={ehBerserk ? 'nome-berserk' : undefined}>{texto}</span>
    </>
  );
}
