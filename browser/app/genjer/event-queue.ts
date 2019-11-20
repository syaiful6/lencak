export type Loop<I> = {
  loop: (i: I) => Loop<I>;
  tick: () => Loop<I>;
}

export type EventQueueInstance<O> = {
  run: () => void;
  push: (o: O) => void;
}

export type EventQueue<I, O> = (o: EventQueueInstance<O>) => Loop<I>;

export type EventQueueAccum<S, I> = {
  init: S;
  update: (s: S, i: I) => S;
  commit: (s: S) => S;
}

export function stepper<I, O>(k: (i: I) => O): EventQueue<I, O> {
  return (next) => {
    function tick(): Loop<I> {
      return {loop, tick};
    }

    function loop(i: I): Loop<I> {
      next.push(k(i));
      next.run();
      return {loop, tick};
    }

    return tick();
  };
}

export function withCont<I, O>(k: (eo: EventQueueInstance<O>, i: I) => void): EventQueue<I, O> {
  return (next) => {
    function tick(): Loop<I> {
      return {loop, tick};
    }

    function loop(i: I): Loop<I> {
      k(next, i);
      return {loop, tick};
    }

    return tick();
  };
}

export function withAccum<S, I, O>(specFn: (ei: EventQueueInstance<O>) => EventQueueAccum<S, I>): EventQueue<I, O> {
  return (next) => {
    const spec = specFn(next);
    function tick(s: S) {
      return {
        loop: (i: I) => update(s, i),
        tick: commit(s)
      };
    }
    function update(s: S, i: I) {
      return tick(spec.update(s, i));
    }
    function commit(s: S) {
      return () => tick(spec.commit(s));
    }
    return tick(spec.init);
  };
}

export function withAccumArray<I, O>(specFn: (ei: EventQueueInstance<O>) => (i: I[]) => void): EventQueue<I, O>{
  return withAccum(next => {
    const spec = specFn(next);
    function update(b: I[], i: I) {
      let b2 = b.slice();
      b2.push(i);
      return b2;
    }
    function commit(buf: I[]) {
      spec(buf);
      return [];
    }
    return {commit, update, init: []};
  });
}

export function fix<I>(proc: EventQueue<I, I>): EventQueueInstance<I> {
  let queue: I[] = [];
  let machine: Loop<I> | null = null;

  function push(i: I): void {
    let ys = queue.slice();
    ys.push(i);
    queue = ys;
  }

  function run(): void {
    let current = machine;
    machine = null;
    if (current != null) loop(current);
  }

  function loop(mc: Loop<I>): void {
    while (true) {
      if (queue.length > 0) {
        let head = queue[0];
        queue = queue.slice(1);
        mc = mc.loop(head)
      } else {
        let st = mc.tick();
        if (queue.length === 0) {
          machine = st;
          queue = [];
          return;
        }
        mc = st;
      }
    }
  }

  const inst: EventQueueInstance<I> = {run, push};
  machine = proc(inst);

  return inst;
}
