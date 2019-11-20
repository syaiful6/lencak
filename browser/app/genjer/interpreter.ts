import {Either, isLeft} from '@jonggrang/prelude';
import {EventQueue, Loop, stepper, withCont} from './event-queue';

export function mergeInterpreter<F, G, I>(lhs: EventQueue<F, I>, rhs: EventQueue<G, I>): EventQueue<Either<F, G>, I> {
  return (queue) => {
    function tick(ls: Loop<F>, rs: Loop<G>): Loop<Either<F, G>> {
      return {loop: update(ls, rs), tick: commit(ls, rs)};
    }

    function update(ls: Loop<F>, rs: Loop<G>) {
      return function (e: Either<F, G>): Loop<Either<F, G>> {
        return isLeft(e) ? tick(ls.loop(e.value), rs) : tick(ls, rs.loop(e.value));
      };
    }

    function commit(ls: Loop<F>, rs: Loop<G>): () => Loop<Either<F, G>> {
      return () => tick(ls.tick(), rs.tick())
    }

    return tick(lhs(queue), rhs(queue));
  };
}

export function interpretNever<A>(): EventQueue<never, A> {
  return stepper(() => { throw new Error('never interpreter received input') });
}

export function liftCont<F, I>(k: (fi: F, c: (j: I) => void) => void): EventQueue<F, I> {
  return withCont((queue, f) => {
    k(f, j => {
      queue.push(j);
      queue.run();
    });
  });
}
