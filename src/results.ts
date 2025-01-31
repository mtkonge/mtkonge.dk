export type Result<V, E> = Ok<V> | Err<E>;

type Ok<V> = { ok: true; value: V };

type Err<E> = { ok: false; error: E };

export const Ok = <V>(value: V): Ok<V> => ({ ok: true, value });
export const Err = <E>(error: E): Err<E> => ({ ok: false, error });
