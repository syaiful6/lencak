import * as V from 'snabbdom/vnode';
import * as T from './utils';

export interface VNode<A> extends V.VNode {
  data: VNodeData<A> | undefined;
  children: Array<VNode<A> | string> | undefined;
}

export interface VNodeData<A> extends V.VNodeData {
  events?: ListenerData<A> | undefined;
  cofn?: (_: any) => any; // Coyoneda encoding, use any because we can't properly line up the type
  render?: () => VNode<any>;
  args?: any[];
  ref?: Partial<ElemRef<A>>;
}

export interface ThunkData<A> extends VNodeData<A> {
  render: () => VNode<any>;
  cofn: (_: any) => A;
  args: any[];
}

export interface Thunk<A> extends VNode<A> {
  data: ThunkData<A>;
}

export interface ThunkFn<A> {
  (sel: string, fn: Function, args: Array<any>): Thunk<A>;
  (sel: string, key: any, fn: Function, args: Array<any>): Thunk<A>;
}

export type ElemRef<A> = {
  created: (el: Element) => A | void;
  removed: (el: Element) => A | void;
}

/**
 * This is for listener modules, defined here to avoid cyclic deps
 */
export interface HandlerFn<E, A> {
  (e: E): A | void;
}

export interface HandlerObject<E, A> {
  handleEvent(e: E): A | void;
}

export type HandlerFnOrObject<E, A> = HandlerFn<E, A> | HandlerObject<E, A>;

export type ListenerData<A> = {
  [N in keyof HTMLElementEventMap]?: HandlerFnOrObject<HTMLElementEventMap[N], A>;
} & {
  [event: string]:  HandlerFnOrObject<Event, A>;
}

export function thunk<A>(
  sel: string, fn: Function, args: Array<any>
): Thunk<A>;
export function thunk<A>(
  sel: string, key: any, fn: Function, args: Array<any>
): Thunk<A>;
export function thunk<A>(sel: string, key?: any, fn?: any, args?: any): Thunk<A> {
  if (args === undefined) {
    args = fn;
    fn = key;
    key = undefined;
  }
  return V.vnode(sel, {
    key,
    cofn: T.id,
    hook: { init: thunkInit, prepatch: prepatchThunk },
    render: fn,
    args: args
  }, undefined, undefined, undefined) as Thunk<A>;
}

function isThunk(vnode: VNode<any>): vnode is Thunk<any> {
  const data = vnode.data;
  return data != null && typeof data.render === 'function' && typeof data.cofn === 'function';
}

export function mapVNode<A, B>(f: (_: A) => B, v: VNode<A>): VNode<B> {
  let data = v.data || {};
  if (isThunk(v)) {
    const ndata = T.assign({}, v.data, {
      cofn: T.o(f, data.cofn as any)
    }) as VNodeData<B>;
    return V.vnode(v.sel, ndata, v.children, v.text, v.elm as Element);
  }
  if (typeof data.cofn === 'function') {
    return V.vnode(v.sel,
      T.assign({}, data as any, {
        cofn: T.o(f, data.cofn),
        hook: {
          init: initMapHook,
          prepatch: prepatchMapHook
        }
      }),
      v.children, v.text, v.elm as Element);
  }
  return V.vnode(v.sel,
    T.assign({}, data as any, {
      cofn: f,
      hook: {
        init: initMapHook,
        prepatch: prepatchMapHook
      }
    }),
    v.children, v.text, v.elm as Element);
}

function initMapHook(vnode: VNode<any>) {
  const cur = vnode.data as VNodeData<any>;
  if (typeof cur.cofn === 'function') mutmapVNode(cur.cofn, vnode, true);
}

function prepatchMapHook(old: VNode<any>, vnode: VNode<any>) {
  initMapHook(vnode);
}

function runThunk(thunk: Thunk<any>) {
  const cur = thunk.data as VNodeData<any>;
  let vnode = (cur.render as any).apply(undefined, cur.args);
  mutmapVNode(cur.cofn as any, vnode, false);
  return vnode;
}

function thunkInit(thunk: VNode<any>) {
  let vnode = runThunk(thunk as Thunk<any>);
  copyToThunk(vnode, thunk);
}

function prepatchThunk(oldVnode: VNode<any>, thunk: VNode<any>) {
  let i: number, old = oldVnode.data as VNodeData<any>, cur = thunk.data as VNodeData<any>;
  const oldArgs = old.args, args = cur.args;
  if (old.render !== cur.render || (oldArgs as any).length !== (args as any).length) {
    copyToThunk(runThunk(thunk as Thunk<any>), thunk);
    return;
  }
  for (i = 0; i < (args as any).length; ++i) {
    if ((oldArgs as any)[i] !== (args as any)[i]) {
      copyToThunk(runThunk(thunk as Thunk<any>), thunk);
      return;
    }
  }
  copyToThunk(oldVnode, thunk);
}

export function mutmapVNode<A, B>(f: (_: A) => B, v: VNode<A>, parent: boolean): void {
  let data = v.data || {};
  if (isThunk(v)) {
    (v as any).data.cofn = T.o(f, data.cofn as any);
    return;
  }
  if (typeof data.cofn === 'function' && !parent) {
    (v as any).data.cofn = T.o(f, data.cofn);
    return;
  }
  if (data && data.events) {
    let nevents: ListenerData<B> = {};
    for (let key in data.events) {
      nevents[key] = pipeEvHandler(data.events[key], f);
    }
    (v.data as any).events = nevents;
  }
  if (data && data.ref) {
    let nref: Partial<ElemRef<B>> = {};
    if (data.ref.created != null) {
      nref.created = T.o(mapUndef(f), data.ref.created);
    }
    if (data.ref.removed != null) {
      nref.removed = T.o(mapUndef(f), data.ref.removed);
    }
    (v.data as any).ref = nref;
  }
  v.children = v.children != undefined ? v.children.map(c => {
    if (typeof c === 'string') return c;
    mutmapVNode(f, c, false);
    return c;
  }) : undefined;
}

function copyToThunk(vnode: VNode<any>, thunk: VNode<any>): void {
  thunk.elm = vnode.elm;
  (vnode.data as VNodeData<any>).render = (thunk.data as VNodeData<any>).render;
  (vnode.data as VNodeData<any>).args = (thunk.data as VNodeData<any>).args;
  (vnode.data as VNodeData<any>).cofn = (thunk.data as VNodeData<any>).cofn;
  thunk.data = vnode.data;
  thunk.children = vnode.children;
  thunk.text = vnode.text;
  thunk.elm = vnode.elm;
}

export function runEvHandler<E, A>(handler: HandlerFnOrObject<E, A>, event: E): A | void {
  if (typeof handler === 'function') {
    return handler(event);
  } else if (handler && typeof handler.handleEvent === 'function') {
    return handler.handleEvent(event);
  }
}

class PipeEventHandler<E, A, B> {
  constructor(
    private listener: HandlerFnOrObject<E, A>,
    private transform: HandlerFnOrObject<A, B>
  ) {
  }

  handleEvent(ev: E): B | void {
    let t = runEvHandler(this.listener, ev);
    if (t != null) {
      return runEvHandler(this.transform, t);
    }
  }
}

export function pipeEvHandler<E, A, B>(
  f: HandlerFnOrObject<E, A>,
  g: HandlerFnOrObject<A, B>
): HandlerFnOrObject<E, B> {
  return new PipeEventHandler(f, g);
}

export function mapUndef<A, B>(f: (_: A) => B): (x: A | void) => B | void {
  return x => x != null ? f(x) : x as any;
}
