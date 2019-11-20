import {Module} from 'snabbdom/modules/module';
import { Either, left, right } from '@jonggrang/prelude';
import {Loop, EventQueue, withAccum, fix} from './event-queue';
import {initRender} from './snabbdom';
import {Transition, Batch} from './types';
import {assign, recordValues} from './utils';
import {VNode} from './vnode';

export interface App<F, G, S, A> {
  render: (model: S) => VNode<A>;
  update: (model: S, action: A) => Transition<F, S, A>;
  subs: (model: S) => Batch<G, A>;
  init: Transition<F, S, A>;
}

export interface AppInstance<S, A> {
  push: (a: A) => void;
  run: () => void;
  snapshot: () => S;
  restore: (s: S) => void;
  subscribe: (f: (c: AppChange<S, A>) => void) => () => void;
}

export interface AppChange<S, A> {
  old: S;
  action: A;
  model: S;
}

export const enum AppActionType {
  RESTORE,
  ACTION,
  INTERPRET
}

export type AppAction<M, Q, S, I>
  = { tag: AppActionType.RESTORE; payload: S }
  | { tag: AppActionType.ACTION; payload: I }
  | { tag: AppActionType.INTERPRET; payload: Either<M, Q> };

type AppState<M, Q, S> = {
  model: S;
  needsRender: boolean;
  interpret: Loop<Either<M, Q>>;
  snabbdom: (s: S) => void;
};

export type MakeAppOptions = {
  modules: Partial<Module>[];
}

export function makeAppQueue<M, Q, S, I>(
  onChange: (c: AppChange<S, I>) => void,
  interpreter: EventQueue<Either<M, Q>, I>,
  app: App<M, Q, S, I>,
  el: Element,
  options?: Partial<MakeAppOptions>
): EventQueue<AppAction<M, Q, S, I>, AppAction<M, Q, S, I>> {
  return withAccum(self => {
    const opts: Partial<MakeAppOptions> = options || {};
    function pushAction(a: I) {
      return self.push({ tag: AppActionType.ACTION, payload: a });
    }
    function pushEffect(ef: M) {
      return self.push({ tag: AppActionType.INTERPRET, payload: left(ef) });
    }
    function runSubs(lo: Loop<Either<M, Q>>, subs: Q[]) {
      for (let i = 0, len = subs.length; i < len; i++) {
        lo = lo.loop(right(subs[i]));
      }
      return lo;
    }
    function update(state: AppState<M, Q, S>, action: AppAction<M, Q, S, I>): AppState<M, Q, S> {
      let next: Transition<M, S, I>,
        needsRender: boolean,
        nextState: AppState<M, Q, S>,
        appChange: AppChange<S, I>;
      switch(action.tag) {
      case AppActionType.INTERPRET:
        return assign({}, state, {
          interpret: state.interpret.loop(action.payload)
        });

      case AppActionType.ACTION:
        next = app.update(state.model, action.payload);
        needsRender = state.needsRender || state.model !== next.model;
        nextState = assign({}, state, {
          needsRender,
          model: next.model
        });
        appChange = {old: state.model, action: action.payload, model: nextState.model};
        onChange(appChange);
        forInFn(next.effects, pushEffect);
        return nextState;

      case AppActionType.RESTORE:
        needsRender = state.needsRender || state.model !== action.payload;
        nextState = assign({}, state, {needsRender, model: action.payload});
        return nextState;
      }
    }

    function commit(state: AppState<M, Q, S>): AppState<M, Q, S> {
      if (state.needsRender) {
        state.snabbdom(state.model);
      }
      const tickInterpret = runSubs(state.interpret, app.subs(state.model));
      return {
        snabbdom: state.snabbdom,
        model: state.model,
        interpret: tickInterpret,
        needsRender: false,
      };
    }

    function emit(a: I) {
      pushAction(a);
      self.run();
    }

    const snabbdom = snabbdomStep(emit, app.render, app.init.model, el, opts.modules || []);
    const it2  = interpreter(assign({}, self, {push: (e: I) => self.push({tag: AppActionType.ACTION, payload: e})}));
    forInFn(app.init.effects, pushEffect);
    let st: AppState<M, Q, S> = {
      snabbdom,
      interpret: it2,
      needsRender: false,
      model: app.init.model
    };
    return {update, commit, init: st}
  });
}

interface SubscriptionState<S, I> {
  fresh: number;
  cbs: Record<string, (_: AppChange<S, I>) => void>;
}

export function make<M, Q, S, I>(
  interpreter: EventQueue<Either<M, Q>, I>,
  app: App<M, Q, S, I>,
  el: Element,
  options?: Partial<MakeAppOptions>
): AppInstance<S, I> {
  let subs: SubscriptionState<S, I> = {fresh: 0, cbs: {}};
  let state: S = app.init.model;

  function handleChange(ac: AppChange<S, I>): void {
    state = ac.model;
    let fns = recordValues(subs.cbs);
    for (let i = 0, len = fns.length; i < len; i++) {
      fns[i](ac);
    }
  }

  function subscribe(cb: (_: AppChange<S, I>) => void): () => void {
    let nkey = subs.fresh.toString();
    subs.fresh = subs.fresh + 1;
    subs.cbs[nkey] = cb;

    return () => {
      delete subs.cbs[nkey];
    };
  }

  let queue = fix(makeAppQueue(handleChange, interpreter, app, el, options));

  return {
    subscribe,
    push: (i: I) => queue.push({tag: AppActionType.ACTION, payload: i }),
    snapshot: () => state,
    restore: (s: S) => queue.push({tag: AppActionType.RESTORE, payload: s}),
    run: queue.run,
  }
}

function snabbdomStep<I, S>(
  emit: (_: I) => void,
  render: (model: S) => VNode<I>,
  init: S,
  el: Element,
  modules: Partial<Module>[]
): (_: S) => void {
  let snab = renderStep(initRender(emit, modules), render, el);
  snab(init);
  return snab;
}

function forInFn<A, B>(xs: A[], f: (a: A) => void): void {
  for (let i = 0, len = xs.length; i < len; i++) {
    f(xs[i]);
  }
}

const enum RenderStep {
  NOREQUEST,
  PENDINGREQUEST,
  EXTRAREQUEST
}

function renderStep<A, S>(
  patch: (old: VNode<A> | Element, vnode: VNode<A>) => VNode<A>,
  render: ( model: S) => VNode<A>,
  root: Element
) {
  let old: VNode<A> | Element = root;
  let state: RenderStep = RenderStep.NOREQUEST;
  let nextModel: S;
  function update() {
    switch (state) {
      case RenderStep.NOREQUEST:
        throw new Error('Unexpected draw callback.\n');

      case RenderStep.PENDINGREQUEST:
        requestAnimationFrame(update);
        state = RenderStep.EXTRAREQUEST;
        old = patch(old, render(nextModel));
        break;

      case RenderStep.EXTRAREQUEST:
        state = RenderStep.NOREQUEST;
        break;
    }
  }

  return function step(s: S) {
    if (state === RenderStep.NOREQUEST) {
      requestAnimationFrame(update);
    }
    state = RenderStep.PENDINGREQUEST;
    nextModel = s;
  };
}
